'use client';

import { SUIT_NAME, SUIT_SYMBOL } from '@/lib/game/cards';
import type { PublicState } from '@/lib/game/redact';

/**
 * Resumen de las manos ya jugadas: cuántas cartas, el triunfo, y cuánto sumó
 * cada uno. Distinto del "Historial de la mano" (que es el log en vivo de la
 * mano actual): esto es el recorrido de toda la partida.
 */
export function GameHistory({ state, youId }: { state: PublicState; youId: string }) {
  if (state.history.length === 0) return null;

  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—';

  return (
    <details className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm">
      <summary className="cursor-pointer text-white/60">
        Historial de la partida ({state.history.length}{' '}
        {state.history.length === 1 ? 'mano' : 'manos'})
      </summary>

      <div className="mt-2 space-y-3">
        {[...state.history].reverse().map((h) => (
          <div key={h.round} className="rounded-lg bg-black/25 p-2">
            <div className="mb-1 flex items-center gap-2 text-xs text-white/60">
              <span className="font-semibold text-white/80">Mano {h.round}</span>
              <span>· {h.cards} cartas</span>
              <span>
                ·{' '}
                {h.trumpSuit ? (
                  <>
                    triunfo{' '}
                    <span
                      className={
                        h.trumpSuit === 'hearts' || h.trumpSuit === 'diamonds'
                          ? 'text-rose-400'
                          : 'text-white'
                      }
                    >
                      {SUIT_SYMBOL[h.trumpSuit]} {SUIT_NAME[h.trumpSuit]}
                    </span>
                  </>
                ) : (
                  'sin triunfo'
                )}
              </span>
            </div>

            <div className="space-y-0.5">
              {[...h.results]
                .sort((a, b) => b.roundPoints - a.roundPoints)
                .map((r) => {
                  const exact = r.bid === r.tricks;
                  return (
                    <div
                      key={r.playerId}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className={r.playerId === youId ? 'text-amber-300' : 'text-white/80'}>
                        {nameOf(r.playerId)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={exact ? 'text-emerald-300' : 'text-white/50'}>
                          {r.tricks}/{r.bid}
                        </span>
                        <span className="w-8 text-right font-semibold text-amber-200">
                          +{r.roundPoints}
                        </span>
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
