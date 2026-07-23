'use client';

import { useEffect, useState } from 'react';
import { prefEnabled, setPref, startMusic, stopMusic, unlockAudio } from '@/lib/client/audio';

/**
 * Los efectos vienen prendidos y la música apagada. El navegador no deja sonar
 * nada hasta que hay un click, así que la música arranca recién cuando se toca
 * el botón (o al primer gesto, si ya estaba elegida de antes).
 */
export function AudioControls() {
  const [sfx, setSfx] = useState(true);
  const [music, setMusic] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSfx(prefEnabled('sfx'));
    setMusic(prefEnabled('music'));
    setReady(true);
  }, []);

  // Si la música quedó activada de una sesión anterior, esperamos un gesto.
  useEffect(() => {
    if (!ready || !music) return;
    const go = () => {
      unlockAudio();
      startMusic();
      window.removeEventListener('pointerdown', go);
    };
    window.addEventListener('pointerdown', go);
    return () => window.removeEventListener('pointerdown', go);
  }, [ready, music]);

  const toggleSfx = () => {
    const next = !sfx;
    setSfx(next);
    setPref('sfx', next);
    if (next) unlockAudio();
  };

  const toggleMusic = () => {
    const next = !music;
    setMusic(next);
    setPref('music', next);
    unlockAudio();
    if (next) startMusic();
    else stopMusic();
  };

  if (!ready) return null;

  return (
    <span className="flex items-center gap-1">
      <button
        onClick={toggleSfx}
        title={sfx ? 'Silenciar efectos' : 'Activar efectos'}
        aria-label={sfx ? 'Silenciar efectos' : 'Activar efectos'}
        className={`rounded px-1.5 py-0.5 transition hover:bg-white/15 ${
          sfx ? 'text-white/80' : 'text-white/30'
        }`}
      >
        {sfx ? '🔊' : '🔇'}
      </button>
      <button
        onClick={toggleMusic}
        title={music ? 'Apagar música' : 'Poner música'}
        aria-label={music ? 'Apagar música' : 'Poner música'}
        className={`rounded px-1.5 py-0.5 transition hover:bg-white/15 ${
          music ? 'text-amber-300' : 'text-white/30'
        }`}
      >
        ♪
      </button>
    </span>
  );
}
