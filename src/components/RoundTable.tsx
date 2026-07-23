'use client';

import { Avatar } from './Avatar';
import { PlayingCard } from './PlayingCard';
import type { PublicState } from '@/lib/game/redact';
import type { PlayedCard } from '@/lib/game/types';

interface Props {
  state: PublicState;
  youId: string;
  onTable: PlayedCard[];
  reveal: PublicState['lastTrick'];
}

/**
 * Mesa ovalada con los jugadores alrededor, al estilo de una sala de póker.
 *
 * Vos siempre quedás abajo al centro y el resto se reparte en sentido horario
 * desde tu lugar: así cada uno ve su propia mesa desde su asiento, igual que
 * sentado de verdad.
 */
export function RoundTable({ state, youId, onTable, reveal }: Props) {
  const total = state.players.length;
  const youIndex = Math.max(0, state.players.findIndex((p) => p.id === youId));

  // Asiento 0 = abajo al centro; se avanza en sentido horario.
  const angleOf = (seat: number) => (seat / total) * 2 * Math.PI + Math.PI / 2;

  const at = (seat: number, rx: number, ry: number) => {
    const a = angleOf(seat);
    return { left: `${50 + rx * Math.cos(a)}%`, top: `${50 + ry * Math.sin(a)}%` };
  };

  const seatOf = (playerId: string) =>
    (state.players.findIndex((p) => p.id === playerId) - youIndex + total) % total;

  const winnerName = reveal
    ? state.players.find((p) => p.id === reveal.winnerId)?.name
    : null;

  return (
    <div className="relative mx-auto aspect-4/3 w-full max-w-3xl sm:aspect-16/9">
      {/* Riel y paño */}
      <div className="table-rail absolute inset-[7%] rounded-[50%]">
        <div className="table-felt absolute inset-[3.5%] rounded-[50%]" />
      </div>

      {/* Centro: quién se llevó la baza, o el estado de la mano */}
      <div className="pointer-events-none absolute top-[38%] left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-center">
        {winnerName && onTable.length > 0 ? (
          <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-emerald-300 shadow-lg">
            {winnerName} se la llevó
          </span>
        ) : (
          onTable.length === 0 && (
            <span className="text-xs text-white/30">
              {state.phase === 'bidding' ? 'Apostando…' : 'Esperando…'}
            </span>
          )
        )}
      </div>

      {/* Cartas de la baza, cada una saliendo del asiento de quien la tiró */}
      {onTable.map((played) => (
        <div
          key={played.card.id}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg"
          style={at(seatOf(played.playerId), 19, 17)}
        >
          <PlayingCard card={played.card} size="sm" />
        </div>
      ))}

      {/* Botón del repartidor, sobre el paño y al lado de su asiento */}
      {state.phase !== 'lobby' && (
        <div
          className="absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-linear-to-b from-amber-200 to-amber-400 text-[10px] font-black text-slate-900 shadow-md"
          style={at(
            (state.dealerIndex - youIndex + total) % total,
            32,
            27
          )}
          title="Reparte"
        >
          D
        </div>
      )}

      {/* Jugadores */}
      {state.players.map((player, index) => {
        const seat = (index - youIndex + total) % total;
        const isTurn = index === state.turnIndex && state.phase !== 'roundEnd';
        const isYou = player.id === youId;
        const madeIt = player.bid !== null && player.tricks === player.bid;

        return (
          <div
            key={player.id}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={at(seat, 46, 42)}
          >
            {/* Ficha del avatar, montada sobre la placa */}
            <div
              className={`relative z-10 rounded-full ring-2 transition ${
                isTurn ? 'turn-ring ring-amber-400' : 'ring-white/25'
              }`}
            >
              <Avatar name={player.name} avatar={player.avatar} size={40} />
            </div>

            {/* Placa con nombre y datos */}
            <div
              className={`-mt-3 w-22 rounded-lg border px-1.5 pt-3.5 pb-1 text-center shadow-lg backdrop-blur-sm sm:w-26 ${
                isTurn
                  ? 'border-amber-400/70 bg-amber-950/85'
                  : 'border-white/10 bg-slate-950/85'
              }`}
            >
              <p className="truncate text-[11px] leading-tight font-semibold">
                {player.name}
                {isYou && <span className="text-amber-300"> (vos)</span>}
              </p>

              {state.phase !== 'lobby' && player.bid !== null ? (
                <p className={`text-xs font-bold ${madeIt ? 'text-emerald-300' : 'text-white/85'}`}>
                  {player.tricks} / {player.bid}
                </p>
              ) : (
                <p className="text-[10px] text-white/45">
                  {state.phase === 'bidding'
                    ? 'pensando…'
                    : `${player.handCount} ${player.handCount === 1 ? 'carta' : 'cartas'}`}
                </p>
              )}

              <p className="text-[10px] font-medium text-amber-200/90">{player.points} pts</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
