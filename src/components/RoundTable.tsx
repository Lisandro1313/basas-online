'use client';

import { Avatar } from './Avatar';
import { AnimatedEmote } from './AnimatedEmote';
import { PlayingCard } from './PlayingCard';
import type { ActiveReaction } from '@/lib/client/useReactions';
import type { PublicState } from '@/lib/game/redact';
import type { PlayedCard } from '@/lib/game/types';

interface Props {
  state: PublicState;
  youId: string;
  onTable: PlayedCard[];
  reveal: PublicState['lastTrick'];
  reactions: Map<string, ActiveReaction>;
}

/**
 * Mesa ovalada con los jugadores alrededor, al estilo de una sala de póker.
 *
 * Vos siempre quedás abajo al centro y el resto se reparte en sentido horario
 * desde tu lugar.
 *
 * Clave para que se adapte bien: la mesa es un contenedor de tamaño consultable
 * (`container-type: size`) y TODO adentro se mide en `cqmin` (una fracción del
 * lado menor de la mesa). Así el conjunto escala parejo desde un teléfono
 * angosto hasta una pantalla grande, sin píxeles fijos que se desarmen.
 */
export function RoundTable({ state, youId, onTable, reveal, reactions }: Props) {
  const total = state.players.length;
  const youIndex = Math.max(0, state.players.findIndex((p) => p.id === youId));

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

  // Tamaños relativos a la mesa. cqmin = 1% del lado menor del contenedor.
  const avatar = 'clamp(28px, 12cqmin, 60px)';
  const cardW = 'clamp(30px, 11cqmin, 60px)';
  const plaqueW = 'clamp(52px, 22cqmin, 104px)';
  const nameSize = 'clamp(9px, 3cqmin, 13px)';
  const dataSize = 'clamp(9px, 2.8cqmin, 12px)';

  return (
    <div
      className="relative mx-auto aspect-4/3 w-full max-w-184 sm:aspect-16/10"
      style={{ containerType: 'size' }}
    >
      {/* Riel y paño */}
      <div className="table-rail absolute inset-[6%] rounded-[50%]">
        <div className="table-felt absolute inset-[3.5%] rounded-[50%]" />
      </div>

      {/* Centro */}
      <div className="pointer-events-none absolute top-[36%] left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-center">
        {winnerName && onTable.length > 0 ? (
          <span
            className="rounded-full bg-black/70 px-2.5 py-1 font-bold text-emerald-300 shadow-lg"
            style={{ fontSize: nameSize }}
          >
            {winnerName} se la llevó
          </span>
        ) : (
          onTable.length === 0 && (
            <span className="text-white/30" style={{ fontSize: nameSize }}>
              {state.phase === 'bidding' ? 'Apostando…' : 'Esperando…'}
            </span>
          )
        )}
      </div>

      {/* Cartas de la baza */}
      {onTable.map((played) => (
        <div
          key={played.card.id}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg"
          style={{ ...at(seatOf(played.playerId), 20, 18), width: cardW, containerType: 'inline-size' }}
        >
          <PlayingCard card={played.card} fluid />
        </div>
      ))}

      {/* Botón del repartidor */}
      {state.phase !== 'lobby' && (
        <div
          className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-linear-to-b from-amber-200 to-amber-400 font-black text-slate-900 shadow-md"
          style={{
            ...at((state.dealerIndex - youIndex + total) % total, 33, 28),
            width: 'clamp(14px, 5cqmin, 22px)',
            height: 'clamp(14px, 5cqmin, 22px)',
            fontSize: 'clamp(8px, 2.6cqmin, 11px)',
          }}
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
        const reaction = reactions.get(player.id);

        return (
          <div
            key={player.id}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={at(seat, 45, 43)}
          >
            {reaction && (
              <div
                key={reaction.seq}
                className="emote-pop pointer-events-none absolute z-30"
                style={{ top: 'calc(-1 * clamp(28px, 11cqmin, 52px))' }}
              >
                <AnimatedEmote id={reaction.sticker} size={48} />
              </div>
            )}

            <div
              className={`relative z-10 rounded-full ring-2 transition ${
                isTurn ? 'turn-ring ring-amber-400' : 'ring-white/25'
              }`}
              style={{ width: avatar, height: avatar }}
            >
              <Avatar name={player.name} avatar={player.avatar} fluid />
            </div>

            <div
              className={`rounded-lg border px-1 pb-1 text-center shadow-lg backdrop-blur-sm ${
                isTurn ? 'border-amber-400/70 bg-amber-950/85' : 'border-white/10 bg-slate-950/85'
              }`}
              style={{ width: plaqueW, marginTop: '-12%', paddingTop: '14%' }}
            >
              <p className="truncate leading-tight font-semibold" style={{ fontSize: nameSize }}>
                {player.name}
                {isYou && <span className="text-amber-300"> (vos)</span>}
              </p>

              {state.phase !== 'lobby' && player.bid !== null ? (
                <p
                  className={`font-bold ${madeIt ? 'text-emerald-300' : 'text-white/85'}`}
                  style={{ fontSize: dataSize }}
                >
                  {player.tricks} / {player.bid}
                </p>
              ) : (
                <p className="text-white/45" style={{ fontSize: dataSize }}>
                  {state.phase === 'bidding'
                    ? 'pensando…'
                    : `${player.handCount} ${player.handCount === 1 ? 'carta' : 'cartas'}`}
                </p>
              )}

              <p className="font-medium text-amber-200/90" style={{ fontSize: dataSize }}>
                {player.points} pts
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
