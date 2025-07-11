import { Program } from "@coral-xyz/anchor";
import { BankrunProvider } from "anchor-bankrun";
import {
  AddedAccount,
  Clock,
  ProgramTestContext,
  startAnchor,
} from "solana-bankrun";
import { Lending } from "../target/types/lending";
import idl from "../target/idl/lending.json";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  MINT_SIZE,
  MintLayout,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  clusterApiUrl,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  SOL_USD_PRICE_FEED_PDA,
  USDC_MINT,
  USDC_USD_PRICE_FEED_PDA,
} from "./constants";
import { BankrunContextWrapper } from "./bankrunContextWrapper";
import { getBankAtaPdaAndBump } from "./pda";

const devnetConnection = new Connection(clusterApiUrl("devnet"));

export async function getBankrunSetup(accounts: AddedAccount[] = []) {
  const context = await startAnchor("", [], accounts, 400000n);

  const provider = new BankrunProvider(context);
  const program = new Program(idl as Lending, provider);
  const wrappedContext = new BankrunContextWrapper(context);

  const usdcMintData = Buffer.alloc(MINT_SIZE);

  MintLayout.encode(
    {
      mintAuthority: context.payer.publicKey, // setting USDC mint manually to override mintAuthority
      mintAuthorityOption: 1,
      supply: BigInt(10 ** 12),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: PublicKey.default,
      freezeAuthorityOption: 0,
    },
    usdcMintData,
  );

  context.setAccount(USDC_MINT, {
    data: usdcMintData,
    executable: false,
    lamports: LAMPORTS_PER_SOL,
    owner: TOKEN_PROGRAM_ID,
  });

  await setPriceFeedAccs(context, [
    SOL_USD_PRICE_FEED_PDA,
    USDC_USD_PRICE_FEED_PDA,
  ]);

  return {
    context,
    provider,
    program,
    wrappedContext,
  };
}

export async function mintToBankUsdc(
  context: ProgramTestContext,
  amount: number,
) {
  const [bankUsdcAtaPda] = getBankAtaPdaAndBump(USDC_MINT);
  const bankUsdcAtaData = Buffer.alloc(ACCOUNT_SIZE);

  AccountLayout.encode(
    {
      amount: BigInt(amount),
      closeAuthority: PublicKey.default,
      closeAuthorityOption: 0,
      delegate: PublicKey.default,
      delegatedAmount: 0n,
      delegateOption: 0,
      isNative: 0n,
      isNativeOption: 0,
      mint: USDC_MINT,
      owner: bankUsdcAtaPda,
      state: 1,
    },
    bankUsdcAtaData,
  );

  context.setAccount(bankUsdcAtaPda, {
    data: bankUsdcAtaData,
    executable: false,
    lamports: LAMPORTS_PER_SOL,
    owner: TOKEN_PROGRAM_ID,
  });
}

export async function mintToBankSol(
  context: ProgramTestContext,
  lamports: number,
) {
  const [bankSolAtaPda] = getBankAtaPdaAndBump(NATIVE_MINT);
  const bankSolAtaData = Buffer.alloc(ACCOUNT_SIZE);

  AccountLayout.encode(
    {
      amount: BigInt(lamports),
      closeAuthority: PublicKey.default,
      closeAuthorityOption: 0,
      delegate: PublicKey.default,
      delegatedAmount: 0n,
      delegateOption: 0,
      isNative: 1n,
      isNativeOption: 1,
      mint: NATIVE_MINT,
      owner: bankSolAtaPda,
      state: 1,
    },
    bankSolAtaData,
  );

  context.setAccount(bankSolAtaPda, {
    data: bankSolAtaData,
    executable: false,
    lamports,
    owner: TOKEN_PROGRAM_ID,
  });
}

export async function setPriceFeedAccs(
  context: ProgramTestContext,
  pubkeys: PublicKey[],
) {
  const accInfos = await devnetConnection.getMultipleAccountsInfo(pubkeys);

  accInfos.forEach((info, i) => {
    context.setAccount(pubkeys[i], info);
  });
}

export async function forwardTime(context: ProgramTestContext, sec: number) {
  const clock = await context.banksClient.getClock();
  context.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      clock.unixTimestamp + BigInt(sec),
    ),
  );
}
