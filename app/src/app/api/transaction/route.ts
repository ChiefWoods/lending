import { connection } from '@/lib/constants';
import { confirmTransaction } from '@solana-developers/helpers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { tx }: { tx: string } =
      await req.json();

    const signature = await connection.sendEncodedTransaction(tx);

    await confirmTransaction(connection, signature);

    return NextResponse.json({ signature });
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
