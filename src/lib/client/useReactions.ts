'use client';

import { useEffect, useRef, useState } from 'react';
import { getSticker } from '@/lib/game/stickers';
import { playStickerSound, unlockAudio } from '@/lib/client/audio';
import type { PublicState } from '@/lib/game/redact';

const SHOW_MS = 3000;

export interface ActiveReaction {
  seq: number;
  sticker: string;
}

/**
 * A partir de las reacciones del estado, decide cuáles mostrar ahora (una por
 * jugador, la última) y dispara el sonido de las nuevas una sola vez.
 *
 * `offset` corrige el reloj del cliente contra el del servidor, así el sticker
 * dura lo mismo para todos.
 */
export function useReactions(state: PublicState, offsetMs: number): Map<string, ActiveReaction> {
  const [, force] = useState(0);
  const seenSeq = useRef(0);

  // Sonido de las reacciones nuevas.
  useEffect(() => {
    let maxSeq = seenSeq.current;
    for (const r of state.reactions) {
      if (r.seq > seenSeq.current) {
        unlockAudio();
        playStickerSound(getSticker(r.sticker)?.sound ?? null);
        if (r.seq > maxSeq) maxSeq = r.seq;
      }
    }
    seenSeq.current = maxSeq;
  }, [state.reactions]);

  // Re-render periódico para que los stickers se apaguen solos al vencer.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 400);
    return () => clearInterval(id);
  }, []);

  const now = Date.now() + offsetMs;
  const active = new Map<string, ActiveReaction>();
  for (const r of state.reactions) {
    if (now - r.at < SHOW_MS) {
      // La última de cada jugador gana.
      active.set(r.playerId, { seq: r.seq, sticker: r.sticker });
    }
  }
  return active;
}
