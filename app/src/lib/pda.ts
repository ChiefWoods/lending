import { PublicKey } from "@solana/web3.js";
import idl from "../idl/lending.json";

export function getBankPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bank"), mint.toBuffer()],
    new PublicKey(idl.address)
  )[0];
}

export function getUserPda(authority: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user"), authority.toBuffer()],
    new PublicKey(idl.address)
  )[0];
}

export function getBankAtaPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), mint.toBuffer()],
    new PublicKey(idl.address)
  )[0];
}
