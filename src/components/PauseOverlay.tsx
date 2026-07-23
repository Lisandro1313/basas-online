'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicState } from '@/lib/game/redact';

interface Props {
  state: PublicState;
  youId: string;
  busy: boolean;
  act: (payload: Record<string, unknown>, opts?: { silent?: boolean }) => Promise<void>;
}

/**
 * Pantalla de pausa. Tapa la mesa —y de paso las cartas— mientras el juego está
 * detenido. Si el anfitrión no vuelve, a los 3 minutos cualquiera reanuda.
 */
export function PauseOverlay({ state, youId, busy, act }: Props) {
  const isHost = state.hostId === youId;
  const offset = useRef(0);
  const [left, setLeft] = useState(state.pauseSeconds);

  useEffect(() => {
    offset.current = state.serverNow - Date.now();
  }, [state.serverNow]);

  useEffect(() => {
    if (!state.pausedAt) return;
    const tick = () => {
      const elapsed = Date.now() + offset.current - state.pausedAt!;
      setLeft(Math.max(0, Math.ceil((state.pauseSeconds * 1000 - elapsed) / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [state.pausedAt, state.pauseSeconds]);

  // Al vencer el plazo, cualquiera avisa y el servidor revalida el reloj.
  const myIndex = state.players.findIndex((p) => p.id === youId);
  useEffect(() => {
    if (!state.pausedAt) return;
    const wait =
      state.pausedAt + state.pauseSeconds * 1000 - (Date.now() + offset.current) + 500 + Math.max(0, myIndex) * 500;
    const id = setTimeout(() => void act({ type: 'resume' }, { silent: true }), Math.max(0, wait));
    return () => clearTimeout(id);
  }, [state.pausedAt, state.pauseSeconds, myIndex, act]);

  const mins = Math.floor(left / 60);
  const secs = left % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-white/20 bg-slate-900/90 p-8 text-center">
        <p className="text-5xl">⏸️</p>
        <h2 className="text-2xl font-bold text-amber-300">Juego en pausa</h2>
        <p className="text-white/70">
          {isHost
            ? 'Cuando quieras, seguimos.'
            : `${state.players.find((p) => p.id === state.hostId)?.name ?? 'El anfitrión'} pausó la partida.`}
        </p>

        <div>
          <p className="font-mono text-3xl font-bold tabular-nums">
            {mins}:{String(secs).padStart(2, '0')}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {left > 0 ? 'Se reanuda solo al llegar a cero' : 'Reanudando…'}
          </p>
        </div>

        {isHost ? (
          <button
            onClick={() => void act({ type: 'resume' })}
            disabled={busy}
            className="w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-40"
          >
            Reanudar
          </button>
        ) : (
          <p className="text-sm text-white/50">
            El reloj de tu turno está congelado, no perdés nada.
          </p>
        )}
      </div>
    </div>
  );
}
