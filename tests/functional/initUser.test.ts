import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { USDC_MINT } from "../constants";
import { getUserPda } from "../pda";
import { fetchUserAcc } from "../accounts";
import { LiteSVM } from "litesvm";
import { LiteSVMProvider } from "anchor-litesvm";
import { fundedSystemAccountInfo, getSetup } from "../setup";

describe("initUser", () => {
  let { litesvm, provider, program } = {} as {
    litesvm: LiteSVM;
    provider: LiteSVMProvider;
    program: Program<Lending>;
  };

  const authority = Keypair.generate();

  beforeEach(async () => {
    ({ litesvm, provider, program } = await getSetup([
      {
        pubkey: authority.publicKey,
        account: fundedSystemAccountInfo(),
      },
    ]));
  });

  test("initialize a user", async () => {
    const usdcMint = USDC_MINT;

    await program.methods
      .initUser(usdcMint)
      .accounts({
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    const userPda = getUserPda(authority.publicKey);
    const userAcc = await fetchUserAcc(program, userPda);

    expect(userAcc.depositedSol.toNumber()).toEqual(0);
    expect(userAcc.depositedSolShares.toNumber()).toEqual(0);
    expect(userAcc.borrowedSol.toNumber()).toEqual(0);
    expect(userAcc.borrowedSolShares.toNumber()).toEqual(0);
    expect(userAcc.depositedUsdc.toNumber()).toEqual(0);
    expect(userAcc.depositedUsdcShares.toNumber()).toEqual(0);
    expect(userAcc.borrowedUsdc.toNumber()).toEqual(0);
    expect(userAcc.borrowedUsdcShares.toNumber()).toEqual(0);
    expect(userAcc.healthFactor).toEqual(0);
    expect(userAcc.authority).toStrictEqual(authority.publicKey);
    expect(userAcc.usdcMint).toStrictEqual(usdcMint);

    const { unixTimestamp } = litesvm.getClock();

    expect(userAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);
  });
});
