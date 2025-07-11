import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { USDC_MINT } from "../constants";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getBankAtaPda, getBankPda } from "../pda";
import { fetchBankAcc } from "../accounts";
import { LiteSVM } from "litesvm";
import { LiteSVMProvider } from "anchor-litesvm";
import { fundedSystemAccountInfo, getSetup } from "../setup";

describe("initBank", () => {
  let { litesvm, provider, program } = {} as {
    litesvm: LiteSVM;
    provider: LiteSVMProvider;
    program: Program<Lending>;
  };

  const authority = Keypair.generate();

  const tokenProgram = TOKEN_PROGRAM_ID;

  beforeEach(async () => {
    ({ litesvm, provider, program } = await getSetup([
      {
        pubkey: authority.publicKey,
        account: fundedSystemAccountInfo(),
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

    const bankPda = getBankPda(mint);
    const bankAtaPda = getBankAtaPda(mint);
    const bankAcc = await fetchBankAcc(program, bankPda);

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

    const { unixTimestamp } = litesvm.getClock();
    expect(bankAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);

    const bankAtaAcc = await getAccount(provider.connection, bankAtaPda);

    expect(bankAtaAcc).not.toBeNull();
  });
});
