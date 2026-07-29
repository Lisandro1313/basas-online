'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Botón para cambiar el estilo/color de la mesa. Aplica un `data-table` en el
 * <html> y globals.css hace el resto (paño, riel y fondo). Por defecto, verde.
 */
type Theme = 'verde' | 'rustica' | 'moderna';

const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: 'verde', label: 'Verde clásico', swatch: 'linear-gradient(135deg,#1c7d54,#0c4229)' },
  { id: 'rustica', label: 'Rústica (vino)', swatch: 'linear-gradient(135deg,#9a4444,#431a1e)' },
  { id: 'moderna', label: 'Moderna (azul)', swatch: 'linear-gradient(135deg,#2b6fa0,#0b2842)' },
];

const KEY = 'basas:tabletheme';

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'rustica' || t === 'moderna' || t === 'verde') return t;
  } catch {
    /* sin storage */
  }
  return 'verde';
}

function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  if (t === 'verde') delete document.documentElement.dataset.table;
  else document.documentElement.dataset.table = t;
}

export function TableTheme() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('verde');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* sin storage */
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Estilo de mesa"
        aria-label="Estilo de mesa"
        className={`rounded px-1.5 py-0.5 transition hover:bg-white/15 ${
          open ? 'text-amber-300' : 'text-white/80'
        }`}
      >
        🎨
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-white/15 bg-slate-950/95 p-2 text-white shadow-2xl backdrop-blur">
          <p className="mb-1.5 px-1 text-xs font-semibold text-white/60">Mesa</p>
          <div className="space-y-1">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => choose(t.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                  theme === t.id ? 'bg-white/15' : 'hover:bg-white/10'
                }`}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full ring-1 ring-white/25"
                  style={{ background: t.swatch }}
                />
                <span className="flex-1">{t.label}</span>
                {theme === t.id && <span className="text-amber-300">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
