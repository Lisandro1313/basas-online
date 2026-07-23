'use client';

import type { PublicState } from '@/lib/game/redact';

interface Props {
  state: PublicState;
  youId: string;
  busy: boolean;
  act: (payload: Record<string, unknown>) => Promise<void>;
}

export function RoundSummary({ state, youId, busy, act }: Props) {
  const last = state.history[state.history.length - 1];
  const isHost = state.hostId === youId;
  const isFinal = state.round >= state.totalRounds;
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '';

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 p-4">
      <div className="rounded-2xl border border-white/15 bg-black/40 p-5">
        <h2 className="mb-4 text-center text-xl font-bold">
          Ronda {last?.round} terminada
        </h2>

        <table className="w-full text-sm">
          <thead className="text-white/60">
            <tr className="border-b border-white/15">
              <th className="py-2 text-left font-medium">Jugador</th>
              <th className="py-2 text-center font-medium">Pidió</th>
              <th className="py-2 text-center font-medium">Hizo</th>
              <th className="py-2 text-right font-medium">Puntos</th>
            </tr>
          </thead>
          <tbody>
            {last?.results.map((r) => {
              const exact = r.bid === r.tricks;
              return (
                <tr key={r.playerId} className="border-b border-white/5">
                  <td className="py-2 font-medium">
                    {nameOf(r.playerId)}
                    {r.playerId === youId && <span className="text-amber-300"> (vos)</span>}
                  </td>
                  <td className="text-center">{r.bid}</td>
                  <td className={`text-center ${exact ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {r.tricks}
                  </td>
                  <td className="py-2 text-right font-bold">
                    +{r.roundPoints}
                    {exact && <span className="ml-1 text-emerald-300">✓</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-white/15 bg-black/30 p-5">
        <h3 className="mb-3 font-bold">Tabla general</h3>
        <ul className="space-y-1">
          {[...state.players]
            .sort((a, b) => b.points - a.points)
            .map((p, i) => (
              <li key={p.id} className="flex justify-between rounded px-2 py-1 odd:bg-white/5">
                <span>
                  {i + 1}. {p.name}
                  {p.id === youId && <span className="text-amber-300"> (vos)</span>}
                </span>
                <b className="text-amber-300">{p.points}</b>
              </li>
            ))}
        </ul>
      </div>

      {isHost ? (
        <button
          onClick={() => act({ type: 'nextRound' })}
          disabled={busy}
          className="w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-40"
        >
          {isFinal ? 'Ver resultado final' : 'Siguiente ronda'}
        </button>
      ) : (
        <p className="text-center text-white/60">
          Esperando al anfitrión para seguir…
        </p>
      )}
    </div>
  );
}
