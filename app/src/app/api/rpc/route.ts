import { connection } from "@/lib/constants";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();

    const res = await fetch(connection.rpcEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(json),
    })

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error);
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to send transaction.',
      },
      { status: 500 }
    );
  }
}