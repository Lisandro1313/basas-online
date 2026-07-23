import { NextResponse } from 'next/server';
import { loadRoom } from '@/lib/rooms';
import { redact } from '@/lib/game/redact';
import { errorResponse } from '../../_error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rooms/[code]?playerId=...&token=...
 * Devuelve el estado redactado. Sin credenciales válidas se responde la vista
 * de espectador (sin ninguna mano).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId');
    const token = url.searchParams.get('token');

    const row = await loadRoom(code);
    const valid = playerId && token && row.state.tokens[playerId] === token;

    return NextResponse.json({
      version: row.version,
      state: redact(row.state, valid ? playerId : null),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
