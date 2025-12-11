import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { LendingClient } from "../LendingClient";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getSetup, resetAccounts } from "../setup";
import { Program } from "@coral-xyz/anchor";
import { Lending } from "../../target/types/lending";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { WBTC_MINT_DECIMALS, WBTC_USD_PRICE_UPDATE_V2 } from "../constants";
import { Surfpool } from "../surfpool";

describe("refreshObligation", () => {
  let client: LendingClient;
  let program: Program<Lending>;
  let connection: Connection;

  let marketAuthority: Keypair;
  let obligationAuthority: Keypair;
  let marketPda: PublicKey;
  let reservePda: PublicKey;
  let obligationPda: PublicKey;

  let collateralMint: PublicKey;
  const collateralMintPriceUpdateV2 = WBTC_USD_PRICE_UPDATE_V2;

  beforeEach(async () => {
    [marketAuthority, obligationAuthority] = Array.from({ length: 2 }, () =>
      Keypair.generate(),
    );

    ({ client } = await getSetup([
      {
        publicKey: marketAuthority.publicKey,
      },
      {
        publicKey: obligationAuthority.publicKey,
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

    // initializes a reserve
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

    reservePda = LendingClient.getReservePda(marketPda, collateralMint);

    // initializes an obligation
    await program.methods
      .initializeObligation()
      .accountsPartial({
        authority: obligationAuthority.publicKey,
        reserve: reservePda,
      })
      .signers([obligationAuthority])
      .rpc();

    obligationPda = LendingClient.getObligationPda(
      obligationAuthority.publicKey,
      marketPda,
    );
  });

  test("refresh a obligation", async () => {
    await program.methods
      .refreshObligation()
      .accounts({
        obligation: obligationPda,
      })
      .rpc();

    const obligationAcc = await client.fetchProgramAccount(
      obligationPda,
      "obligation",
    );

    expect(obligationAcc.lastUpdate.isStale).toBe(false);
  });

  afterEach(async () => {
    await resetAccounts([marketPda]);
  });
});
