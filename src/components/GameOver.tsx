'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { sndFanfare } from '@/lib/client/audio';
import type { PublicState } from '@/lib/game/redact';

interface Props {
  state: PublicState;
  youId: string;
  busy: boolean;
  act: (payload: Record<string, unknown>) => Promise<void>;
}

export function GameOver({ state, youId, busy, act }: Props) {
  const ranking = [...state.players].sort((a, b) => b.points - a.points);
  const champion = ranking[0];
  const youWon = champion?.id === youId;
  const isHost = state.hostId === youId;

  useEffect(() => {
    sndFanfare();
  }, []);

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 p-4">
      <div className="rounded-2xl border border-amber-400/40 bg-black/40 p-8 text-center">
        <p className="text-5xl">{youWon ? '🏆' : '🎉'}</p>
        <h2 className="mt-3 text-2xl font-black text-amber-300">
          {youWon ? '¡Ganaste!' : `Ganó ${champion?.name}`}
        </h2>
        <p className="mt-1 text-white/70">{champion?.points} puntos</p>
      </div>

      <ol className="space-y-1 rounded-2xl border border-white/15 bg-black/30 p-5">
        {ranking.map((p, i) => (
          <li key={p.id} className="flex justify-between rounded px-2 py-1.5 odd:bg-white/5">
            <span>
              {['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} {p.name}
              {p.id === youId && <span className="text-amber-300"> (vos)</span>}
            </span>
            <b className="text-amber-300">{p.points}</b>
          </li>
        ))}
      </ol>

      <div className="flex gap-2">
        <Link
          href="/"
          className="flex-1 rounded-xl bg-white/15 px-4 py-3 text-center font-semibold hover:bg-white/25"
        >
          Salir
        </Link>
        {isHost && (
          <button
            onClick={() => act({ type: 'playAgain' })}
            disabled={busy}
            className="flex-1 rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-40"
          >
            Otra partida
          </button>
        )}
      </div>
    </div>
  );
}
