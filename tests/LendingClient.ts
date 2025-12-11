import { PublicKey } from "@solana/web3.js";
import { Lending } from "../target/types/lending";
import { ProgramClient } from "./ProgramClient";
import idl from "../target/idl/lending.json";
import { LENDING_PROGRAM_ID } from "./constants";
import { AnchorProvider } from "@coral-xyz/anchor";

export class LendingClient extends ProgramClient<Lending> {
  constructor(provider: AnchorProvider) {
    super(provider, idl);
  }

  static getMarketPda(name: string) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(name)],
      LENDING_PROGRAM_ID,
    )[0];
  }

  static getReservePda(market: PublicKey, liquidityMint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("reserve"), market.toBuffer(), liquidityMint.toBuffer()],
      LENDING_PROGRAM_ID,
    )[0];
  }

  static getObligationPda(authority: PublicKey, market: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("obligation"), authority.toBuffer(), market.toBuffer()],
      LENDING_PROGRAM_ID,
    )[0];
  }

  static getReceiptMint(reservePda: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("receipt_mint"), reservePda.toBuffer()],
      LENDING_PROGRAM_ID,
    )[0];
  }
}
