import { getExplorerLink, getSimulationComputeUnits } from "@solana-developers/helpers";
import { AddressLookupTableAccount, ComputeBudgetProgram, Connection, PublicKey, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { cluster, connection, LENDING_LAT } from "./constants";

export async function getComputeLimitIx(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  lookupTables: Array<AddressLookupTableAccount> = []
): Promise<TransactionInstruction | undefined> {
  const units = await getSimulationComputeUnits(
    connection,
    instructions,
    payer,
    lookupTables
  );

  if (units) {
    return ComputeBudgetProgram.setComputeUnitLimit({
      units: Math.ceil(units * 1.1),
    });
  }
}

export async function setComputeUnitLimitAndPrice(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  lookupTables: Array<AddressLookupTableAccount> = []
): Promise<Transaction> {
  const tx = new Transaction();

  const limitIx = await getComputeLimitIx(
    connection,
    instructions,
    payer,
    lookupTables
  );

  if (limitIx) {
    tx.add(limitIx);
  }

  tx.add(await getComputePriceIx(connection), ...instructions);

  return tx;
}

export async function getComputePriceIx(
  connection: Connection
): Promise<TransactionInstruction> {
  const recentFees = await connection.getRecentPrioritizationFees();
  const priorityFee =
    recentFees.reduce(
      (acc, { prioritizationFee }) => acc + prioritizationFee,
      0
    ) / recentFees.length;

  return ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: BigInt(Math.ceil(priorityFee)),
  });
}

export async function buildTx(ixs: TransactionInstruction[], payer: PublicKey) {
  const lat = LENDING_LAT ? [LENDING_LAT] : [];
  const units = await getSimulationComputeUnits(
    connection,
    ixs,
    payer,
    lat,
  );

  if (!units) {
    throw new Error("Unable to get compute limits.");
  }

  const recentFees = await connection.getRecentPrioritizationFees();
  const priorityFee =
    Math.floor(recentFees.reduce(
      (acc, { prioritizationFee }) => acc + prioritizationFee,
      0
    ) / recentFees.length);

  const ixsWithCompute = [
    ComputeBudgetProgram.setComputeUnitLimit({
      units: Math.ceil(units * 1.1),
    }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFee,
    }),
    ...ixs,
  ];

  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    instructions: ixsWithCompute,
  }).compileToV0Message(lat)

  return new VersionedTransaction(messageV0);
}

export function getTransactionLink(signature: string): string {
  return getExplorerLink('tx', signature, cluster);
}

export function getAccountLink(address: string): string {
  return getExplorerLink('address', address, cluster);
}
