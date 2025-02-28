import { getExplorerLink, getSimulationComputeUnits } from "@solana-developers/helpers";
import { ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { cluster, connection, LENDING_LAT } from "./constants";

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
