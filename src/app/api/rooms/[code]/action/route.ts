import { NextResponse } from 'next/server';
import {
  RuleError,
  addBot,
  addEmote,
  applyBotMove,
  applyTimeout,
  nextRound,
  pauseExpired,
  pauseGame,
  placeBid,
  playAgain,
  playCard,
  refreshTimers,
  removePlayer,
  resumeGame,
  sendChat,
  sendReaction,
  setAvatar,
  setRoomName,
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

        case 'timeout':
          // Cualquiera puede avisar que venció el turno; el servidor lo verifica.
          applyTimeout(draft);
          break;

        case 'botMove':
          // Igual que el timeout: el cliente avisa, el servidor revalida el reloj.
          applyBotMove(draft);
          break;

        case 'pause':
          if (!isHost) throw new RuleError('Solo el anfitrión puede pausar.');
          pauseGame(draft);
          break;

        case 'resume':
          // El anfitrión reanuda cuando quiere. Pasados los 3 minutos puede
          // hacerlo cualquiera, así una pausa olvidada no congela la partida.
          if (!isHost && !pauseExpired(draft)) {
            throw new RuleError('Solo el anfitrión puede reanudar.');
          }
          resumeGame(draft, !isHost);
          break;

        case 'rename':
          if (!isHost) throw new RuleError('Solo el anfitrión puede renombrar la sala.');
          if (typeof body.name !== 'string') throw new RuleError('Falta el nombre.');
          setRoomName(draft, body.name);
          break;

        case 'avatar':
          setAvatar(draft, playerId, body.avatar ?? null);
          break;

        case 'react':
          if (typeof body.sticker !== 'string') throw new RuleError('Falta el sticker.');
          sendReaction(draft, playerId, body.sticker);
          break;

        case 'addEmote':
          if (typeof body.url !== 'string') throw new RuleError('Falta el video.');
          addEmote(draft, playerId, body.url);
          break;

        case 'chat': {
          const kind = body.kind === 'image' ? 'image' : 'text';
          const content = kind === 'image' ? body.url : body.text;
          if (typeof content !== 'string') throw new RuleError('Falta el mensaje.');
          sendChat(draft, playerId, kind, content);
          break;
        }

        case 'leave':
          removePlayer(draft, playerId);
          break;

        default:
          throw new RuleError('Acción desconocida.');
      }

      refreshTimers(draft);
    });

    return NextResponse.json({ state: redact(state, playerId) });
  } catch (err) {
    return errorResponse(err);
  }
}
