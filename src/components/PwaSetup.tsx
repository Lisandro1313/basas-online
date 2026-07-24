'use client';

import { useEffect, useState } from 'react';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Registra el service worker (lo que habilita instalar la app) y, cuando el
 * navegador avisa que se puede instalar, muestra un botón discreto.
 */
export function PwaSetup() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* si falla, la app anda igual: el SW es solo para instalarla */
      });
    }

    const onPrompt = (e: Event) => {
      e.preventDefault(); // así lo mostramos nosotros cuando queramos
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => setPrompt(null));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!prompt || hidden) return null;

  return (
    <button
      onClick={async () => {
        await prompt.prompt();
        await prompt.userChoice;
        setPrompt(null);
      }}
      onAuxClick={() => setHidden(true)}
      className="fixed top-2 right-2 z-40 rounded-lg border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-100 shadow-lg hover:bg-amber-400/25"
      title="Instalar Basas como app"
    >
      ⬇ Instalar app
    </button>
  );
}
