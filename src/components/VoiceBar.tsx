'use client';

import type { VoiceHook } from '@/lib/client/useVoice';
import type { PublicState } from '@/lib/game/redact';

interface Props {
  voice: VoiceHook;
  state: PublicState;
  youId: string;
}

/**
 * Barra del canal de voz, arriba del chat. Muestra el botón para unirse y, una
 * vez dentro, quién está hablando. Los bots aparecen siempre (su voz es el TTS
 * que suena en cada cliente); los humanos, cuando se conectan.
 */
export function VoiceBar({ voice, state, youId }: Props) {
  const bots = state.players.filter((p) => p.isBot);
  const you = state.players.find((p) => p.id === youId);

  if (!voice.available) return null;

  return (
    <div className="border-b border-white/10 px-3 py-2">
      {!voice.joined ? (
        <button
          onClick={() => void voice.join()}
          disabled={voice.connecting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          🎙️ {voice.connecting ? 'Conectando…' : 'Unirse al canal de voz'}
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              En el canal de voz
            </span>
            <span className="flex gap-1">
              <button
                onClick={voice.toggleMute}
                title={voice.muted ? 'Activar micrófono' : 'Silenciar micrófono'}
                className={`rounded px-1.5 py-0.5 text-sm ${
                  voice.muted ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10 text-white/80'
                }`}
              >
                {voice.muted ? '🔇' : '🎤'}
              </button>
              <button
                onClick={voice.leave}
                title="Salir del canal"
                className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-white/70 hover:bg-white/20"
              >
                ✕
              </button>
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {/* Vos */}
            <Chip name={`${you?.name ?? 'Vos'} (vos)`} speaking={voice.speakingSelf && !voice.muted} kind="human" />
            {/* Otros humanos conectados */}
            {voice.peers.map((p) => (
              <Chip key={p.id} name={p.name} speaking={p.speaking} kind="human" />
            ))}
            {/* Bots (voz por TTS) */}
            {bots.map((b) => (
              <Chip key={b.id} name={b.name} speaking={false} kind="bot" />
            ))}
          </div>

          {voice.peers.length === 0 && bots.length === 0 && (
            <p className="text-[11px] text-white/40">
              Esperando que se conecte alguien más…
            </p>
          )}
        </div>
      )}

      {voice.error && <p className="mt-1 text-[11px] text-rose-300">{voice.error}</p>}
    </div>
  );
}

function Chip({ name, speaking, kind }: { name: string; speaking: boolean; kind: 'human' | 'bot' }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition ${
        speaking ? 'bg-emerald-400/25 text-emerald-100 ring-1 ring-emerald-400' : 'bg-white/8 text-white/70'
      }`}
    >
      <span>{kind === 'bot' ? '🔊' : speaking ? '🗣️' : '🎧'}</span>
      <span className="max-w-24 truncate">{name}</span>
    </span>
  );
}
