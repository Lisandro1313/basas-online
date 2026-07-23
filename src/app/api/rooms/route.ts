import { NextResponse } from 'next/server';
import { createRoom } from '@/lib/game/engine';
import { insertRoom, makeCode, makeId, makeToken } from '@/lib/rooms';
import { redact } from '@/lib/game/redact';
import { errorResponse } from '../_error';

export const dynamic = 'force-dynamic';

/** POST /api/rooms — crea una sala y devuelve las credenciales del anfitrión. */
export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Poné tu nombre.' }, { status: 400 });
    }

    const hostId = makeId('p');
    const token = makeToken();
    const code = makeCode();
    const state = createRoom(code, name, hostId, token);

    await insertRoom(state);

    return NextResponse.json({
      code,
      playerId: hostId,
      token,
      state: redact(state, hostId),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
