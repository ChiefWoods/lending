import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js"

export async function serializeAndSendTx(
  tx: Transaction,
): Promise<string> {
  const res = await fetch('/api/transaction', {
    method: 'POST',
    body: JSON.stringify({
      tx: tx.serialize().toString('base64'),
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error);
  }

  return data.signature;
}

export async function serializeAndSendVersionedTx(
  tx: VersionedTransaction,
): Promise<string> {
  const res = await fetch('/api/transaction', {
    method: 'POST',
    body: JSON.stringify({
      tx: Buffer.from(tx.serialize()).toString('base64'),
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error);
  }

  return data.signature;
}

export async function getTokenBal(authority: PublicKey, mint: PublicKey, tokenProgram: PublicKey = TOKEN_PROGRAM_ID): Promise<{ amount: number, decimals: number}> {
  const ataAddress = getAssociatedTokenAddressSync(mint, authority, false, tokenProgram);

  const res = await fetch(`/api/token-bal?pubkey=${ataAddress.toBase58()}`);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error);
  }

  return {
    amount: data.amount,
    decimals: data.decimals,
  }
}