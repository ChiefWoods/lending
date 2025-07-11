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
import {
  forwardTime,
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

describe("borrow", () => {
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

  test("borrow SOL against USDC", async () => {
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

    await forwardTime(context, 10); // elapsed 10 secs

    await setPriceFeedAccs(context, [
      SOL_USD_PRICE_FEED_PDA,
      USDC_USD_PRICE_FEED_PDA,
    ]);

    const mint = NATIVE_MINT;

    const [bankSolAtaPda] = getBankAtaPdaAndBump(mint);
    const initBankSolAtaAccBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    const amount = new BN(LAMPORTS_PER_SOL); // 1 SOL

    await program.methods
      .borrow(amount)
      .accounts({
        authority: userA.publicKey,
        mintA: mint, // borrowing SOL
        mintB: USDC_MINT, // collateral USDC
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    const [bankSolAta] = getBankPdaAndBump(mint);
    const bankSolAcc = await getBankAcc(program, bankSolAta);

    expect(bankSolAcc.totalBorrowed.toNumber()).toBeGreaterThan(0);
    expect(bankSolAcc.totalBorrowedShares.toNumber()).toBeGreaterThan(0);

    const [userPda] = getUserPdaAndBump(userA.publicKey);
    const userAcc = await getUserAcc(program, userPda);

    expect(userAcc.borrowedSol.toNumber()).toBeGreaterThan(0);
    expect(userAcc.borrowedSolShares.toNumber()).toBeGreaterThan(0);

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(bankSolAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp,
    );
    expect(userAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);

    const postBankSolAtaAccBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    expect(Number(postBankSolAtaAccBal)).toBeLessThan(
      Number(initBankSolAtaAccBal),
    );
  });

  test("borrow USDC against SOL", async () => {
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

    await forwardTime(context, 10); // elapsed 10 secs

    await setPriceFeedAccs(context, [
      SOL_USD_PRICE_FEED_PDA,
      USDC_USD_PRICE_FEED_PDA,
    ]);

    const mint = USDC_MINT;

    const [bankUsdcAtaPda] = getBankAtaPdaAndBump(mint);
    const initBankUsdcAtaAccBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    const amount = new BN(100 * 10 ** 6); // 100 USDC

    await program.methods
      .borrow(amount)
      .accounts({
        authority: userA.publicKey,
        mintA: mint, // borrowing USDC
        mintB: NATIVE_MINT, // collateral SOL
        priceUpdateA: SOL_USD_PRICE_FEED_PDA,
        priceUpdateB: USDC_USD_PRICE_FEED_PDA,
        tokenProgramA: tokenProgram,
        tokenProgramB: tokenProgram,
      })
      .signers([userA])
      .rpc();

    const [bankUsdcAta] = getBankPdaAndBump(mint);
    const bankUsdcAcc = await getBankAcc(program, bankUsdcAta);

    expect(bankUsdcAcc.totalBorrowed.toNumber()).toBeGreaterThan(0);
    expect(bankUsdcAcc.totalBorrowedShares.toNumber()).toBeGreaterThan(0);

    const [userPda] = getUserPdaAndBump(userA.publicKey);
    const userAcc = await getUserAcc(program, userPda);

    expect(userAcc.borrowedUsdc.toNumber()).toBeGreaterThan(0);
    expect(userAcc.borrowedUsdcShares.toNumber()).toBeGreaterThan(0);

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(bankUsdcAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp,
    );
    expect(userAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);

    const postBankUsdcAtaAccBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    expect(Number(postBankUsdcAtaAccBal)).toBeLessThan(
      Number(initBankUsdcAtaAccBal),
    );
  });

  test("throws if borrow amount is 0", async () => {
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

    await forwardTime(context, 10); // elapsed 10 secs

    await setPriceFeedAccs(context, [
      SOL_USD_PRICE_FEED_PDA,
      USDC_USD_PRICE_FEED_PDA,
    ]);

    const amount = new BN(0);

    try {
      await program.methods
        .borrow(amount)
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
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("InvalidAmount");
      expect(error.errorCode.number).toEqual(6000);
    }
  });

  test("throws if borrow amount exceeds LTV", async () => {
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

    await forwardTime(context, 10); // elapsed 10 secs

    await setPriceFeedAccs(context, [
      SOL_USD_PRICE_FEED_PDA,
      USDC_USD_PRICE_FEED_PDA,
    ]);

    const amount = new BN(10 * LAMPORTS_PER_SOL); // 10 SOL

    try {
      await program.methods
        .borrow(amount)
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
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("ExceededLTV");
      expect(error.errorCode.number).toEqual(6003);
    }
  });
});
