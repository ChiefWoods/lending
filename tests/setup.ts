import { AnchorError, Program } from "@coral-xyz/anchor";
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
  SystemProgram,
} from "@solana/web3.js";
import {
  SOL_USD_PRICE_FEED_PDA,
  USDC_MINT,
  USDC_USD_PRICE_FEED_PDA,
} from "./constants";
import { getBankAtaPda } from "./pda";
import { AccountInfoBytes, Clock, LiteSVM } from "litesvm";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import { expect } from "bun:test";

const devnetConnection = new Connection(clusterApiUrl("devnet"));

export async function getSetup(
  accounts: { pubkey: PublicKey; account: AccountInfoBytes }[] = [],
) {
  const litesvm = fromWorkspace("./");

  const [usdcMintData, wrappedSolData] = Array.from({ length: 2 }, () =>
    Buffer.alloc(MINT_SIZE),
  );
  const wrappedSolSupply = 10 ** 12;

  MintLayout.encode(
    {
      mintAuthority: PublicKey.default,
      mintAuthorityOption: 0,
      supply: BigInt(10 ** 6 * 10 ** 6),
      decimals: 6,
      isInitialized: true,
      freezeAuthority: PublicKey.default,
      freezeAuthorityOption: 0,
    },
    usdcMintData,
  );

  MintLayout.encode(
    {
      mintAuthority: PublicKey.default,
      mintAuthorityOption: 0,
      supply: BigInt(wrappedSolSupply),
      decimals: 9,
      isInitialized: true,
      freezeAuthority: PublicKey.default,
      freezeAuthorityOption: 0,
    },
    wrappedSolData,
  );

  litesvm.setAccount(USDC_MINT, {
    data: usdcMintData,
    executable: false,
    lamports: wrappedSolSupply,
    owner: TOKEN_PROGRAM_ID,
  });

  litesvm.setAccount(NATIVE_MINT, {
    data: wrappedSolData,
    executable: false,
    lamports: wrappedSolSupply,
    owner: TOKEN_PROGRAM_ID,
  });

  const [solUsdPriceFeedInfo, usdcUsdPriceFeedInfo] =
    await devnetConnection.getMultipleAccountsInfo([
      SOL_USD_PRICE_FEED_PDA,
      USDC_USD_PRICE_FEED_PDA,
    ]);

  const priceFeedMap = new Map<PublicKey, AccountInfoBytes>([
    [SOL_USD_PRICE_FEED_PDA, solUsdPriceFeedInfo],
    [USDC_USD_PRICE_FEED_PDA, usdcUsdPriceFeedInfo],
  ]);

  for (const [pubkey, info] of priceFeedMap.entries()) {
    litesvm.setAccount(pubkey, {
      data: info.data,
      executable: false,
      lamports: info.lamports,
      owner: info.owner,
    });
  }

  for (const { pubkey, account } of accounts) {
    litesvm.setAccount(new PublicKey(pubkey), {
      data: account.data,
      executable: account.executable,
      lamports: account.lamports,
      owner: new PublicKey(account.owner),
    });
  }

  const provider = new LiteSVMProvider(litesvm);
  const program = new Program<Lending>(idl, provider);

  return { litesvm, provider, program };
}

export function fundedSystemAccountInfo(
  lamports: number = LAMPORTS_PER_SOL,
): AccountInfoBytes {
  return {
    lamports,
    data: Buffer.alloc(0),
    owner: SystemProgram.programId,
    executable: false,
  };
}

export async function expectAnchorError(error: Error, code: string) {
  expect(error).toBeInstanceOf(AnchorError);
  const { errorCode } = (error as AnchorError).error;
  expect(errorCode.code).toBe(code);
}

export async function forwardTime(litesvm: LiteSVM, sec: number) {
  const clock = litesvm.getClock();
  litesvm.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      clock.unixTimestamp + BigInt(sec),
    ),
  );
}

export async function mintToBankUsdc(litesvm: LiteSVM, amount: number) {
  const bankUsdcAtaPda = getBankAtaPda(USDC_MINT);
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

  litesvm.setAccount(bankUsdcAtaPda, {
    data: bankUsdcAtaData,
    executable: false,
    lamports: LAMPORTS_PER_SOL,
    owner: TOKEN_PROGRAM_ID,
  });
}

export async function mintToBankSol(litesvm: LiteSVM, lamports: number) {
  const bankSolAtaPda = getBankAtaPda(NATIVE_MINT);
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

  litesvm.setAccount(bankSolAtaPda, {
    data: bankSolAtaData,
    executable: false,
    lamports,
    owner: TOKEN_PROGRAM_ID,
  });
}
