import { NextResponse } from 'next/server';
import { addPlayer } from '@/lib/game/engine';
import { makeId, makeToken, mutateRoom } from '@/lib/rooms';
import { redact } from '@/lib/game/redact';
import { errorResponse } from '../../../_error';

export const dynamic = 'force-dynamic';

/** POST /api/rooms/[code]/join — suma un jugador al lobby. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { name } = await request.json();
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Poné tu nombre.' }, { status: 400 });
    }

    const playerId = makeId('p');
    const token = makeToken();

    const state = await mutateRoom(code, (draft) => {
      addPlayer(draft, playerId, name, token);
    });

    return NextResponse.json({
      code: state.code,
      playerId,
      token,
      state: redact(state, playerId),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
