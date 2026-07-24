'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lastName, rememberName } from '@/lib/client/session';

interface RoomSummary {
  code: string;
  name: string;
  phase: string;
  playerCount: number;
  playerNames: string[];
  round: number;
  totalRounds: number;
  updatedAt: number;
}

const PHASE_LABEL: Record<string, string> = {
  lobby: 'Esperando jugadores',
  bidding: 'Apostando',
  playing: 'Jugando',
  roundEnd: 'Contando puntos',
};

export default function SalasPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => setName(lastName()), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms/list', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRooms(data.rooms);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las salas.');
    }
  }, []);

  // Refresco periódico: así ves en vivo quién está jugando.
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);

  const enter = (code: string) => {
    if (name.trim()) rememberName(name);
    router.push(`/sala/${code}`);
  };

  return (
    <main className="mx-auto w-full max-w-lg space-y-5 p-5">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-white/60 hover:text-white">
          ← Inicio
        </Link>
        <h1 className="text-xl font-black text-amber-300">Salas</h1>
        <button
          onClick={() => void load()}
          className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
        >
          Actualizar
        </button>
      </header>

      <label className="block rounded-xl border border-white/15 bg-black/30 p-3">
        <span className="text-sm text-white/70">Tu nombre</span>
        <input
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lisandro"
          className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2 outline-none focus:border-amber-400"
        />
      </label>

      {error && <p className="text-center text-sm text-rose-300">{error}</p>}

      {rooms === null ? (
        <p className="text-center text-white/50">Buscando salas…</p>
      ) : rooms.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-white/15 bg-black/30 p-6 text-center">
          <p className="text-white/70">No hay ninguna mesa abierta ahora.</p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-amber-400 px-4 py-2 font-bold text-slate-900 hover:bg-amber-300"
          >
            Crear una
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => {
            const enCurso = r.phase !== 'lobby';
            return (
              <li key={r.code}>
                <button
                  onClick={() => enter(r.code)}
                  className="w-full rounded-xl border border-white/15 bg-black/30 p-3 text-left transition hover:border-amber-400/50 hover:bg-black/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{r.name}</span>
                    <span className="shrink-0 font-mono text-xs tracking-widest text-white/50">
                      {r.code}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium ${
                        enCurso ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/70'
                      }`}
                    >
                      {PHASE_LABEL[r.phase] ?? r.phase}
                    </span>
                    {enCurso && r.totalRounds > 0 && (
                      <span className="text-white/50">
                        mano {r.round}/{r.totalRounds}
                      </span>
                    )}
                    <span className="ml-auto text-white/60">{r.playerCount}/8</span>
                  </div>

                  <p className="mt-1 truncate text-xs text-white/50">
                    {r.playerNames.join(' · ')}
                  </p>

                  <p className="mt-1 text-xs font-semibold text-amber-300">
                    {enCurso ? 'Entrar (jugás la próxima mano) →' : 'Entrar →'}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center text-xs text-white/35">
        Las mesas sin actividad por 30 minutos dejan de aparecer.
      </p>
    </main>
  );
}
