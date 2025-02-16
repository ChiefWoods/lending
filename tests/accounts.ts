import { PublicKey } from "@solana/web3.js";
import { Lending } from "../target/types/lending";
import { Program } from "@coral-xyz/anchor";

export async function getBankAcc(
  program: Program<Lending>,
  bankPda: PublicKey
) {
  return await program.account.bank.fetchNullable(bankPda);
}

export async function getUserAcc(
  program: Program<Lending>,
  userPda: PublicKey
) {
  return await program.account.user.fetchNullable(userPda);
}
