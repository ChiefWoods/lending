import { beforeEach, describe, expect, test } from "bun:test";
import { Lending } from "../../target/types/lending";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { USDC_MINT } from "../constants";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getBankPda } from "../pda";
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
  });

  test("update a bank", async () => {
    const bankPda = getBankPda(USDC_MINT);

    const liquidationThreshold = 9500; // 95% in basis points
    const liquidationBonus = 750; // 7.5% in basis points
    const liquidationCloseFactor = 2000; // 20% in basis points
    const maxLtv = 7500; // 75% in basis points
    const minHealthFactor = 1.5;
    const interestRate = 300; // 3% in basis points

    await program.methods
      .updateBank({
        liquidationThreshold,
        liquidationBonus,
        liquidationCloseFactor,
        maxLtv,
        minHealthFactor,
        interestRate,
      })
      .accountsPartial({
        authority: authority.publicKey,
        bank: bankPda,
      })
      .signers([authority])
      .rpc();

    const bankAcc = await fetchBankAcc(program, bankPda);

    expect(bankAcc.liquidationThreshold).toEqual(liquidationThreshold);
    expect(bankAcc.liquidationBonus).toEqual(liquidationBonus);
    expect(bankAcc.liquidationCloseFactor).toEqual(liquidationCloseFactor);
    expect(bankAcc.maxLtv).toEqual(maxLtv);
    expect(bankAcc.interestRate).toEqual(interestRate);

    const { unixTimestamp } = litesvm.getClock();

    expect(bankAcc.lastUpdated.toNumber()).toBeLessThanOrEqual(unixTimestamp);
  });
});
