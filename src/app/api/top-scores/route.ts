import { NextResponse } from 'next/server';
import { listTopScores } from '@/lib/rooms';
import { errorResponse } from '../_error';

export const dynamic = 'force-dynamic';

/** GET /api/top-scores — top 5 puntajes históricos por formato (corta / larga). */
export async function GET() {
  try {
    return NextResponse.json(await listTopScores());
  } catch (err) {
    return errorResponse(err);
  }
}
