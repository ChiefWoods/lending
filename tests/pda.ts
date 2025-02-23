import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/lending.json";

export function getBankPdaAndBump(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bank"), mint.toBuffer()],
    new PublicKey(idl.address)
  );
}

export function getUserPdaAndBump(authority: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user"), authority.toBuffer()],
    new PublicKey(idl.address)
  );
}

export function getBankAtaPdaAndBump(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), mint.toBuffer()],
    new PublicKey(idl.address)
  );
}
