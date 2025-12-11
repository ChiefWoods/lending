import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/lending.json";

export const LENDING_PROGRAM_ID = new PublicKey(idl.address);
export const SURFPOOL_RPC_URL = "http://127.0.0.1:8899";

export const USDC_USD_PRICE_UPDATE_V2 = new PublicKey(
  "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
);
export const WBTC_USD_PRICE_UPDATE_V2 = new PublicKey(
  "9gNX5vguzarZZPjTnE1hWze3s6UsZ7dsU3UnAmKPnMHG",
);
// actual mint addresses not used to avoid needing to reset accounts in tests
// export const USDC_MINT = new PublicKey(  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
// export const WBTC_MINT = new PublicKey("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh");
export const USDC_MINT_DECIMALS = 6;
export const WBTC_MINT_DECIMALS = 8;
