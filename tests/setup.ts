import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { SURFPOOL_RPC_URL } from "./constants";
import { Surfpool } from "./surfpool";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { expect } from "bun:test";
import { LendingClient } from "./LendingClient";

export const connection = new Connection(SURFPOOL_RPC_URL, "processed");
const defaultWallet = new Wallet(Keypair.generate());
const provider = new AnchorProvider(connection, defaultWallet, {
  commitment: "processed",
});
const client = new LendingClient(provider);

await airdropAccount(defaultWallet.publicKey);

export async function airdropAccount(
  publicKey: PublicKey,
  lamports: number = LAMPORTS_PER_SOL,
) {
  await Surfpool.setAccount({
    publicKey: publicKey.toBase58(),
    lamports,
  });
}

export async function getSetup(
  accounts: {
    publicKey: PublicKey;
    lamports?: number;
  }[],
) {
  // airdrops to accounts
  for (const { publicKey, lamports } of accounts) {
    await airdropAccount(publicKey, lamports);
  }

  return { client };
}

export async function expectError(error: Error, code: string) {
  expect(error.message).toInclude(code);
}

export async function expireBlockhash() {
  const currentSlot = await connection.getSlot("processed");
  while (true) {
    const newSlot = await connection.getSlot("processed");
    if (newSlot > currentSlot) break;
  }
}

/**
 * Resets singleton accounts that persist between tests in the Surfpool environment to a default state.
 * @param pubkeys
 */
export async function resetAccounts(pubkeys: PublicKey[]) {
  pubkeys
    .filter((pk) => pk !== undefined && !pk.equals(PublicKey.default))
    .forEach(async (pubkey) => {
      await Surfpool.setAccount({
        publicKey: pubkey.toBase58(),
        lamports: 0,
        // data: Buffer.alloc(0).toBase64(),
        data: Buffer.alloc(0).toString("base64"),
        executable: false,
        owner: SystemProgram.programId.toBase58(),
      });
    });
}

export async function buildAndSendv0Tx(
  ixs: TransactionInstruction[],
  signers: Signer[],
  luts: AddressLookupTableAccount[] = [],
) {
  const messageV0 = new TransactionMessage({
    payerKey: signers[0].publicKey,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: ixs,
  }).compileToV0Message(luts);

  const tx = new VersionedTransaction(messageV0);
  tx.sign(signers);

  const signature = await connection.sendTransaction(tx);
  await connection.confirmTransaction(signature);

  return signature;
}
