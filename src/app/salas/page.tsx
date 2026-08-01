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

interface GameSummary {
  id: string;
  code: string;
  name: string;
  players: string[];
  status: 'playing' | 'finished' | 'unfinished';
  winner: string | null;
  startedAt: number;
  finishedAt: number | null;
}

const PHASE_LABEL: Record<string, string> = {
  lobby: 'Esperando jugadores',
  bidding: 'Apostando',
  playing: 'Jugando',
  roundEnd: 'Contando puntos',
};

const GAMES_PER_PAGE = 6;

function cuando(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function fechaHora(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SalasPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [gamesPage, setGamesPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => setName(lastName()), []);

  // `withGames` solo al entrar o al tocar "Actualizar": el historial casi no
  // cambia, así que no lo pedimos en cada refresco (ahorra muchas lecturas).
  const load = useCallback(async (withGames = false) => {
    try {
      const reqs: Promise<Response>[] = [fetch('/api/rooms/list', { cache: 'no-store' })];
      if (withGames) reqs.push(fetch('/api/games', { cache: 'no-store' }));
      const [rRes, gRes] = await Promise.all(reqs);
      const rData = await rRes.json();
      if (!rRes.ok) throw new Error(rData.error);
      setRooms(rData.rooms);
      if (gRes && gRes.ok) setGames((await gRes.json()).games);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las salas.');
    }
  }, []);

  // Refresco periódico suave: solo la lista de salas (no el historial). Y NUNCA
  // consulta si la pestaña está oculta (así una ventana olvidada no gasta cuota).
  useEffect(() => {
    void load(true); // al entrar, salas + historial
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load(false);
    }, 20000);
    // Al volver a la pestaña, refrescamos de una.
    const onVis = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
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
          onClick={() => void load(true)}
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

      {/* Historial de partidas, paginado para que no se estire */}
      {games && games.length > 0 && (
        <details className="rounded-2xl border border-white/12 bg-black/30 p-4">
          <summary className="cursor-pointer font-semibold text-white/80">
            Historial de partidas ({games.length})
          </summary>

          {(() => {
            const pages = Math.max(1, Math.ceil(games.length / GAMES_PER_PAGE));
            const page = Math.min(gamesPage, pages - 1);
            const shown = games.slice(page * GAMES_PER_PAGE, page * GAMES_PER_PAGE + GAMES_PER_PAGE);
            return (
              <>
                <ul className="mt-3 space-y-2">
                  {shown.map((g) => (
                    <li key={g.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{g.name}</span>
                        <span className="shrink-0 text-xs text-white/40">
                          {cuando(g.finishedAt ?? g.startedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs">
                        {g.status === 'finished' ? (
                          <span className="text-emerald-300">🏆 Ganó {g.winner ?? '—'}</span>
                        ) : g.status === 'unfinished' ? (
                          <span className="text-white/45">No terminó</span>
                        ) : (
                          <span className="text-amber-300">En juego…</span>
                        )}
                      </p>
                      {g.players.length > 0 && (
                        <p className="mt-0.5 truncate text-xs text-white/45">
                          {g.players.join(' · ')}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-white/30">
                        📅 {fechaHora(g.finishedAt ?? g.startedAt)}
                      </p>
                    </li>
                  ))}
                </ul>

                {pages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <button
                      onClick={() => setGamesPage(page - 1)}
                      disabled={page === 0}
                      className="rounded-lg bg-white/10 px-3 py-1 hover:bg-white/20 disabled:opacity-30"
                    >
                      ← Anteriores
                    </button>
                    <span className="text-xs text-white/50">
                      Página {page + 1} de {pages}
                    </span>
                    <button
                      onClick={() => setGamesPage(page + 1)}
                      disabled={page >= pages - 1}
                      className="rounded-lg bg-white/10 px-3 py-1 hover:bg-white/20 disabled:opacity-30"
                    >
                      Siguientes →
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </details>
      )}
    </main>
  );
}
