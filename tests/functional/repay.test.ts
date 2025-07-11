import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  expectAnchorError,
  forwardTime,
  fundedSystemAccountInfo,
  getSetup,
  mintToBankSol,
  mintToBankUsdc,
} from "../setup";
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

describe("repay", () => {
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

  test("repay SOL", async () => {
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

    await forwardTime(litesvm, 10); // elapsed 10 secs

    const mint = NATIVE_MINT;
    const amount = new BN(LAMPORTS_PER_SOL); // 1 SOL

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

    await forwardTime(litesvm, 10); // elapsed 10 secs

    const bankSolAta = getBankPda(mint);
    let bankSolAcc = await fetchBankAcc(program, bankSolAta);

    const initBankSolTotalBorrowed = bankSolAcc.totalBorrowed.toNumber();
    const initBankSolTotalBorrowedShares =
      bankSolAcc.totalBorrowedShares.toNumber();

    const userPda = getUserPda(userA.publicKey);
    let userAcc = await fetchUserAcc(program, userPda);

    const initUserBorrowedSol = userAcc.borrowedSol.toNumber();
    const initUserBorrowedSolShares = userAcc.borrowedSolShares.toNumber();

    const bankSolAtaPda = getBankAtaPda(mint);
    const initBankSolAtaAccBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

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

    bankSolAcc = await fetchBankAcc(program, bankSolAta);

    const postBankSolTotalBorrowed = bankSolAcc.totalBorrowed.toNumber();
    const postBankSolTotalBorrowedShares =
      bankSolAcc.totalBorrowedShares.toNumber();

    expect(postBankSolTotalBorrowed).toBeLessThan(initBankSolTotalBorrowed);
    expect(postBankSolTotalBorrowedShares).toBeLessThan(
      initBankSolTotalBorrowedShares,
    );

    userAcc = await fetchUserAcc(program, userPda);

    const postUserBorrowedSol = userAcc.borrowedSol.toNumber();
    const postUserBorrowedSolShares = userAcc.borrowedSolShares.toNumber();

    expect(postUserBorrowedSol).toBeLessThan(initUserBorrowedSol);
    expect(postUserBorrowedSolShares).toBeLessThan(initUserBorrowedSolShares);

    const { unixTimestamp } = litesvm.getClock();

    expect(bankSolAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp,
    );
    expect(userAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);

    const postBankSolAtaAccBal = (
      await getAccount(provider.connection, bankSolAtaPda)
    ).amount;

    expect(Number(postBankSolAtaAccBal)).toBeGreaterThan(
      Number(initBankSolAtaAccBal),
    );
  });

  test("repay USDC", async () => {
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

    await forwardTime(litesvm, 10); // elapsed 10 secs

    const amount = new BN(100 * 10 ** 6); // 100 USDC
    const mint = USDC_MINT;

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

    const bankUsdcAta = getBankPda(mint);
    let bankUsdcAcc = await fetchBankAcc(program, bankUsdcAta);

    const initBankUsdcTotalBorrowed = bankUsdcAcc.totalBorrowed.toNumber();
    const initBankUsdcTotalBorrowedShares =
      bankUsdcAcc.totalBorrowedShares.toNumber();

    const userPda = getUserPda(userA.publicKey);
    let userAcc = await fetchUserAcc(program, userPda);

    const initUserBorrowedUsdc = userAcc.borrowedUsdc.toNumber();
    const initUserBorrowedUsdcShares = userAcc.borrowedUsdcShares.toNumber();

    const bankUsdcAtaPda = getBankAtaPda(mint);
    const initBankUsdcAtaAccBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

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

    bankUsdcAcc = await fetchBankAcc(program, bankUsdcAta);

    const postBankUsdcTotalBorrowed = bankUsdcAcc.totalBorrowed.toNumber();
    const postBankUsdcTotalBorrowedShares =
      bankUsdcAcc.totalBorrowedShares.toNumber();

    expect(postBankUsdcTotalBorrowed).toBeLessThan(initBankUsdcTotalBorrowed);
    expect(postBankUsdcTotalBorrowedShares).toBeLessThan(
      initBankUsdcTotalBorrowedShares,
    );

    userAcc = await fetchUserAcc(program, userPda);

    const postUserBorrowedUsdc = userAcc.borrowedUsdc.toNumber();
    const postUserBorrowedUsdcShares = userAcc.borrowedUsdcShares.toNumber();

    expect(postUserBorrowedUsdc).toBeLessThan(initUserBorrowedUsdc);
    expect(postUserBorrowedUsdcShares).toBeLessThan(initUserBorrowedUsdcShares);

    const { unixTimestamp } = litesvm.getClock();

    expect(bankUsdcAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(
      unixTimestamp,
    );
    expect(userAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);

    const postBankUsdcAtaAccBal = (
      await getAccount(provider.connection, bankUsdcAtaPda)
    ).amount;

    expect(Number(postBankUsdcAtaAccBal)).toBeGreaterThan(
      Number(initBankUsdcAtaAccBal),
    );
  });

  test("throws if repay amount is 0", async () => {
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

    await forwardTime(litesvm, 10); // elapsed 10 secs

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

    await forwardTime(litesvm, 10); // elapsed 10 secs

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
      expectAnchorError(err, "InvalidAmount");
    }
  });

  test("throws if repaying more than borrowed", async () => {
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

    await forwardTime(litesvm, 10); // elapsed 10 secs

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

    await forwardTime(litesvm, 10); // elapsed 10 secs

    const amount = new BN(2 * LAMPORTS_PER_SOL); // 2 SOL

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
      expectAnchorError(err, "ExceededBorrowedAmount");
    }
  });
});
