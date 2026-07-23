'use client';

import { useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { AVATAR_EMOJIS, MAX_AVATAR_CHARS } from '@/lib/game/types';

interface Props {
  name: string;
  avatar: string | null;
  busy: boolean;
  act: (payload: Record<string, unknown>, opts?: { silent?: boolean }) => Promise<void>;
}

/**
 * Reduce la foto a un cuadrado chico antes de mandarla. La imagen viaja dentro
 * del estado de la sala, que es un documento de Firestore con tope de 1 MB:
 * subir el archivo original lo reventaría con dos jugadores.
 */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const size = 128;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');

  // Recorte cuadrado desde el centro, que es lo que se ve en el redondel.
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size
  );
  bitmap.close();

  // Bajamos calidad hasta entrar en el tope.
  for (const quality of [0.72, 0.6, 0.45, 0.32]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_AVATAR_CHARS) return url;
  }
  throw new Error('No se pudo achicar la foto lo suficiente.');
}

export function AvatarPicker({ name, avatar, busy, act }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setWorking(true);
    try {
      await act({ type: 'avatar', avatar: await shrink(file) });
      setOpen(false);
    } catch {
      setError('No se pudo usar esa imagen. Probá con otra.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-3 py-2 text-left hover:bg-white/15"
      >
        <Avatar name={name} avatar={avatar} size={44} />
        <span className="flex-1 text-sm">
          <span className="block font-semibold">{name}</span>
          <span className="text-white/50">Tocá para cambiar tu avatar</span>
        </span>
        <span className="text-white/40">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-3 rounded-xl border border-white/15 bg-black/30 p-3">
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_EMOJIS.map((emoji) => {
              const selected = avatar === `emoji:${emoji}`;
              return (
                <button
                  key={emoji}
                  disabled={busy || working}
                  onClick={() => void act({ type: 'avatar', avatar: `emoji:${emoji}` })}
                  className={`flex aspect-square items-center justify-center rounded-lg text-2xl transition ${
                    selected ? 'bg-amber-400/30 ring-2 ring-amber-400' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />

          <div className="flex gap-2">
            <button
              disabled={busy || working}
              onClick={() => fileInput.current?.click()}
              className="flex-1 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25 disabled:opacity-40"
            >
              {working ? 'Procesando…' : '📷 Subir foto'}
            </button>
            {avatar && (
              <button
                disabled={busy || working}
                onClick={() => void act({ type: 'avatar', avatar: null })}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20 disabled:opacity-40"
              >
                Quitar
              </button>
            )}
          </div>

          {error && <p className="text-center text-xs text-rose-300">{error}</p>}
          <p className="text-center text-[11px] text-white/40">
            La foto se achica en tu teléfono antes de subirse.
          </p>
        </div>
      )}
    </div>
  );
}
