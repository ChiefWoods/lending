import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { LendingClient } from "../LendingClient";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getSetup, resetAccounts } from "../setup";
import { Program } from "@coral-xyz/anchor";
import { Lending } from "../../target/types/lending";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { WBTC_USD_PRICE_UPDATE_V2, WBTC_MINT_DECIMALS } from "../constants";
import { Surfpool } from "../surfpool";

describe("initializeReserve", () => {
  let client: LendingClient;
  let program: Program<Lending>;
  let connection: Connection;

  let marketAuthority: Keypair;
  let marketPda: PublicKey;

  let collateralMint: PublicKey;
  const collateralMintPriceUpdateV2 = WBTC_USD_PRICE_UPDATE_V2;

  beforeEach(async () => {
    marketAuthority = Keypair.generate();

    ({ client } = await getSetup([
      {
        publicKey: marketAuthority.publicKey,
      },
    ]));

    program = client.program;
    connection = client.connection;

    collateralMint = await Surfpool.initMint({
      decimals: WBTC_MINT_DECIMALS,
    });

    // initializes a market
    const name = "Test Market";

    await program.methods
      .initializeMarket(name)
      .accounts({
        authority: marketAuthority.publicKey,
      })
      .signers([marketAuthority])
      .rpc();

    marketPda = LendingClient.getMarketPda(name);
  });

  test("initialize a reserve", async () => {
    const optimalUtilizationRateBps = 7500; // 75%
    const loanToValueBps = 8000; // 80%
    const liquidationBonusBps = 200; // 2%
    const liquidationThresholdBps = 8500; // 85%
    const liquidationCloseFactorBps = 1000; // 10%
    const minBorrowRateBps = 200; // 2%
    const optimalBorrowRateBps = 2000; // 20%
    const maxBorrowRateBps = 8000; // 80%
    const flashLoanFeeBps = 500; // 5%
    const platformFeeBps = 250; // 2.5%
    const priceUpdateV2 = collateralMintPriceUpdateV2;

    await program.methods
      .initializeReserve({
        flashLoanFeeBps,
        liquidationBonusBps,
        liquidationCloseFactorBps,
        liquidationThresholdBps,
        loanToValueBps,
        maxBorrowRateBps,
        minBorrowRateBps,
        optimalBorrowRateBps,
        optimalUtilizationRateBps,
        platformFeeBps,
      })
      .accountsPartial({
        liquidityMint: collateralMint,
        liquidityTokenProgram: TOKEN_PROGRAM_ID,
        priceUpdateV2,
        market: marketPda,
        authority: marketAuthority.publicKey,
      })
      .signers([marketAuthority])
      .rpc();

    const reservePda = LendingClient.getReservePda(marketPda, collateralMint);
    const reserveAcc = await client.fetchProgramAccount(reservePda, "reserve");

    expect(reserveAcc.market.equals(marketPda)).toBeTrue();
    expect(reserveAcc.config.fees.flashLoanFeeBps).toBe(flashLoanFeeBps);
    expect(reserveAcc.config.fees.platformFeeBps).toBe(platformFeeBps);
    expect(reserveAcc.config.liquidationBonusBps).toBe(liquidationBonusBps);
    expect(reserveAcc.config.liquidationCloseFactorBps).toBe(
      liquidationCloseFactorBps,
    );
    expect(reserveAcc.config.liquidationThresholdBps).toBe(
      liquidationThresholdBps,
    );
    expect(reserveAcc.config.loanToValueBps).toBe(loanToValueBps);
    expect(reserveAcc.config.optimalUtilizationRateBps).toBe(
      optimalUtilizationRateBps,
    );
    expect(reserveAcc.config.minBorrowRateBps).toBe(minBorrowRateBps);
    expect(reserveAcc.config.optimalBorrowRateBps).toBe(optimalBorrowRateBps);
    expect(reserveAcc.config.maxBorrowRateBps).toBe(maxBorrowRateBps);
    expect(reserveAcc.liquidity.mint.equals(collateralMint)).toBeTrue();
    expect(reserveAcc.liquidity.priceUpdateV2.equals(priceUpdateV2)).toBeTrue();

    const reserveAta = getAssociatedTokenAddressSync(
      collateralMint,
      reservePda,
      !PublicKey.isOnCurve(reservePda),
    );

    const reserveAtaAcc = await getAccount(connection, reserveAta);

    expect(reserveAtaAcc).not.toBeNull();
  });

  afterEach(async () => {
    await resetAccounts([marketPda]);
  });
});
