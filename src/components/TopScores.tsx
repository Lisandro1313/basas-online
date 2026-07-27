'use client';

import { useEffect, useState } from 'react';

interface Score {
  name: string;
  points: number;
  code: string;
  at: number | null;
}

/**
 * Botón "Top históricos" del inicio: abre un panel con los 5 puntajes más altos
 * de todas las partidas, separados en corta y larga. El puntaje es el del
 * ganador de cada mesa (el que más hizo).
 */
export function TopScores({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ corta: Score[]; larga: Score[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    fetch('/api/top-scores')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData({ corta: d.corta ?? [], larga: d.larga ?? [] });
      })
      .catch(() => setError('No se pudo cargar el ranking.'));
  }, [open, data]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/15 ${className}`}
      >
        🏆 Top históricos
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-amber-300">🏆 Top históricos</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {error && <p className="text-center text-sm text-rose-300">{error}</p>}
            {!error && !data && <p className="text-center text-sm text-white/50">Cargando…</p>}

            {data && (
              <div className="space-y-4">
                <ScoreList title="Partida corta" scores={data.corta} />
                <ScoreList title="Partida larga" scores={data.larga} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ScoreList({ title, scores }: { title: string; scores: Score[] }) {
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-bold text-white/80">{title}</h3>
      {scores.length === 0 ? (
        <p className="text-xs text-white/40">Todavía no hay partidas terminadas.</p>
      ) : (
        <ol className="space-y-1">
          {scores.map((s, i) => (
            <li
              key={`${s.code}-${i}`}
              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm"
            >
              <span className="w-5 text-center">{medal[i] ?? i + 1}</span>
              <span className="flex-1 truncate font-medium">{s.name}</span>
              <span className="font-bold text-amber-200">{s.points} pts</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
