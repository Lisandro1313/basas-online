'use client';

import { Avatar } from './Avatar';
import { AnimatedEmote } from './AnimatedEmote';
import { PlayingCard } from './PlayingCard';
import { SUIT_NAME } from '@/lib/game/cards';
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
 * Mesa ovalada estilo sala de póker.
 *
 * Vos siempre quedás abajo al centro y el resto en sentido horario desde tu
 * lugar. Todo se mide en unidades de container query (cqmin/cqw) sobre la mesa,
 * así escala parejo en teléfono y en pantalla grande.
 *
 * En el paño: a la izquierda la carta de triunfo (fija toda la ronda), y al
 * lado, en fila, las cartas que se van jugando en la baza. Junto a cada jugador
 * se apila boca abajo un "masito" por cada baza que ganó en la ronda.
 */
export function RoundTable({ state, youId, onTable, reveal, reactions }: Props) {
  const total = state.players.length;
  const youIndex = Math.max(0, state.players.findIndex((p) => p.id === youId));

  const angleOf = (seat: number) => (seat / total) * 2 * Math.PI + Math.PI / 2;
  const at = (seat: number, rx: number, ry: number) => {
    const a = angleOf(seat);
    return { left: `${50 + rx * Math.cos(a)}%`, top: `${50 + ry * Math.sin(a)}%` };
  };

  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '';
  const winnerName = reveal ? nameOf(reveal.winnerId) : null;

  // Tamaños relativos a la mesa.
  const avatar = 'clamp(28px, 12cqmin, 60px)';
  const cardW = 'clamp(26px, 9.5cqmin, 52px)';
  const trumpW = 'clamp(30px, 11cqmin, 58px)';
  const plaqueW = 'clamp(52px, 22cqmin, 104px)';
  const nameSize = 'clamp(9px, 3cqmin, 13px)';
  const dataSize = 'clamp(9px, 2.8cqmin, 12px)';
  const tinySize = 'clamp(8px, 2.4cqmin, 11px)';
  const labelSize = 'clamp(10px, 3.4cqmin, 15px)';

  return (
    <div
      className="relative mx-auto aspect-4/3 w-full max-w-184 sm:aspect-16/10"
      style={{ containerType: 'size' }}
    >
      {/* Riel y paño */}
      <div className="table-rail absolute inset-[6%] rounded-[50%]">
        <div className="table-felt absolute inset-[3.5%] rounded-[50%]" />
      </div>

      {/* Triunfo, fijo pegado a la izquierda del paño */}
      {state.trumpCard ? (
        <div
          className="absolute top-1/2 left-[17%] z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
          style={{ containerType: 'inline-size', width: trumpW }}
        >
          <span className="font-semibold text-white/70" style={{ fontSize: tinySize }}>
            Triunfo
          </span>
          <div className="w-full -rotate-6 drop-shadow-lg">
            <PlayingCard card={state.trumpCard} fluid />
          </div>
          <span className="text-center leading-tight text-white/60" style={{ fontSize: tinySize }}>
            {SUIT_NAME[state.trumpCard.suit]}
          </span>
        </div>
      ) : (
        state.phase !== 'lobby' && (
          <div
            className="absolute top-1/2 left-[17%] z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center"
            style={{ width: trumpW }}
          >
            <span className="font-semibold text-white/70" style={{ fontSize: tinySize }}>
              Sin
            </span>
            <span className="font-semibold text-white/70" style={{ fontSize: tinySize }}>
              triunfo
            </span>
          </div>
        )
      )}

      {/* Cartas jugadas, en fila centrada en el paño */}
      <div
        className="absolute top-[41%] left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-end justify-center"
        style={{ gap: '2%', maxWidth: '62%' }}
      >
        {onTable.length === 0 ? (
          <span className="text-white/30" style={{ fontSize: tinySize }}>
            {state.phase === 'bidding' ? 'Apostando…' : 'Esperando…'}
          </span>
        ) : (
          onTable.map((played) => (
            <div
              key={played.card.id}
              className="flex flex-col items-center gap-0.5"
              style={{ containerType: 'inline-size', width: cardW }}
            >
              <div className="w-full drop-shadow-lg">
                <PlayingCard card={played.card} fluid />
              </div>
              <span
                className="max-w-full truncate font-medium text-white/85"
                style={{ fontSize: labelSize }}
              >
                {nameOf(played.playerId)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Aviso de quién se llevó la baza, centrado y despejado de los asientos */}
      {winnerName && onTable.length > 0 && (
        <div
          className="pointer-events-none absolute top-[63%] left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/75 px-2.5 py-1 font-bold text-emerald-300 shadow-lg"
          style={{ fontSize: nameSize }}
        >
          {winnerName} se la llevó
        </div>
      )}

      {/* Jugadores */}
      {state.players.map((player, index) => {
        const seat = (index - youIndex + total) % total;
        const isTurn = index === state.turnIndex && state.phase !== 'roundEnd';
        const isDealer = index === state.dealerIndex;
        const isYou = player.id === youId;
        const madeIt = player.bid !== null && player.tricks === player.bid;
        const reaction = reactions.get(player.id);
        // El masito va hacia el centro del paño: a la derecha si el asiento está
        // en la mitad izquierda, a la izquierda si está en la derecha.
        const pileOnLeft = Math.cos(angleOf(seat)) > 0.15;

        return (
          <div
            key={player.id}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={at(seat, 44, 38)}
          >
            {reaction && (
              <div
                key={reaction.seq}
                className="emote-pop pointer-events-none absolute z-30"
                style={{ top: 'calc(-1 * clamp(28px, 11cqmin, 52px))' }}
              >
                <AnimatedEmote id={reaction.sticker} size={48} muted={false} />
              </div>
            )}

            <div
              className={`relative z-10 rounded-full ring-2 transition ${
                isTurn ? 'turn-ring ring-amber-400' : 'ring-white/25'
              }`}
              style={{ width: avatar, height: avatar }}
            >
              <Avatar name={player.name} avatar={player.avatar} fluid />

              {/* Insignia del repartidor, sobre el avatar */}
              {isDealer && state.phase !== 'lobby' && (
                <span
                  className="absolute -right-1 -bottom-1 z-20 flex items-center justify-center rounded-full bg-linear-to-b from-amber-200 to-amber-400 font-black text-slate-900 shadow-md ring-2 ring-slate-950"
                  style={{
                    width: 'clamp(13px, 4.6cqmin, 20px)',
                    height: 'clamp(13px, 4.6cqmin, 20px)',
                    fontSize: 'clamp(8px, 2.6cqmin, 11px)',
                  }}
                  title="Reparte"
                >
                  D
                </span>
              )}

              {/* Masito: bazas ganadas, hacia el centro del paño */}
              {player.tricks > 0 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={pileOnLeft ? { right: '104%' } : { left: '104%' }}
                >
                  <TrickPile count={player.tricks} />
                </div>
              )}
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

/** Pila de cartas boca abajo, símbolo de las bazas ganadas en la ronda. */
function TrickPile({ count }: { count: number }) {
  const w = 'clamp(9px, 3.4cqmin, 16px)';
  const step = 'clamp(3px, 1.1cqmin, 5px)';
  return (
    <div
      className="mt-1 flex items-center"
      title={`${count} baza${count === 1 ? '' : 's'} ganada${count === 1 ? '' : 's'}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-xs border border-indigo-950 bg-linear-to-br from-indigo-700 to-indigo-950 shadow-sm"
          style={{
            width: w,
            aspectRatio: '5 / 7',
            marginLeft: i === 0 ? 0 : `calc(-1 * (${w} - ${step}))`,
          }}
        />
      ))}
    </div>
  );
}
