import { parseProgramAccount, parseUser, program } from "@/lib/program";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const pdas = searchParams.getAll("pda");

  try {
    if (!pdas.length) {
      const allUserAcc = await program.account.user.all();

      return NextResponse.json(
        {
          users: allUserAcc.map((user) => parseProgramAccount(user, parseUser)),
        },
        {
          status: 200,
        }
      );
    } else if (pdas.length > 1) {
      const userAccs = await program.account.user.fetchMultiple(pdas);

      return NextResponse.json(
        {
          users: userAccs.map((user, i) => user ? { publicKey: pdas[i], ...parseUser(user) } : null),
        },
        {
          status: 200,
        }
      )
    } else {
      const userAcc = await program.account.user.fetchNullable(pdas[0]);

      return NextResponse.json(
        {
          user: userAcc
            ? { publicKey: pdas[0], ...parseUser(userAcc) }
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
        error: err instanceof Error ? err.message : "Unable to fetch user account(s).",
      },
      {
        status: 500
      }
    )
  }
}