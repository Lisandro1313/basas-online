'use client';

import type { PublicPlayer } from '@/lib/game/redact';

interface Props {
  player: PublicPlayer;
  isTurn: boolean;
  isDealer: boolean;
  isYou: boolean;
  phase: string;
}

export function PlayerSeat({ player, isTurn, isDealer, isYou, phase }: Props) {
  const showBid = phase !== 'lobby' && player.bid !== null;
  const madeIt = showBid && player.tricks === player.bid;

  return (
    <div
      className={[
        'flex min-w-28 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-center transition',
        isTurn
          ? 'turn-ring border-amber-400 bg-amber-400/15'
          : 'border-white/15 bg-black/25',
      ].join(' ')}
    >
      <div className="flex items-center gap-1">
        <span className="truncate text-sm font-semibold">
          {player.name}
          {isYou && <span className="text-amber-300"> (vos)</span>}
        </span>
        {isDealer && (
          <span
            title="Reparte"
            className="rounded bg-white/20 px-1 text-[10px] font-bold"
          >
            D
          </span>
        )}
      </div>

      <span className="text-[11px] text-white/60">
        {player.isBot ? 'bot' : ''} {player.handCount > 0 && `· ${player.handCount} cartas`}
      </span>

      {showBid ? (
        <span
          className={`text-sm font-bold ${madeIt ? 'text-emerald-300' : 'text-white/80'}`}
        >
          {player.tricks} / {player.bid}
        </span>
      ) : (
        phase === 'bidding' && <span className="text-sm text-white/50">pensando…</span>
      )}

      <span className="text-xs text-amber-200">{player.points} pts</span>
    </div>
  );
}
