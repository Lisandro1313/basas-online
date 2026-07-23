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
 * Mesa ovalada con los jugadores alrededor, tipo sala de póker.
 *
 * Vos siempre quedás abajo al centro y el resto se reparte en sentido horario
 * desde tu lugar: así cada uno ve su propia mesa desde su asiento, igual que
 * sentado de verdad.
 */
export function RoundTable({ state, youId, onTable, reveal }: Props) {
  const total = state.players.length;
  const youIndex = Math.max(0, state.players.findIndex((p) => p.id === youId));

  // Asiento 0 = abajo al centro; se avanza en sentido horario.
  const seatAngle = (seat: number) => (seat / total) * 2 * Math.PI + Math.PI / 2;

  const position = (seat: number) => {
    const angle = seatAngle(seat);
    return {
      left: `${50 + 44 * Math.cos(angle)}%`,
      top: `${50 + 40 * Math.sin(angle)}%`,
    };
  };

  /** Las cartas jugadas se acercan al centro desde el asiento de cada uno. */
  const cardPosition = (seat: number) => {
    const angle = seatAngle(seat);
    return {
      left: `${50 + 20 * Math.cos(angle)}%`,
      top: `${50 + 19 * Math.sin(angle)}%`,
    };
  };

  const seatOf = (playerId: string) => {
    const index = state.players.findIndex((p) => p.id === playerId);
    return (index - youIndex + total) % total;
  };

  return (
    <div className="relative mx-auto aspect-4/3 w-full max-w-2xl sm:aspect-16/10">
      {/* Paño */}
      <div className="absolute inset-[8%] rounded-[50%] border-4 border-amber-900/40 bg-emerald-800/60 shadow-[inset_0_0_60px_rgba(0,0,0,0.45)]" />

      {/* Cartas de la baza en curso */}
      {onTable.map((played) => (
        <div
          key={played.card.id}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={cardPosition(seatOf(played.playerId))}
        >
          <PlayingCard card={played.card} size="sm" />
        </div>
      ))}

      {/* Cartel del ganador de la baza */}
      {reveal && onTable.length > 0 && (
        <div className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/75 px-3 py-1 text-center text-xs font-semibold text-emerald-300">
          {state.players.find((p) => p.id === reveal.winnerId)?.name} se la llevó
        </div>
      )}

      {/* Mensaje del centro cuando no hay cartas */}
      {onTable.length === 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-xs text-white/40">
          {state.phase === 'bidding' ? 'Apostando…' : 'Esperando…'}
        </div>
      )}

      {/* Jugadores */}
      {state.players.map((player, index) => {
        const seat = (index - youIndex + total) % total;
        const isTurn = index === state.turnIndex && state.phase !== 'roundEnd';
        const isDealer = index === state.dealerIndex;
        const isYou = player.id === youId;
        const madeIt = player.bid !== null && player.tricks === player.bid;

        return (
          <div
            key={player.id}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={position(seat)}
          >
            <div
              className={`flex w-24 flex-col items-center gap-0.5 rounded-xl border px-1.5 py-1.5 text-center backdrop-blur-sm transition sm:w-28 ${
                isTurn
                  ? 'turn-ring border-amber-400 bg-amber-400/20'
                  : 'border-white/15 bg-black/60'
              }`}
            >
              <div className="relative">
                <Avatar name={player.name} avatar={player.avatar} size={34} />
                {isDealer && (
                  <span
                    title="Reparte"
                    className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-black text-slate-900"
                  >
                    D
                  </span>
                )}
              </div>

              <span className="w-full truncate text-[11px] font-semibold leading-tight">
                {player.name}
                {isYou && <span className="text-amber-300"> (vos)</span>}
              </span>

              {state.phase !== 'lobby' && player.bid !== null ? (
                <span
                  className={`text-xs font-bold ${madeIt ? 'text-emerald-300' : 'text-white/85'}`}
                >
                  {player.tricks} / {player.bid}
                </span>
              ) : (
                <span className="text-[10px] text-white/45">
                  {state.phase === 'bidding' ? 'pensando…' : `${player.handCount} cartas`}
                </span>
              )}

              <span className="text-[10px] text-amber-200">{player.points} pts</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
