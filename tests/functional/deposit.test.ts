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

describe("deposit", () => {
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
  });

  test("deposit USDC", async () => {
    const mint = USDC_MINT;

    const [bankUsdcPda] = getBankPdaAndBump(mint);
    let bankUsdcAcc = await getBankAcc(program, bankUsdcPda);

    const initTotalDeposits = bankUsdcAcc.totalDeposits.toNumber();
    const initTotalDepositShares = bankUsdcAcc.totalDepositShares.toNumber();

    const [bankUsdcAtaPda] = getBankAtaPdaAndBump(mint);
    const initBankUsdcAtaBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    const amount = new BN(500 * 10 ** 6); // 500 USDC

    await program.methods
      .deposit(amount)
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

    const postTotalDeposits = bankUsdcAcc.totalDeposits.toNumber();
    const postTotalDepositShares = bankUsdcAcc.totalDepositShares.toNumber();

    expect(postTotalDeposits).toEqual(initTotalDeposits + amount.toNumber());
    expect(postTotalDepositShares).toEqual(
      initTotalDepositShares + amount.toNumber()
    );

    const [userPda] = getUserPdaAndBump(userA.publicKey);
    const userAcc = await getUserAcc(program, userPda);

    expect(userAcc.depositedUsdc.toNumber()).toEqual(amount.toNumber());
    expect(userAcc.depositedUsdcShares.toNumber()).toEqual(
      initTotalDepositShares + amount.toNumber()
    );

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(bankUsdcAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp
    );

    const postBankUsdcAtaBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    expect(Number(postBankUsdcAtaBal)).toEqual(
      Number(initBankUsdcAtaBal) + amount.toNumber()
    );
  });

  test("deposit SOL", async () => {
    const mint = NATIVE_MINT;

    const [bankSolPda] = getBankPdaAndBump(mint);
    let bankSolAcc = await getBankAcc(program, bankSolPda);

    const initTotalDeposits = bankSolAcc.totalDeposits.toNumber();
    const initTotalDepositShares = bankSolAcc.totalDepositShares.toNumber();

    const [bankSolAtaPda] = getBankAtaPdaAndBump(mint);
    const initBankSolAtaBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    const amount = new BN(2 * LAMPORTS_PER_SOL); // 2 SOL

    await program.methods
      .deposit(amount)
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

    const postTotalDeposits = bankSolAcc.totalDeposits.toNumber();
    const postTotalDepositShares = bankSolAcc.totalDepositShares.toNumber();

    expect(postTotalDeposits).toEqual(initTotalDeposits + amount.toNumber());
    expect(postTotalDepositShares).toEqual(
      initTotalDepositShares + amount.toNumber()
    );

    const [userPda] = getUserPdaAndBump(userA.publicKey);
    const userAcc = await getUserAcc(program, userPda);

    expect(userAcc.depositedSol.toNumber()).toEqual(amount.toNumber());
    expect(userAcc.depositedSolShares.toNumber()).toEqual(
      initTotalDepositShares + amount.toNumber()
    );

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(bankSolAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp
    );

    const postBankSolAtaBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    expect(Number(postBankSolAtaBal)).toEqual(
      Number(initBankSolAtaBal) + amount.toNumber()
    );
  });

  test("throws if depositing an amount of 0", async () => {
    const amount = new BN(0);

    try {
      await program.methods
        .deposit(amount)
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
});
