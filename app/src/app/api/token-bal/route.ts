import { connection } from "@/lib/constants";
import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const pubkey = searchParams.get("pubkey");

  if (!pubkey) {
    return NextResponse.json(
      {
        error: "'pubkey' required.",
      },
      {
        status: 400,
      }
    )
  }

  try {
    const tokenAmount = (await connection.getTokenAccountBalance(new PublicKey(pubkey))).value;

    if (!tokenAmount.uiAmount) {
      return NextResponse.json(
        {
          error: "ATA does not exist.",
        },
        {
          status: 404,
        }
      )
    }

    return NextResponse.json(
      {
        amount: tokenAmount.uiAmount,
        decimals: tokenAmount.decimals,
      },
      {
        status: 200,
      }
    );
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unable to fetch token balance.",
      },
      {
        status: 500
      }
    )
  }
}