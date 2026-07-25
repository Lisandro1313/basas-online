'use client';

import { useRef, useState } from 'react';
import { AnimatedEmote } from './AnimatedEmote';
import { STICKERS } from '@/lib/game/stickers';
import { unlockAudio } from '@/lib/client/audio';
import { cloudinaryEnabled, uploadEmote } from '@/lib/client/cloudinary';

interface Props {
  busy: boolean;
  /** Emotes de video propios del jugador (URLs de Cloudinary). */
  myEmotes: string[];
  act: (payload: Record<string, unknown>, opts?: { silent?: boolean }) => Promise<void>;
}

/** Botón flotante + panel para tirar stickers a la mesa (y subir los propios). */
export function StickerBar({ busy, myEmotes, act }: Props) {
  const [open, setOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canUpload = cloudinaryEnabled();

  const send = (sticker: string) => {
    if (cooldown) return;
    unlockAudio();
    void act({ type: 'react', sticker }, { silent: true });
    setCooldown(true);
    setTimeout(() => setCooldown(false), 800);
    setOpen(false);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadEmote(file);
      await act({ type: 'addEmote', url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el video.');
    } finally {
      setUploading(false);
    }
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

      <div
        className="fixed right-3 z-50 flex flex-col items-end gap-2"
        style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {open && (
          <div className="w-[min(90vw,22rem)] space-y-2 rounded-2xl border border-white/15 bg-slate-950/95 p-2 shadow-2xl">
            <div className="grid grid-cols-4 gap-1.5">
              {/* Emotes de video propios primero */}
              {myEmotes.map((url) => (
                <button
                  key={url}
                  onClick={() => send(`url:${url}`)}
                  disabled={cooldown}
                  title="Tu emote"
                  className="flex aspect-square items-center justify-center rounded-xl bg-white/5 transition hover:bg-white/15 disabled:opacity-40"
                >
                  <AnimatedEmote id={`url:${url}`} size={40} />
                </button>
              ))}

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

              {/* Botón + para subir un video propio */}
              {canUpload && (
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading || busy}
                  title="Subir un video"
                  className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-white/25 bg-white/5 text-xl transition hover:bg-white/15 disabled:opacity-40"
                >
                  {uploading ? '…' : '+'}
                </button>
              )}
            </div>

            <input
              ref={fileInput}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => void upload(e.target.files?.[0])}
            />

            {error && <p className="px-1 text-center text-[11px] text-rose-300">{error}</p>}
            {canUpload && !error && (
              <p className="px-1 text-center text-[11px] text-white/40">
                Con + subís un video corto (máx 6s) como emote.
              </p>
            )}
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
