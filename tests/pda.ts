import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/lending.json";

const LENDING_PROGRAM_ID = new PublicKey(idl.address);

export function getBankPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bank"), mint.toBuffer()],
    LENDING_PROGRAM_ID,
  )[0];
}

export function getUserPda(authority: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user"), authority.toBuffer()],
    LENDING_PROGRAM_ID,
  )[0];
}

export function getBankAtaPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), mint.toBuffer()],
    LENDING_PROGRAM_ID,
  )[0];
}
