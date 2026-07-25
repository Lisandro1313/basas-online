'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { sndChat, unlockAudio } from '@/lib/client/audio';
import { cloudinaryEnabled, uploadChatImage } from '@/lib/client/cloudinary';
import { MAX_MESSAGE_CHARS } from '@/lib/game/types';
import type { PublicState } from '@/lib/game/redact';

interface Props {
  state: PublicState;
  youId: string;
  act: (payload: Record<string, unknown>, opts?: { silent?: boolean }) => Promise<void>;
}

/**
 * Chat de la sala. En pantalla grande es un panel fijo a la izquierda; en
 * teléfono es una hoja que sube desde abajo con un botón 💬 y globo de no leídos.
 */
export function ChatPanel({ state, youId, act }: Props) {
  const [open, setOpen] = useState(false); // solo aplica en mobile
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messages = state.messages ?? [];
  const listRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // No leídos: contamos los mensajes ajenos con seq mayor al último visto.
  const seenSeq = useRef(0);
  const [unread, setUnread] = useState(0);
  const lastSeq = messages.length ? messages[messages.length - 1].seq : 0;

  // Sonido + contador de no leídos cuando llega algo nuevo de otro.
  useEffect(() => {
    if (seenSeq.current === 0) {
      seenSeq.current = lastSeq; // primer render: no avisamos historial
      return;
    }
    const nuevos = messages.filter((m) => m.seq > seenSeq.current && m.playerId !== youId);
    if (nuevos.length) {
      sndChat();
      if (!open && !isDesktopOpen()) setUnread((n) => n + nuevos.length);
    }
    seenSeq.current = lastSeq;
  }, [lastSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autoscroll al fondo cuando hay mensajes nuevos y el panel se ve.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [lastSeq, open]);

  // Avisar "escribiendo…" como mucho una vez cada 2,5s mientras se teclea.
  const lastTyping = useRef(0);
  const onType = (value: string) => {
    setText(value);
    const now = Date.now();
    if (value && now - lastTyping.current > 2500) {
      lastTyping.current = now;
      void act({ type: 'typing' }, { silent: true });
    }
  };

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    lastTyping.current = 0;
    await act({ type: 'chat', kind: 'text', text: value }, { silent: true });
  };

  const sendImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadChatImage(file);
      await act({ type: 'chat', kind: 'image', url }, { silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la foto.');
    } finally {
      setUploading(false);
    }
  };

  const clearUnread = () => {
    setUnread(0);
    seenSeq.current = lastSeq;
  };

  const body = (
    <>
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <p className="mt-4 text-center text-xs text-white/35">
            Todavía no hay mensajes. ¡Rompé el hielo!
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.playerId === youId;
            const player = state.players.find((p) => p.id === m.playerId);
            return (
              <div key={m.seq} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar name={m.name} avatar={player?.avatar ?? null} size={24} />
                <div className={`max-w-[75%] ${mine ? 'text-right' : ''}`}>
                  <p className="text-[10px] text-white/45">{mine ? 'Vos' : m.name}</p>
                  {m.kind === 'image' ? (
                    <a href={m.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.url}
                        alt="foto"
                        className="mt-0.5 max-h-40 rounded-lg border border-white/10"
                      />
                    </a>
                  ) : (
                    <p
                      className={`mt-0.5 inline-block rounded-lg px-2 py-1 text-sm wrap-break-word ${
                        mine ? 'bg-amber-400/20 text-amber-50' : 'bg-white/10'
                      }`}
                    >
                      {m.text}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}

        {state.typing.length > 0 && (
          <p className="px-1 text-xs text-white/40 italic">
            {state.typing.length === 1
              ? `${state.typing[0]} está escribiendo…`
              : `${state.typing.slice(0, 2).join(', ')} están escribiendo…`}
          </p>
        )}
      </div>

      {error && <p className="px-3 text-center text-[11px] text-rose-300">{error}</p>}

      <div className="flex items-center gap-1 border-t border-white/10 p-2">
        {cloudinaryEnabled() && (
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            title="Enviar una foto"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg hover:bg-white/20 disabled:opacity-40"
          >
            {uploading ? '…' : '📷'}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void sendImage(e.target.files?.[0])}
        />
        <input
          value={text}
          maxLength={MAX_MESSAGE_CHARS}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          onFocus={unlockAudio}
          placeholder="Escribí un mensaje…"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-amber-400"
        />
        <button
          onClick={() => void send()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 font-bold text-slate-900 hover:bg-amber-300"
          title="Enviar"
        >
          ➤
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: panel fijo a la izquierda */}
      <aside className="fixed top-1/2 left-3 z-30 hidden h-[70vh] w-72 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/12 bg-slate-950/85 shadow-2xl backdrop-blur lg:flex">
        <header className="border-b border-white/10 px-3 py-2 text-sm font-semibold text-white/80">
          Chat de la sala
        </header>
        {body}
      </aside>

      {/* Mobile: botón flotante + hoja inferior */}
      <button
        onClick={() => {
          setOpen(true);
          clearUnread();
        }}
        aria-label="Abrir chat"
        className="fixed left-3 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/90 text-2xl shadow-xl hover:bg-slate-700 lg:hidden"
        style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        💬
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <button
            aria-label="Cerrar chat"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative flex h-[75vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/15 bg-slate-950">
            <header className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-sm font-semibold text-white/80">
              Chat de la sala
              <button onClick={() => setOpen(false)} className="px-2 text-white/60">
                ✕
              </button>
            </header>
            {body}
          </div>
        </div>
      )}
    </>
  );
}

/** En desktop el panel siempre está abierto (lg:flex), así no acumulamos no leídos. */
function isDesktopOpen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
}
