import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { Clock, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  getBankrunSetup,
  mintToBankSol,
  mintToBankUsdc,
  setPriceFeedAccs,
} from "../setup";
import {
  SOL_USD_PRICE_FEED_PDA,
  USDC_MINT,
  USDC_USD_PRICE_FEED_PDA,
} from "../constants";
import { getBankAtaPdaAndBump, getUserPdaAndBump } from "../pda";
import { getUserAcc } from "../accounts";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  getAccount,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("liquidate", () => {
  let { context, provider, program } = {} as {
    context: ProgramTestContext;
    provider: BankrunProvider;
    program: Program<Lending>;
  };

  const [bankUsdc, bankSol, userA, liquidatorA] = Array.from(
    { length: 4 },
    Keypair.generate
  );

  const tokenProgram = TOKEN_PROGRAM_ID;

  const [userUsdcAtaPda, userSolAtaPda] = [USDC_MINT, NATIVE_MINT].map(
    (mint) => {
      return getAssociatedTokenAddressSync(
        mint,
        userA.publicKey,
        false,
        tokenProgram
      );
    }
  );

  const liquidatorSolAtaPda = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    liquidatorA.publicKey,
    false,
    tokenProgram
  );

  const liquidatorUsdcAtaPda = getAssociatedTokenAddressSync(
    USDC_MINT,
    liquidatorA.publicKey,
    false,
    tokenProgram
  );

  const initUserUsdcAtaBal = 1000 * 10 ** 6; // 1000 USDC
  const initUserSolAtaBal = 10 * LAMPORTS_PER_SOL; // 10 SOL
  const initLiquidatorSolAtaBal = 10 * LAMPORTS_PER_SOL; // 10 SOL

  beforeEach(async () => {
    const [userUsdcAtaData, userSolAtaData, liquidatorSolAtaData] = Array.from(
      { length: 3 },
      () => Buffer.alloc(ACCOUNT_SIZE)
    );

    AccountLayout.encode(
      {
        amount: BigInt(initUserUsdcAtaBal),
        closeAuthority: PublicKey.default,
        closeAuthorityOption: 0,
        delegate: PublicKey.default,
        delegateOption: 0,
        delegatedAmount: 0n,
        isNative: 0n,
        isNativeOption: 0,
        mint: USDC_MINT,
        owner: userA.publicKey,
        state: 1,
      },
      userUsdcAtaData
    );

    AccountLayout.encode(
      {
        amount: BigInt(initUserSolAtaBal),
        closeAuthority: PublicKey.default,
        closeAuthorityOption: 0,
        delegate: PublicKey.default,
        delegateOption: 0,
        delegatedAmount: 0n,
        isNative: 1n,
        isNativeOption: 1,
        mint: NATIVE_MINT,
        owner: userA.publicKey,
        state: 1,
      },
      userSolAtaData
    );

    AccountLayout.encode(
      {
        amount: BigInt(initLiquidatorSolAtaBal),
        closeAuthority: PublicKey.default,
        closeAuthorityOption: 0,
        delegate: PublicKey.default,
        delegateOption: 0,
        delegatedAmount: 0n,
        isNative: 1n,
        isNativeOption: 1,
        mint: NATIVE_MINT,
        owner: liquidatorA.publicKey,
        state: 1,
      },
      liquidatorSolAtaData
    );

    ({ context, provider, program } = await getBankrunSetup([
      ...[bankUsdc, bankSol, userA, liquidatorA].map((kp) => {
        return {
          address: kp.publicKey,
          info: {
            lamports: LAMPORTS_PER_SOL * 5,
            data: Buffer.alloc(0),
            owner: SystemProgram.programId,
            executable: false,
          },
        };
      }),
      {
        address: userUsdcAtaPda,
        info: {
          lamports: LAMPORTS_PER_SOL,
          data: userUsdcAtaData,
          owner: tokenProgram,
          executable: false,
        },
      },
      {
        address: userSolAtaPda,
        info: {
          lamports: initUserSolAtaBal,
          data: userSolAtaData,
          owner: tokenProgram,
          executable: false,
        },
      },
      {
        address: liquidatorSolAtaPda,
        info: {
          lamports: initLiquidatorSolAtaBal,
          data: liquidatorSolAtaData,
          owner: tokenProgram,
          executable: false,
        },
      },
    ]));

    const liquidationThreshold = new BN(9000); // 90% in basis points
    const liquidationBonus = new BN(500); // 5% in basis points
    const liquidationCloseFactor = new BN(2500); // 25% in basis points
    const maxLtv = new BN(8000); // 80% in basis points
    const interestRate = new BN(250); // 2.5% in basis points

    await program.methods
      .initBank({
        liquidationThreshold,
        liquidationBonus,
        liquidationCloseFactor,
        maxLtv,
        interestRate,
      })
      .accounts({
        authority: bankUsdc.publicKey,
        mint: USDC_MINT,
        tokenProgram,
      })
      .signers([bankUsdc])
      .rpc();

    await mintToBankUsdc(context, 1000 * 10 ** 6); // 1000 USDC

    await program.methods
      .initBank({
        liquidationThreshold,
        liquidationBonus,
        liquidationCloseFactor,
        maxLtv,
        interestRate,
      })
      .accounts({
        authority: bankSol.publicKey,
        mint: NATIVE_MINT,
        tokenProgram,
      })
      .signers([bankSol])
      .rpc();

    await mintToBankSol(context, 100 * LAMPORTS_PER_SOL); // 100 SOL

    await program.methods
      .initUser(USDC_MINT)
      .accounts({
        authority: userA.publicKey,
      })
      .signers([userA])
      .rpc();

    await program.methods
      .deposit(new BN(500 * 10 ** 6)) // 500 USDC
      .accounts({
        authority: userA.publicKey,
        mintA: USDC_MINT,
        mintB: NATIVE_MINT,
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    await program.methods
      .deposit(new BN(2 * LAMPORTS_PER_SOL)) // 2 SOL
      .accounts({
        authority: userA.publicKey,
        mintA: NATIVE_MINT,
        mintB: USDC_MINT,
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    let clock = await context.banksClient.getClock();
    context.setClock(
      new Clock(
        clock.slot,
        clock.epochStartTimestamp,
        clock.epoch,
        clock.leaderScheduleEpoch,
        clock.unixTimestamp + BigInt(15)
      )
    ); // elapsed 15 secs

    await setPriceFeedAccs(context, [
      SOL_USD_PRICE_FEED_PDA,
      USDC_USD_PRICE_FEED_PDA,
    ]);

    await program.methods
      .borrow(new BN(LAMPORTS_PER_SOL)) // 1 SOL
      .accounts({
        authority: userA.publicKey,
        mintA: NATIVE_MINT, // borrowing SOL
        mintB: USDC_MINT, // collateral USDC
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    await program.methods
      .borrow(new BN(100 * 10 ** 6)) // 100 USDC
      .accounts({
        authority: userA.publicKey,
        mintA: USDC_MINT, // borrowing USDC
        mintB: NATIVE_MINT, // collateral SOL
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    clock = await context.banksClient.getClock();
    context.setClock(
      new Clock(
        clock.slot,
        clock.epochStartTimestamp,
        clock.epoch,
        clock.leaderScheduleEpoch,
        clock.unixTimestamp + BigInt(60 * 60 * 24 * 365 * 50)
      )
    ); // elapsed 50 years

    await setPriceFeedAccs(context, [
      SOL_USD_PRICE_FEED_PDA,
      USDC_USD_PRICE_FEED_PDA,
    ]);
  });

  test.skip("liquidate borrowed SOL position", async () => {
    // TODO: not tested
    const [userPda] = getUserPdaAndBump(userA.publicKey);
    let userAcc = await getUserAcc(program, userPda);

    const initUserBorrowedSol = userAcc.borrowedSol;
    const initUserBorrowedSolShares = userAcc.borrowedSolShares;
    const initUserDepositedUsdc = userAcc.depositedUsdc;
    const initUserDepositedUsdcShares = userAcc.depositedUsdcShares;

    const initLiquidatorSolAtaBal = (
      await getAccount(provider.connection, liquidatorSolAtaPda)
    ).amount;

    const [borrowedBankAta] = getBankAtaPdaAndBump(NATIVE_MINT);
    const initBorrowedBankAtaBal = (
      await getAccount(provider.connection, borrowedBankAta)
    ).amount;

    const [collateralBankAta] = getBankAtaPdaAndBump(USDC_MINT);
    const initCollateralBankAtaBal = (
      await getAccount(provider.connection, collateralBankAta)
    ).amount;

    await program.methods
      .liquidate()
      .accounts({
        liquidator: liquidatorA.publicKey,
        borrower: userA.publicKey,
        borrowedMint: NATIVE_MINT,
        collateralMint: USDC_MINT,
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([liquidatorA])
      .rpc();

    userAcc = await getUserAcc(program, userPda);

    const postUserBorrowedSol = userAcc.borrowedSol;
    const postUserBorrowedSolShares = userAcc.borrowedSolShares;
    const postUserDepositedUsdc = userAcc.depositedUsdc;
    const postUserDepositedUsdcShares = userAcc.depositedUsdcShares;

    expect(postUserBorrowedSol.toNumber()).toBeLessThan(
      initUserBorrowedSol.toNumber()
    );
    expect(postUserBorrowedSolShares.toNumber()).toBeLessThan(
      initUserBorrowedSolShares.toNumber()
    );
    expect(postUserDepositedUsdc.toNumber()).toBeLessThan(
      initUserDepositedUsdc.toNumber()
    );
    expect(postUserDepositedUsdcShares.toNumber()).toBeLessThan(
      initUserDepositedUsdcShares.toNumber()
    );

    const postLiquidatorSolAtaBal = (
      await getAccount(provider.connection, liquidatorSolAtaPda)
    ).amount;
    const postLiquidatorUsdcAtaBal = (
      await getAccount(provider.connection, liquidatorUsdcAtaPda)
    ).amount;

    expect(Number(postLiquidatorSolAtaBal)).toBeLessThan(
      initLiquidatorSolAtaBal
    );
    expect(Number(postLiquidatorUsdcAtaBal)).toBeGreaterThan(0);

    const postBorrowedBankAtaBal = (
      await getAccount(provider.connection, borrowedBankAta)
    ).amount;
    const postCollateralBankAtaBal = (
      await getAccount(provider.connection, collateralBankAta)
    ).amount;

    expect(Number(postBorrowedBankAtaBal)).toBeGreaterThan(
      initBorrowedBankAtaBal
    );
    expect(Number(postCollateralBankAtaBal)).toBeLessThan(
      initCollateralBankAtaBal
    );
  });
});
