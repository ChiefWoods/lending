import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { LendingClient } from "../LendingClient";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getSetup, resetAccounts } from "../setup";
import { Program } from "@coral-xyz/anchor";
import { Lending } from "../../target/types/lending";

describe("initializeMarket", () => {
  let client: LendingClient;
  let program: Program<Lending>;
  let connection: Connection;

  let marketAuthority: Keypair;
  let marketPda: PublicKey;

  beforeEach(async () => {
    marketAuthority = Keypair.generate();

    ({ client } = await getSetup([
      {
        publicKey: marketAuthority.publicKey,
      },
    ]));

    program = client.program;
    connection = client.connection;
  });

  test("initialize a market", async () => {
    const name = "Test Market";

    await program.methods
      .initializeMarket(name)
      .accounts({
        authority: marketAuthority.publicKey,
      })
      .signers([marketAuthority])
      .rpc();

    marketPda = LendingClient.getMarketPda(name);
    const marketAcc = await client.fetchProgramAccount(marketPda, "market");

    expect(marketAcc.authority.equals(marketAuthority.publicKey)).toBeTrue();
    expect(marketAcc.name).toBe(name);
  });

  afterEach(async () => {
    await resetAccounts([marketPda]);
  });
});
