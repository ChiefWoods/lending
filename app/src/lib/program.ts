import { BN, IdlAccounts, Program, ProgramAccount } from "@coral-xyz/anchor";
import { Lending } from "../types/lending";
import idl from "../idl/lending.json";
import { connection, SOL_USD_PRICE_FEED_PDA, USDC_USD_PRICE_FEED_PDA } from "./constants";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

export type Bank = IdlAccounts<Lending>["bank"];
export type User = IdlAccounts<Lending>["user"];

export type ParsedProgramAccount<T> = T & {
  publicKey: string,
}

export interface ParsedBank {
  bump: number,
  bankAtaBump: number,
  totalDeposits: number;
  totalDepositShares: number;
  totalBorrowed: number;
  totalBorrowedShares: number;
  liquidationThreshold: number;
  liquidationBonus: number;
  liquidationCloseFactor: number,
  maxLtv: number,
  minHealthFactor: number,
  interestRate: number,
  lastUpdated: number,
  authority: string,
  mint: string,
}

export interface ParsedUser {
  bump: number,
  depositedSol: number;
  depositedSolShares: number;
  borrowedSol: number;
  borrowedSolShares: number;
  depositedUsdc: number;
  depositedUsdcShares: number;
  borrowedUsdc: number;
  borrowedUsdcShares: number,
  healthFactor: number,
  lastUpdated: number,
  authority: string,
  usdcMint: string,
}

export const program = new Program(idl as Lending, { connection });

export async function getInitUserIx({
  usdcMint,
  authority,
}: {
  usdcMint: PublicKey,
  authority: PublicKey,
}): Promise<TransactionInstruction> {
  return await program.methods
    .initUser(usdcMint)
    .accounts({
      authority,
    })
    .instruction();
}

export async function getDepositIx({
  amount,
  authority,
  mintA,
  mintB,
  tokenProgramA,
  tokenProgramB,
}: {
  amount: number,
  authority: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  tokenProgramA: PublicKey,
  tokenProgramB: PublicKey,
}): Promise<TransactionInstruction> {
  return await program.methods
    .deposit(new BN(amount))
    .accounts({
      authority,
      mintA,
      mintB,
      priceUpdateA: SOL_USD_PRICE_FEED_PDA,
      priceUpdateB: USDC_USD_PRICE_FEED_PDA,
      tokenProgramA,
      tokenProgramB,
    })
    .instruction();
};

export async function getWithdrawIx({
  amount,
  authority,
  mintA,
  mintB,
  tokenProgramA,
  tokenProgramB,
}: {
  amount: number,
  authority: PublicKey,
  mintA: PublicKey,
  mintB: PublicKey,
  tokenProgramA: PublicKey,
  tokenProgramB: PublicKey,
}): Promise<TransactionInstruction> {
  return await program.methods
    .withdraw(new BN(amount))
    .accounts({
      authority,
      mintA,
      mintB,
      priceUpdateA: SOL_USD_PRICE_FEED_PDA,
      priceUpdateB: USDC_USD_PRICE_FEED_PDA,
      tokenProgramA,
      tokenProgramB,
    })
    .instruction();
};

export async function getBorrowIx({
  amount,
  authority,
  borrowMint,
  collateralMint,
  tokenProgramA,
  tokenProgramB,
}: {
  amount: number,
  authority: PublicKey,
  borrowMint: PublicKey,
  collateralMint: PublicKey,
  tokenProgramA: PublicKey,
  tokenProgramB: PublicKey,
}): Promise<TransactionInstruction> {
  return await program.methods
    .borrow(new BN(amount))
    .accounts({
      authority,
      mintA: borrowMint,
      mintB: collateralMint,
      priceUpdateA: SOL_USD_PRICE_FEED_PDA,
      priceUpdateB: USDC_USD_PRICE_FEED_PDA,
      tokenProgramA,
      tokenProgramB,
    })
    .instruction();
};

export async function getRepayIx({
  amount,
  authority,
  repayMint,
  collateralMint,
  tokenProgramA,
  tokenProgramB,
}: {
  amount: number,
  authority: PublicKey,
  repayMint: PublicKey,
  collateralMint: PublicKey,
  tokenProgramA: PublicKey,
  tokenProgramB: PublicKey,
}): Promise<TransactionInstruction> {
  return await program.methods
    .repay(new BN(amount))
    .accounts({
      authority,
      mintA: repayMint,
      mintB: collateralMint,
      priceUpdateA: SOL_USD_PRICE_FEED_PDA,
      priceUpdateB: USDC_USD_PRICE_FEED_PDA,
      tokenProgramA,
      tokenProgramB,
    })
    .instruction();
};

export async function getLiquidateIx({
  liquidator,
  borrower,
  borrowedMint,
  collateralMint,
  tokenProgramA,
  tokenProgramB,
}: {
  liquidator: PublicKey,
  borrower: PublicKey,
  borrowedMint: PublicKey,
  collateralMint: PublicKey,
  tokenProgramA: PublicKey,
  tokenProgramB: PublicKey,
}): Promise<TransactionInstruction> {
  return await program.methods
    .liquidate()
    .accounts({
      liquidator,
      borrower,
      borrowedMint,
      collateralMint,
      priceUpdateA: SOL_USD_PRICE_FEED_PDA,
      priceUpdateB: USDC_USD_PRICE_FEED_PDA,
      tokenProgramA,
      tokenProgramB,
    })
    .instruction();
}

export function parseProgramAccount<T, D>(programAccount: ProgramAccount, parser: (account: T) => D) {
  return {
    publicKey: programAccount.publicKey.toBase58(),
    ...parser(programAccount.account),
  }
}

export function parseBank(bank: Bank): ParsedBank {
  return {
    bump: bank.bump,
    bankAtaBump: bank.bankAtaBump,
    totalDeposits: bank.totalDeposits.toNumber(),
    totalDepositShares: bank.totalDepositShares.toNumber(),
    totalBorrowed: bank.totalBorrowed.toNumber(),
    totalBorrowedShares: bank.totalBorrowedShares.toNumber(),
    liquidationThreshold: bank.liquidationThreshold,
    liquidationBonus: bank.liquidationBonus,
    liquidationCloseFactor: bank.liquidationCloseFactor,
    maxLtv: bank.maxLtv,
    minHealthFactor: bank.minHealthFactor,
    interestRate: bank.interestRate,
    lastUpdated: bank.lastUpdated.toNumber(),
    authority: bank.authority.toBase58(),
    mint: bank.mint.toBase58(),
  }
}

export function parseUser(user: User): ParsedUser {
  return {
    bump: user.bump,
    depositedSol: user.depositedSol.toNumber(),
    depositedSolShares: user.depositedSolShares.toNumber(),
    borrowedSol: user.borrowedSol.toNumber(),
    borrowedSolShares: user.borrowedSolShares.toNumber(),
    depositedUsdc: user.depositedUsdc.toNumber(),
    depositedUsdcShares: user.depositedUsdcShares.toNumber(),
    borrowedUsdc: user.borrowedUsdc.toNumber(),
    borrowedUsdcShares: user.borrowedUsdcShares.toNumber(),
    healthFactor: user.healthFactor,
    lastUpdated: user.lastUpdated.toNumber(),
    authority: user.authority.toBase58(),
    usdcMint: user.usdcMint.toBase58(),
  }
}