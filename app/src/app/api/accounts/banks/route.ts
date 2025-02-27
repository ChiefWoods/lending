import { parseBank, parseProgramAccount, program } from "@/lib/program";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const pdas = searchParams.getAll("pda");

  try {
    if (!pdas.length) {
      const allBankAcc = await program.account.bank.all();

      return NextResponse.json(
        {
          banks: allBankAcc.map((bank) => parseProgramAccount(bank, parseBank)),
        },
        {
          status: 200,
        }
      );
    } else if (pdas.length > 1) {
      const bankAccs = await program.account.bank.fetchMultiple(pdas);

      return NextResponse.json(
        {
          banks: bankAccs.map((bank, i) => bank ? { publicKey: pdas[i], ...parseBank(bank) } : null),
        },
        {
          status: 200,
        }
      )
    } else {
      const bankAcc = await program.account.bank.fetchNullable(pdas[0]);

      return NextResponse.json(
        {
          bank: bankAcc
            ? { publicKey: pdas[0], ...parseBank(bankAcc) }
            : null,
        },
        {
          status: 200,
        }
      )
    }
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unable to fetch bank account(s).",
      },
      {
        status: 500
      }
    )
  }
}