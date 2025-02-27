import { PublicKey, VersionedTransaction } from "@solana/web3.js"

const headers = {
  'Content-Type': 'application/json',
}

export async function sendTransaction(tx: VersionedTransaction): Promise<string> {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: self.crypto.randomUUID(),
      method: 'sendTransaction',
      params: [
        Buffer.from(tx.serialize()).toString('base64'),
        {
          encoding: 'base64',
          preflightCommitment: 'confirmed',
        },
      ],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error);
  }

  return data.result;
}

export async function getTokenAccountBalance(pubkey: PublicKey): Promise<{
  amount: string,
  decimals: number,
  uiAmount: number | null,
  uiAmountString: string,
}> {
  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: self.crypto.randomUUID(),
      method: 'getTokenAccountBalance',
      params: [pubkey.toBase58()],
    }),
  })

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error);
  }

  return data.result.value;
}