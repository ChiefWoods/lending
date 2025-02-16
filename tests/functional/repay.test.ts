import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { Clock, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { AnchorError, BN, Program } from "@coral-xyz/anchor";
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
import {
  getBankAtaPdaAndBump,
  getBankPdaAndBump,
  getUserPdaAndBump,
} from "../pda";
import { getBankAcc, getUserAcc } from "../accounts";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  getAccount,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("repay", () => {
  let { context, provider, program } = {} as {
    context: ProgramTestContext;
    provider: BankrunProvider;
    program: Program<Lending>;
  };

  const [bankUsdc, bankSol, userA] = Array.from(
    { length: 3 },
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

  const initUserUsdcAtaBal = 1000 * 10 ** 6; // 1000 USDC
  const initUserSolAtaBal = 10 * LAMPORTS_PER_SOL; // 10 SOL

  beforeEach(async () => {
    const [userUsdcAtaData, userSolAtaData] = Array.from({ length: 2 }, () =>
      Buffer.alloc(ACCOUNT_SIZE)
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

    ({ context, provider, program } = await getBankrunSetup([
      ...[bankUsdc, bankSol, userA].map((kp) => {
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
        clock.unixTimestamp + BigInt(15)
      )
    ); // elapsed 15 secs

    await setPriceFeedAccs(context, [
      SOL_USD_PRICE_FEED_PDA,
      USDC_USD_PRICE_FEED_PDA,
    ]);
  });

  test("repay SOL", async () => {
    const mint = NATIVE_MINT;

    const [bankSolAta] = getBankPdaAndBump(mint);
    let bankSolAcc = await getBankAcc(program, bankSolAta);

    const initBankSolTotalBorrowed = bankSolAcc.totalBorrowed.toNumber();
    const initBankSolTotalBorrowedShares =
      bankSolAcc.totalBorrowedShares.toNumber();

    const [userPda] = getUserPdaAndBump(userA.publicKey);
    let userAcc = await getUserAcc(program, userPda);

    const initUserBorrowedSol = userAcc.borrowedSol.toNumber();
    const initUserBorrowedSolShares = userAcc.borrowedSolShares.toNumber();

    const [bankSolAtaPda] = getBankAtaPdaAndBump(mint);
    const initBankSolAtaAccBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    const amount = new BN(LAMPORTS_PER_SOL); // 1 SOL

    await program.methods
      .repay(amount)
      .accounts({
        authority: userA.publicKey,
        mintA: mint, // repaying SOL
        mintB: USDC_MINT,
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    bankSolAcc = await getBankAcc(program, bankSolAta);

    const postBankSolTotalBorrowed = bankSolAcc.totalBorrowed.toNumber();
    const postBankSolTotalBorrowedShares =
      bankSolAcc.totalBorrowedShares.toNumber();

    expect(postBankSolTotalBorrowed).toBeLessThan(initBankSolTotalBorrowed);
    expect(postBankSolTotalBorrowedShares).toBeLessThan(
      initBankSolTotalBorrowedShares
    );

    userAcc = await getUserAcc(program, userPda);

    const postUserBorrowedSol = userAcc.borrowedSol.toNumber();
    const postUserBorrowedSolShares = userAcc.borrowedSolShares.toNumber();

    expect(postUserBorrowedSol).toBeLessThan(initUserBorrowedSol);
    expect(postUserBorrowedSolShares).toBeLessThan(initUserBorrowedSolShares);

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(bankSolAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp
    );
    expect(userAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);

    const postBankSolAtaAccBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    expect(Number(postBankSolAtaAccBal)).toBeGreaterThan(
      Number(initBankSolAtaAccBal)
    );
  });

  test("repay USDC", async () => {
    const mint = USDC_MINT;

    const [bankUsdcAta] = getBankPdaAndBump(mint);
    let bankUsdcAcc = await getBankAcc(program, bankUsdcAta);

    const initBankUsdcTotalBorrowed = bankUsdcAcc.totalBorrowed.toNumber();
    const initBankUsdcTotalBorrowedShares =
      bankUsdcAcc.totalBorrowedShares.toNumber();

    const [userPda] = getUserPdaAndBump(userA.publicKey);
    let userAcc = await getUserAcc(program, userPda);

    const initUserBorrowedUsdc = userAcc.borrowedUsdc.toNumber();
    const initUserBorrowedUsdcShares = userAcc.borrowedUsdcShares.toNumber();

    const [bankUsdcAtaPda] = getBankAtaPdaAndBump(mint);
    const initBankUsdcAtaAccBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    const amount = new BN(100 * 10 ** 6); // 100 USDC

    await program.methods
      .repay(amount)
      .accounts({
        authority: userA.publicKey,
        mintA: mint, // repaying USDC
        mintB: NATIVE_MINT,
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    bankUsdcAcc = await getBankAcc(program, bankUsdcAta);

    const postBankUsdcTotalBorrowed = bankUsdcAcc.totalBorrowed.toNumber();
    const postBankUsdcTotalBorrowedShares =
      bankUsdcAcc.totalBorrowedShares.toNumber();

    expect(postBankUsdcTotalBorrowed).toBeLessThan(initBankUsdcTotalBorrowed);
    expect(postBankUsdcTotalBorrowedShares).toBeLessThan(
      initBankUsdcTotalBorrowedShares
    );

    userAcc = await getUserAcc(program, userPda);

    const postUserBorrowedUsdc = userAcc.borrowedUsdc.toNumber();
    const postUserBorrowedUsdcShares = userAcc.borrowedUsdcShares.toNumber();

    expect(postUserBorrowedUsdc).toBeLessThan(initUserBorrowedUsdc);
    expect(postUserBorrowedUsdcShares).toBeLessThan(initUserBorrowedUsdcShares);

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(bankUsdcAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp
    );
    expect(userAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);

    const postBankUsdcAtaAccBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    expect(Number(postBankUsdcAtaAccBal)).toBeGreaterThan(
      Number(initBankUsdcAtaAccBal)
    );
  });

  test("throws if repay amount is 0", async () => {
    const amount = new BN(0);

    try {
      await program.methods
        .repay(amount)
        .accounts({
          authority: userA.publicKey,
          mintA: USDC_MINT, // repaying USDC
          mintB: NATIVE_MINT,
          priceUpdateA: SOL_USD_PRICE_FEED_PDA,
          priceUpdateB: USDC_USD_PRICE_FEED_PDA,
          tokenProgramA: tokenProgram,
          tokenProgramB: tokenProgram,
        })
        .signers([userA])
        .rpc();
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("InvalidAmount");
      expect(error.errorCode.number).toEqual(6000);
    }
  });

  test("throws if repaying more than borrowed", async () => {
    const amount = new BN(2 * LAMPORTS_PER_SOL); // repaying 2 SOL, borrowed 1 SOL

    try {
      await program.methods
        .repay(amount)
        .accounts({
          authority: userA.publicKey,
          mintA: USDC_MINT, // repaying USDC
          mintB: NATIVE_MINT,
          priceUpdateA: SOL_USD_PRICE_FEED_PDA,
          priceUpdateB: USDC_USD_PRICE_FEED_PDA,
          tokenProgramA: tokenProgram,
          tokenProgramB: tokenProgram,
        })
        .signers([userA])
        .rpc();
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("ExceededBorrowedAmount");
      expect(error.errorCode.number).toEqual(6004);
    }
  });
});
