import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  SOL_USD_PRICE_FEED_PDA,
  USDC_MINT,
  USDC_USD_PRICE_FEED_PDA,
} from "../constants";
import { getBankAtaPda, getBankPda, getUserPda } from "../pda";
import { fetchBankAcc, fetchUserAcc } from "../accounts";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  getAccount,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { LiteSVM } from "litesvm";
import { LiteSVMProvider } from "anchor-litesvm";
import {
  expectAnchorError,
  fundedSystemAccountInfo,
  getSetup,
  mintToBankSol,
  mintToBankUsdc,
} from "../setup";

describe("deposit", () => {
  let { litesvm, provider, program } = {} as {
    litesvm: LiteSVM;
    provider: LiteSVMProvider;
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

    ({ litesvm, provider, program } = await getSetup([
      ...[bankUsdc, bankSol, userA].map((kp) => {
        return {
          pubkey: kp.publicKey,
          account: fundedSystemAccountInfo(),
        };
      }),
      {
        pubkey: userUsdcAtaPda,
        account: {
          lamports: LAMPORTS_PER_SOL,
          data: userUsdcAtaData,
          owner: tokenProgram,
          executable: false,
        },
      },
      {
        pubkey: userSolAtaPda,
        account: {
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

    await mintToBankUsdc(litesvm, 1000 * 10 ** 6); // 1000 USDC

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

    await mintToBankSol(litesvm, 100 * LAMPORTS_PER_SOL); // 100 SOL

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

    const bankUsdcPda = getBankPda(mint);
    let bankUsdcAcc = await fetchBankAcc(program, bankUsdcPda);

    const initTotalDeposits = bankUsdcAcc.totalDeposits.toNumber();
    const initTotalDepositShares = bankUsdcAcc.totalDepositShares.toNumber();

    const bankUsdcAtaPda = getBankAtaPda(mint);
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

    bankUsdcAcc = await fetchBankAcc(program, bankUsdcPda);

    const postTotalDeposits = bankUsdcAcc.totalDeposits.toNumber();
    const postTotalDepositShares = bankUsdcAcc.totalDepositShares.toNumber();

    expect(postTotalDeposits).toEqual(initTotalDeposits + amount.toNumber());
    expect(postTotalDepositShares).toEqual(
      initTotalDepositShares + amount.toNumber(),
    );

    const userPda = getUserPda(userA.publicKey);
    const userAcc = await fetchUserAcc(program, userPda);

    expect(userAcc.depositedUsdc.toNumber()).toEqual(amount.toNumber());
    expect(userAcc.depositedUsdcShares.toNumber()).toEqual(
      initTotalDepositShares + amount.toNumber(),
    );

    const { unixTimestamp } = litesvm.getClock();

    expect(bankUsdcAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp,
    );

    const postBankUsdcAtaBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    expect(Number(postBankUsdcAtaBal)).toEqual(
      Number(initBankUsdcAtaBal) + amount.toNumber(),
    );
  });

  test("deposit SOL", async () => {
    const mint = NATIVE_MINT;

    const bankSolPda = getBankPda(mint);
    let bankSolAcc = await fetchBankAcc(program, bankSolPda);

    const initTotalDeposits = bankSolAcc.totalDeposits.toNumber();
    const initTotalDepositShares = bankSolAcc.totalDepositShares.toNumber();

    const bankSolAtaPda = getBankAtaPda(mint);
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

    bankSolAcc = await fetchBankAcc(program, bankSolPda);

    const postTotalDeposits = bankSolAcc.totalDeposits.toNumber();
    const postTotalDepositShares = bankSolAcc.totalDepositShares.toNumber();

    expect(postTotalDeposits).toEqual(initTotalDeposits + amount.toNumber());
    expect(postTotalDepositShares).toEqual(
      initTotalDepositShares + amount.toNumber(),
    );

    const userPda = getUserPda(userA.publicKey);
    const userAcc = await fetchUserAcc(program, userPda);

    expect(userAcc.depositedSol.toNumber()).toEqual(amount.toNumber());
    expect(userAcc.depositedSolShares.toNumber()).toEqual(
      initTotalDepositShares + amount.toNumber(),
    );

    const { unixTimestamp } = litesvm.getClock();

    expect(bankSolAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp,
    );

    const postBankSolAtaBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    expect(Number(postBankSolAtaBal)).toEqual(
      Number(initBankSolAtaBal) + amount.toNumber(),
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
      expectAnchorError(err, "InvalidAmount");
    }
  });
});
