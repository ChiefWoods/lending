import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { getBankrunSetup } from "../setup";
import { USDC_MINT } from "../constants";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getBankAtaPdaAndBump, getBankPdaAndBump } from "../pda";
import { getBankAcc } from "../accounts";

describe("initBank", () => {
  let { context, provider, program } = {} as {
    context: ProgramTestContext;
    provider: BankrunProvider;
    program: Program<Lending>;
  };

  const authority = Keypair.generate();

  const tokenProgram = TOKEN_PROGRAM_ID;

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

  test("initialize a bank", async () => {
    const liquidationThreshold = 9000; // 90% in basis points
    const liquidationBonus = 500; // 5% in basis points
    const liquidationCloseFactor = 2500; // 25% in basis points
    const maxLtv = 8000; // 80% in basis points
    const minHealthFactor = 1.0;
    const interestRate = 250; // 2.5% in basis points
    const mint = USDC_MINT;

    await program.methods
      .initBank({
        liquidationThreshold,
        liquidationBonus,
        liquidationCloseFactor,
        maxLtv,
        minHealthFactor,
        interestRate,
      })
      .accounts({
        authority: authority.publicKey,
        mint,
        tokenProgram,
      })
      .signers([authority])
      .rpc();

    const [bankPda, bankBump] = getBankPdaAndBump(mint);
    const [bankAtaPda, bankAtaBump] = getBankAtaPdaAndBump(mint);
    const bankAcc = await getBankAcc(program, bankPda);

    expect(bankAcc.bump).toEqual(bankBump);
    expect(bankAcc.bankAtaBump).toEqual(bankAtaBump);
    expect(bankAcc.totalDeposits.toNumber()).toEqual(0);
    expect(bankAcc.totalDepositShares.toNumber()).toEqual(0);
    expect(bankAcc.totalBorrowed.toNumber()).toEqual(0);
    expect(bankAcc.totalBorrowedShares.toNumber()).toEqual(0);
    expect(bankAcc.liquidationThreshold).toEqual(liquidationThreshold);
    expect(bankAcc.liquidationBonus).toEqual(liquidationBonus);
    expect(bankAcc.liquidationCloseFactor).toEqual(liquidationCloseFactor);
    expect(bankAcc.maxLtv).toEqual(maxLtv);
    expect(bankAcc.interestRate).toEqual(interestRate);
    expect(bankAcc.authority).toStrictEqual(authority.publicKey);
    expect(bankAcc.mint).toStrictEqual(mint);

    const { unixTimestamp } = await context.banksClient.getClock();

    expect(bankAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);

    const bankAtaAcc = await getAccount(provider.connection, bankAtaPda);

    expect(bankAtaAcc).not.toBeNull();
  });
});
