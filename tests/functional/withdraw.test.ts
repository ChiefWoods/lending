import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { AnchorError, BN, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { getBankrunSetup, mintToBankSol, mintToBankUsdc } from "../setup";
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

describe("withdraw", () => {
  let { context, provider, program } = {} as {
    context: ProgramTestContext;
    provider: BankrunProvider;
    program: Program<Lending>;
  };

  const [bankUsdc, bankSol, userA] = Array.from(
    { length: 3 },
    Keypair.generate,
  );

  const tokenProgram = TOKEN_PROGRAM_ID;

  const [userUsdcAtaPda, userSolAtaPda] = [USDC_MINT, NATIVE_MINT].map(
    (mint) => {
      return getAssociatedTokenAddressSync(
        mint,
        userA.publicKey,
        false,
        tokenProgram,
      );
    },
  );

  const initUserUsdcAtaBal = 1000 * 10 ** 6; // 1000 USDC
  const initUserSolAtaBal = 10 * LAMPORTS_PER_SOL; // 10 SOL

  beforeEach(async () => {
    const [userUsdcAtaData, userSolAtaData] = Array.from({ length: 2 }, () =>
      Buffer.alloc(ACCOUNT_SIZE),
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
      userUsdcAtaData,
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
      userSolAtaData,
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

    const liquidationThreshold = 9000; // 90% in basis points
    const liquidationBonus = 500; // 5% in basis points
    const liquidationCloseFactor = 2500; // 25% in basis points
    const maxLtv = 8000; // 80% in basis points
    const minHealthFactor = 1.0;
    const interestRate = 250; // 2.5% in basis points

    await program.methods
      .initBank({
        liquidationThreshold,
        liquidationBonus,
        liquidationCloseFactor,
        maxLtv,
        minHealthFactor,
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
        minHealthFactor,
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
  });

  test("withdraw USDC", async () => {
    const mint = USDC_MINT;

    await program.methods
      .deposit(new BN(10 * 10 ** 6)) // 10 USDC
      .accounts({
        authority: userA.publicKey,
        mintA: mint,
        mintB: NATIVE_MINT,
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    const [bankUsdcPda] = getBankPdaAndBump(mint);
    let bankUsdcAcc = await getBankAcc(program, bankUsdcPda);

    const initBankUsdcTotalDeposits = bankUsdcAcc.totalDeposits.toNumber();
    const initBankUsdcTotalDepositShares =
      bankUsdcAcc.totalDepositShares.toNumber();

    const [userPda] = getUserPdaAndBump(userA.publicKey);
    let userAcc = await getUserAcc(program, userPda);

    const initUserDepositedUsdc = userAcc.depositedUsdc.toNumber();
    const initUserDepositedUsdcShares = userAcc.depositedUsdcShares.toNumber();

    const [bankUsdcAtaPda] = getBankAtaPdaAndBump(mint);
    const initBankUsdcAtaAccBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    const amount = new BN(5 * 10 ** 6); // 5 USDC

    await program.methods
      .withdraw(amount)
      .accounts({
        authority: userA.publicKey,
        mintA: mint,
        mintB: NATIVE_MINT,
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    bankUsdcAcc = await getBankAcc(program, bankUsdcPda);

    const postBankUsdcTotalDeposits = bankUsdcAcc.totalDeposits.toNumber();
    const postBankUsdcTotalDepositShares =
      bankUsdcAcc.totalDepositShares.toNumber();

    expect(postBankUsdcTotalDeposits).toEqual(
      initBankUsdcTotalDeposits - amount.toNumber(),
    );
    expect(postBankUsdcTotalDepositShares).toEqual(
      initBankUsdcTotalDepositShares - amount.toNumber(),
    );

    userAcc = await getUserAcc(program, userPda);

    const postUserDepositedUsdc = userAcc.depositedUsdc.toNumber();
    const postUserDepositedUsdcShares = userAcc.depositedUsdcShares.toNumber();

    expect(postUserDepositedUsdc).toEqual(
      initUserDepositedUsdc - amount.toNumber(),
    );
    expect(postUserDepositedUsdcShares).toEqual(
      initUserDepositedUsdcShares - amount.toNumber(),
    );

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(bankUsdcAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp,
    );

    const postBankUsdcAtaAccBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    expect(Number(postBankUsdcAtaAccBal)).toEqual(
      Number(initBankUsdcAtaAccBal) - amount.toNumber(),
    );
  });

  test("withdraw SOL", async () => {
    const mint = NATIVE_MINT;

    await program.methods
      .deposit(new BN(2 * LAMPORTS_PER_SOL)) // 2 SOL
      .accounts({
        authority: userA.publicKey,
        mintA: mint,
        mintB: USDC_MINT,
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    const [bankSolPda] = getBankPdaAndBump(mint);
    let bankSolAcc = await getBankAcc(program, bankSolPda);

    const initBankSolTotalDeposits = bankSolAcc.totalDeposits.toNumber();
    const initBankSolTotalDepositShares =
      bankSolAcc.totalDepositShares.toNumber();

    const [userPda] = getUserPdaAndBump(userA.publicKey);
    let userAcc = await getUserAcc(program, userPda);

    const [bankSolAtaPda] = getBankAtaPdaAndBump(mint);
    const initBankSolAtaAccBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    const initUserDepositedSol = userAcc.depositedSol.toNumber();
    const initUserDepositedSolShares = userAcc.depositedSolShares.toNumber();

    const amount = new BN(LAMPORTS_PER_SOL); // 1 SOL

    await program.methods
      .withdraw(amount)
      .accounts({
        authority: userA.publicKey,
        mintA: mint,
        mintB: USDC_MINT,
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    bankSolAcc = await getBankAcc(program, bankSolPda);

    expect(bankSolAcc.totalDeposits.toNumber()).toBeLessThan(
      initBankSolTotalDeposits,
    );
    expect(bankSolAcc.totalDepositShares.toNumber()).toBeLessThan(
      initBankSolTotalDepositShares,
    );

    userAcc = await getUserAcc(program, userPda);

    const postUserDepositedSol = userAcc.depositedSol.toNumber();
    const postUserDepositedSolShares = userAcc.depositedSolShares.toNumber();

    expect(postUserDepositedSol).toEqual(
      initUserDepositedSol - amount.toNumber(),
    );
    expect(postUserDepositedSolShares).toEqual(
      initUserDepositedSolShares - amount.toNumber(),
    );

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(bankSolAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp,
    );

    const postBankSolAtaAccBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    expect(postBankSolAtaAccBal).toBeLessThan(initBankSolAtaAccBal);
  });

  test("throws if withdrawing an amount of 0", async () => {
    await program.methods
      .deposit(new BN(10 * 10 ** 6)) // 10 USDC
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

    const amount = new BN(0);

    try {
      await program.methods
        .withdraw(amount)
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
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("InvalidAmount");
      expect(error.errorCode.number).toEqual(6000);
    }
  });

  test("throws if withdrawing more than deposited", async () => {
    await program.methods
      .deposit(new BN(10 * 10 ** 6)) // 10 USDC
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

    const amount = new BN(20 * 10 ** 6); // 20 USDC

    try {
      await program.methods
        .withdraw(amount)
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
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("InsufficientFunds");
      expect(error.errorCode.number).toEqual(6001);
    }
  });
});
