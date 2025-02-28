import { Cluster, clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";

export const MAX_BASIS_POINTS = 10000;

export const cluster: Cluster | "localnet" =
  process.env.NEXT_PUBLIC_SOLANA_RPC_CLUSTER === "localnet"
    ? "localnet"
    : (process.env.NEXT_PUBLIC_SOLANA_RPC_CLUSTER ?? "devnet") as Cluster;

export const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl('devnet'),
  { commitment: 'confirmed' }
);

export const LENDING_LAT = process.env.NEXT_PUBLIC_LENDING_LAT
  ? (await connection.getAddressLookupTable(new PublicKey(process.env.NEXT_PUBLIC_LENDING_LAT))).value
  : null;

export const USDC_MINT = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT!);

export const SOL_USD_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
export const USDC_USD_FEED_ID = "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";
export const SOL_USD_PRICE_FEED_PDA = new PublicKey(
  "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
);
export const USDC_USD_PRICE_FEED_PDA = new PublicKey(
  "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"
);
