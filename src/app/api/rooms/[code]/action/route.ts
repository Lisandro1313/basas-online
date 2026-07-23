import { NextResponse } from 'next/server';
import {
  RuleError,
  addBot,
  nextRound,
  placeBid,
  playAgain,
  playCard,
  removePlayer,
  runBots,
  startGame,
} from '@/lib/game/engine';
import { assertToken, mutateRoom } from '@/lib/rooms';
import { redact } from '@/lib/game/redact';
import { errorResponse } from '../../../_error';

export const dynamic = 'force-dynamic';

/**
 * POST /api/rooms/[code]/action
 * Punto único de entrada para todas las jugadas. El servidor valida turno,
 * credenciales y reglas: el cliente nunca decide nada.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const body = await request.json();
    const { playerId, token, type } = body ?? {};

    if (typeof playerId !== 'string' || typeof token !== 'string') {
      return NextResponse.json({ error: 'Faltan credenciales.' }, { status: 400 });
    }

    const state = await mutateRoom(code, (draft) => {
      assertToken(draft, playerId, token);
      const isHost = draft.hostId === playerId;

      switch (type) {
        case 'addBot':
          if (!isHost) throw new RuleError('Solo el anfitrión puede agregar bots.');
          addBot(draft);
          break;

        case 'start':
          if (!isHost) throw new RuleError('Solo el anfitrión puede empezar la partida.');
          startGame(draft, Number(body.totalRounds) || 8);
          break;

        case 'bid':
          placeBid(draft, playerId, Number(body.bid));
          break;

        case 'play':
          if (typeof body.cardId !== 'string') throw new RuleError('Falta la carta.');
          playCard(draft, playerId, body.cardId);
          break;

        case 'nextRound':
          if (!isHost) throw new RuleError('Solo el anfitrión pasa a la ronda siguiente.');
          nextRound(draft);
          break;

        case 'playAgain':
          if (!isHost) throw new RuleError('Solo el anfitrión puede reiniciar.');
          playAgain(draft);
          break;

        case 'leave':
          removePlayer(draft, playerId);
          break;

        default:
          throw new RuleError('Acción desconocida.');
      }

      // Los bots resuelven sus turnos acá mismo, antes de publicar el estado.
      runBots(draft);
    });

    return NextResponse.json({ state: redact(state, playerId) });
  } catch (err) {
    return errorResponse(err);
  }
}
