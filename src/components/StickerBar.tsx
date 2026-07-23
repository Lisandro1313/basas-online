'use client';

import { useState } from 'react';
import { AnimatedEmote } from './AnimatedEmote';
import { STICKERS } from '@/lib/game/stickers';
import { unlockAudio } from '@/lib/client/audio';

interface Props {
  busy: boolean;
  act: (payload: Record<string, unknown>, opts?: { silent?: boolean }) => Promise<void>;
}

/** Botón flotante + panel para tirar stickers a la mesa. */
export function StickerBar({ act }: Props) {
  const [open, setOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const send = (id: string) => {
    if (cooldown) return;
    unlockAudio();
    void act({ type: 'react', sticker: id }, { silent: true });
    // El servidor limita a uno cada 700 ms; acá lo reflejamos para no spamear.
    setCooldown(true);
    setTimeout(() => setCooldown(false), 800);
    setOpen(false);
  };

  return (
    <>
      {open && (
        <button
          aria-label="Cerrar stickers"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 cursor-default"
        />
      )}

      <div className="fixed right-3 bottom-3 z-50 flex flex-col items-end gap-2">
        {open && (
          <div className="grid max-w-[min(88vw,20rem)] grid-cols-4 gap-1.5 rounded-2xl border border-white/15 bg-slate-950/95 p-2 shadow-2xl">
            {STICKERS.map((s) => (
              <button
                key={s.id}
                onClick={() => send(s.id)}
                disabled={cooldown}
                title={s.label}
                className="flex aspect-square items-center justify-center rounded-xl bg-white/5 transition hover:bg-white/15 disabled:opacity-40"
              >
                <AnimatedEmote id={s.id} size={40} />
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Stickers"
          className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl shadow-xl transition ${
            open ? 'bg-amber-400 text-slate-900' : 'bg-slate-800/90 hover:bg-slate-700'
          }`}
        >
          😀
        </button>
      </div>
    </>
  );
}
