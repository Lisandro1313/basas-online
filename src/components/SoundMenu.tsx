'use client';

import { useEffect, useRef, useState } from 'react';
import { getVolume, setVolume, unlockAudio, startMusic, type SoundKind } from '@/lib/client/audio';

/**
 * Un solo control de sonido: el botón 🔊 despliega 4 volúmenes independientes
 * (canal de voz, música, voces de los bots y efectos). Cada uno se guarda solo
 * y se aplica en vivo, así cada jugador arma su mezcla (por ejemplo, música
 * suave y sin voces de bots).
 */
const SLIDERS: { kind: SoundKind; icon: string; label: string }[] = [
  { kind: 'voice', icon: '🎤', label: 'Canal de voz' },
  { kind: 'music', icon: '🎵', label: 'Música de fondo' },
  { kind: 'bots', icon: '🗣️', label: 'Voces de los bots' },
  { kind: 'sfx', icon: '🃏', label: 'Efectos (cartas)' },
];

export function SoundMenu() {
  const [open, setOpen] = useState(false);
  const [vols, setVols] = useState<Record<SoundKind, number>>({
    voice: 1,
    music: 0.4,
    bots: 0.95,
    sfx: 0.9,
  });
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVols({
      voice: getVolume('voice'),
      music: getVolume('music'),
      bots: getVolume('bots'),
      sfx: getVolume('sfx'),
    });
    setReady(true);
  }, []);

  // Si la música quedó con volumen de una sesión anterior, arranca al primer
  // gesto (el navegador no deja sonar nada sin una interacción del usuario).
  useEffect(() => {
    if (!ready || getVolume('music') <= 0) return;
    const go = () => {
      unlockAudio();
      startMusic();
      window.removeEventListener('pointerdown', go);
    };
    window.addEventListener('pointerdown', go);
    return () => window.removeEventListener('pointerdown', go);
  }, [ready]);

  // Cerrar al tocar afuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const change = (kind: SoundKind, value: number) => {
    unlockAudio();
    setVolume(kind, value);
    setVols((v) => ({ ...v, [kind]: value }));
  };

  if (!ready) return null;

  // Ícono según si hay algo sonando.
  const anyOn = vols.voice + vols.music + vols.bots + vols.sfx > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Sonido"
        aria-label="Sonido"
        className={`rounded px-1.5 py-0.5 transition hover:bg-white/15 ${
          open ? 'text-amber-300' : anyOn ? 'text-white/80' : 'text-white/30'
        }`}
      >
        {anyOn ? '🔊' : '🔇'}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-white/15 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur">
          <p className="mb-2 text-xs font-semibold text-white/60">Volumen</p>
          <div className="space-y-3">
            {SLIDERS.map(({ kind, icon, label }) => (
              <label key={kind} className="block">
                <span className="mb-1 flex items-center justify-between text-xs text-white/75">
                  <span className="flex items-center gap-1.5">
                    <span>{icon}</span>
                    {label}
                  </span>
                  <span className="tabular-nums text-white/40">{Math.round(vols[kind] * 100)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(vols[kind] * 100)}
                  onChange={(e) => change(kind, Number(e.target.value) / 100)}
                  className="w-full accent-amber-400"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
