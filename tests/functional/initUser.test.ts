import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { getBankrunSetup } from "../setup";
import { USDC_MINT } from "../constants";
import { getUserPdaAndBump } from "../pda";
import { getUserAcc } from "../accounts";

describe("initUser", () => {
  let { context, provider, program } = {} as {
    context: ProgramTestContext;
    provider: BankrunProvider;
    program: Program<Lending>;
  };

  const authority = Keypair.generate();

  beforeEach(async () => {
    ({ context, provider, program } = await getBankrunSetup([
      {
        address: authority.publicKey,
        info: {
          lamports: LAMPORTS_PER_SOL * 5,
          data: Buffer.alloc(0),
          owner: SystemProgram.programId,
          executable: false,
        },
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

    const [userPda, userBump] = getUserPdaAndBump(authority.publicKey);
    const userAcc = await getUserAcc(program, userPda);

    expect(userAcc.bump).toEqual(userBump);
    expect(userAcc.depositedSol.toNumber()).toEqual(0);
    expect(userAcc.depositedSolShares.toNumber()).toEqual(0);
    expect(userAcc.borrowedSol.toNumber()).toEqual(0);
    expect(userAcc.borrowedSolShares.toNumber()).toEqual(0);
    expect(userAcc.depositedUsdc.toNumber()).toEqual(0);
    expect(userAcc.depositedUsdcShares.toNumber()).toEqual(0);
    expect(userAcc.borrowedUsdc.toNumber()).toEqual(0);
    expect(userAcc.borrowedUsdcShares.toNumber()).toEqual(0);
    expect(userAcc.healthFactor.toNumber()).toEqual(0);
    expect(userAcc.authority).toStrictEqual(authority.publicKey);
    expect(userAcc.usdcMint).toStrictEqual(usdcMint);

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(userAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);
  });
});
