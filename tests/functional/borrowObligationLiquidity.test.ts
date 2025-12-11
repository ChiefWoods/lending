import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { LendingClient } from "../LendingClient";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  buildAndSendv0Tx,
  expireBlockhash,
  getSetup,
  resetAccounts,
} from "../setup";
import { BN, Program } from "@coral-xyz/anchor";
import { Lending } from "../../target/types/lending";
import { Surfpool } from "../surfpool";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  USDC_MINT_DECIMALS,
  USDC_USD_PRICE_UPDATE_V2,
  WBTC_MINT_DECIMALS,
  WBTC_USD_PRICE_UPDATE_V2,
} from "../constants";

describe("borrowObligationLiquidity", () => {
  let client: LendingClient;
  let program: Program<Lending>;
  let connection: Connection;

  let marketAuthority: Keypair;
  let borrowerObligationAuthority: Keypair;
  let lenderObligationAuthority: Keypair;
  let marketPda: PublicKey;
  let collateralReservePda: PublicKey;
  let liquidityReservePda: PublicKey;
  let borrowerObligationPda: PublicKey;
  let lenderObligationPda: PublicKey;
  let collateralReceiptMint: PublicKey;
  let liquidityReceiptMint: PublicKey;

  let collateralMint: PublicKey;
  const collateralMintPriceUpdateV2 = WBTC_USD_PRICE_UPDATE_V2;
  let liquidityMint: PublicKey;
  const liquidityMintPriceUpdateV2 = USDC_USD_PRICE_UPDATE_V2;

  const collateralDepositAmount = 10 * Math.pow(10, WBTC_MINT_DECIMALS);
  const liquidityDepositAmount = 1000 * Math.pow(10, USDC_MINT_DECIMALS);

  beforeEach(async () => {
    [marketAuthority, borrowerObligationAuthority, lenderObligationAuthority] =
      Array.from({ length: 3 }, () => Keypair.generate());

    ({ client } = await getSetup([
      {
        publicKey: marketAuthority.publicKey,
      },
      {
        publicKey: borrowerObligationAuthority.publicKey,
      },
      {
        publicKey: lenderObligationAuthority.publicKey,
      },
    ]));

    program = client.program;
    connection = client.connection;

    collateralMint = await Surfpool.initMint({
      decimals: WBTC_MINT_DECIMALS,
    });

    liquidityMint = await Surfpool.initMint({
      decimals: USDC_MINT_DECIMALS,
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

    // initializes collateral reserve
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

    collateralReservePda = LendingClient.getReservePda(
      marketPda,
      collateralMint,
    );

    // initializes an obligation
    await program.methods
      .initializeObligation()
      .accountsPartial({
        authority: borrowerObligationAuthority.publicKey,
        reserve: collateralReservePda,
      })
      .signers([borrowerObligationAuthority])
      .rpc();

    borrowerObligationPda = LendingClient.getObligationPda(
      borrowerObligationAuthority.publicKey,
      marketPda,
    );

    await Surfpool.setTokenAccount({
      mint: collateralMint.toBase58(),
      owner: borrowerObligationAuthority.publicKey.toBase58(),
      update: {
        amount: collateralDepositAmount,
      },
    });

    await buildAndSendv0Tx(
      // refresh reserves and obligations
      [
        await program.methods
          .refreshReserve()
          .accounts({
            priceUpdateV2: collateralMintPriceUpdateV2,
            reserve: collateralReservePda,
          })
          .instruction(),
        await program.methods
          .refreshObligation()
          .accounts({
            obligation: borrowerObligationPda,
          })
          .instruction(),
        // deposit collateral into reserve
        await program.methods
          .depositReserveLiquidityAndObligationCollateral(
            new BN(collateralDepositAmount),
          )
          .accountsPartial({
            authority: borrowerObligationAuthority.publicKey,
            collateralMint,
            collateralTokenProgram: TOKEN_PROGRAM_ID,
            obligation: borrowerObligationPda,
            reserve: collateralReservePda,
          })
          .instruction(),
      ],
      [borrowerObligationAuthority],
    );

    collateralReceiptMint = LendingClient.getReceiptMint(collateralReservePda);

    // initialize liquidity reserve
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
        liquidityMint,
        liquidityTokenProgram: TOKEN_PROGRAM_ID,
        priceUpdateV2: liquidityMintPriceUpdateV2,
        market: marketPda,
        authority: marketAuthority.publicKey,
      })
      .signers([marketAuthority])
      .rpc();

    liquidityReservePda = LendingClient.getReservePda(marketPda, liquidityMint);
    lenderObligationPda = LendingClient.getObligationPda(
      lenderObligationAuthority.publicKey,
      marketPda,
    );

    // initializes an obligation
    await program.methods
      .initializeObligation()
      .accountsPartial({
        authority: lenderObligationAuthority.publicKey,
        reserve: liquidityReservePda,
        obligation: lenderObligationPda,
      })
      .signers([lenderObligationAuthority])
      .rpc();

    await Surfpool.setTokenAccount({
      mint: liquidityMint.toBase58(),
      owner: lenderObligationAuthority.publicKey.toBase58(),
      update: {
        amount: liquidityDepositAmount,
      },
    });

    await expireBlockhash();

    await buildAndSendv0Tx(
      // refresh reserves and obligations
      [
        await program.methods
          .refreshReserve()
          .accounts({
            priceUpdateV2: liquidityMintPriceUpdateV2,
            reserve: liquidityReservePda,
          })
          .instruction(),
        await program.methods
          .refreshObligation()
          .accounts({
            obligation: lenderObligationPda,
          })
          .instruction(),
        // deposit liquidity into reserve
        await program.methods
          .depositReserveLiquidityAndObligationCollateral(
            new BN(liquidityDepositAmount),
          )
          .accountsPartial({
            authority: lenderObligationAuthority.publicKey,
            collateralMint: liquidityMint,
            collateralTokenProgram: TOKEN_PROGRAM_ID,
            obligation: lenderObligationPda,
            reserve: liquidityReservePda,
          })
          .instruction(),
      ],
      [lenderObligationAuthority],
    );

    liquidityReceiptMint = LendingClient.getReceiptMint(liquidityReservePda);
  });

  test("borrow liquidity mint from reserve", async () => {
    const borrowAmount = liquidityDepositAmount / 4;

    const liquidityReserveAta = getAssociatedTokenAddressSync(
      liquidityMint,
      liquidityReservePda,
      !PublicKey.isOnCurve(liquidityReservePda),
    );

    const preReserveAcc = await client.fetchProgramAccount(
      liquidityReservePda,
      "reserve",
    );

    await expireBlockhash();

    await buildAndSendv0Tx(
      // refresh reserves and obligations
      [
        await program.methods
          .refreshReserve()
          .accounts({
            priceUpdateV2: collateralMintPriceUpdateV2,
            reserve: collateralReservePda,
          })
          .instruction(),
        await program.methods
          .refreshObligation()
          .accounts({
            obligation: borrowerObligationPda,
          })
          .remainingAccounts([
            {
              isSigner: false,
              isWritable: false,
              pubkey: collateralReservePda,
            },
            {
              isSigner: false,
              isWritable: false,
              pubkey: collateralReceiptMint,
            },
          ])
          .instruction(),
        await program.methods
          .refreshReserve()
          .accounts({
            priceUpdateV2: liquidityMintPriceUpdateV2,
            reserve: liquidityReservePda,
          })
          .instruction(),
        await program.methods
          .refreshObligation()
          .accounts({
            obligation: lenderObligationPda,
          })
          .remainingAccounts([
            {
              isSigner: false,
              isWritable: false,
              pubkey: liquidityReservePda,
            },
            {
              isSigner: false,
              isWritable: false,
              pubkey: liquidityReceiptMint,
            },
          ])
          .instruction(),
        // borrow liquidity from reserve
        await program.methods
          .borrowObligationLiquidity(new BN(borrowAmount))
          .accountsPartial({
            authority: borrowerObligationAuthority.publicKey,
            liquidityMint,
            obligation: borrowerObligationPda,
            reserveTokenAccount: liquidityReserveAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            reserve: liquidityReservePda,
          })
          .instruction(),
      ],
      [borrowerObligationAuthority],
    );

    const postReserveAcc = await client.fetchProgramAccount(
      liquidityReservePda,
      "reserve",
    );

    expect(
      preReserveAcc.liquidity.availableAmount.eq(
        postReserveAcc.liquidity.availableAmount.add(new BN(borrowAmount)),
      ),
    ).toBeTrue();
    expect(
      preReserveAcc.liquidity.borrowedAmount.eq(
        postReserveAcc.liquidity.borrowedAmount.sub(new BN(borrowAmount)),
      ),
    ).toBeTrue();

    const borrowerObligationAcc = await client.fetchProgramAccount(
      borrowerObligationPda,
      "obligation",
    );

    expect(borrowerObligationAcc.lastUpdate.isStale).toBeTrue();
    expect(
      borrowerObligationAcc.borrows[0].borrowedAmount.eq(new BN(borrowAmount)),
    ).toBeTrue();
    expect(
      borrowerObligationAcc.borrows[0].reserve.equals(liquidityReservePda),
    ).toBeTrue();
  });

  afterEach(async () => {
    await resetAccounts([marketPda]);
  });
});
