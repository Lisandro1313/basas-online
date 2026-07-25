import { NextResponse } from 'next/server';
import { listGames } from '@/lib/rooms';
import { errorResponse } from '../_error';

export const dynamic = 'force-dynamic';

/** GET /api/games — historial de partidas (nombre, quién ganó o si no terminó). */
export async function GET() {
  try {
    return NextResponse.json({ games: await listGames() });
  } catch (err) {
    return errorResponse(err);
  }
}
