'use client';

import { useState } from 'react';
import { Avatar } from './Avatar';
import { AvatarPicker } from './AvatarPicker';
import type { PublicState } from '@/lib/game/redact';
import { MAX_PLAYERS, MIN_PLAYERS } from '@/lib/game/types';

interface Props {
  state: PublicState;
  youId: string;
  busy: boolean;
  act: (payload: Record<string, unknown>, opts?: { silent?: boolean }) => Promise<void>;
}

export function Lobby({ state, youId, busy, act }: Props) {
  const [rounds, setRounds] = useState(8);
  const [copied, setCopied] = useState(false);
  const isHost = state.hostId === youId;
  const canStart = state.players.length >= MIN_PLAYERS;
  const you = state.players.find((p) => p.id === youId);

  const share = async () => {
    const url = `${window.location.origin}/sala/${state.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copiá este link y pasáselo a tus amigos:', url);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 p-4">
      <div className="rounded-2xl border border-white/15 bg-black/30 p-6 text-center">
        {isHost ? (
          <input
            value={state.name}
            maxLength={30}
            onChange={(e) => void act({ type: 'rename', name: e.target.value }, { silent: true })}
            title="Nombre de la sala (lo ven en la lista)"
            className="mb-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-center font-semibold outline-none focus:border-amber-400"
          />
        ) : (
          <p className="mb-2 font-semibold">{state.name}</p>
        )}
        <p className="text-sm text-white/60">Código de la sala</p>
        <p className="my-2 font-mono text-5xl font-black tracking-[0.2em] text-amber-300">
          {state.code}
        </p>
        <button
          onClick={share}
          className="mt-2 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25"
        >
          {copied ? '¡Link copiado!' : 'Copiar link de invitación'}
        </button>

        {isHost && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm">
            <button
              onClick={() => void act({ type: 'visibility', isPublic: !state.isPublic })}
              disabled={busy}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                state.isPublic
                  ? 'bg-emerald-400/20 text-emerald-300'
                  : 'bg-white/10 text-white/70'
              }`}
              title={
                state.isPublic
                  ? 'Aparece en la lista de salas'
                  : 'Solo entra quien tenga el código'
              }
            >
              {state.isPublic ? '🌎 Pública' : '🔒 Privada'}
            </button>
            <span className="text-xs text-white/45">
              {state.isPublic ? 'aparece en la lista' : 'solo con el código'}
            </span>
          </div>
        )}
      </div>

      {you && <AvatarPicker name={you.name} avatar={you.avatar} busy={busy} act={act} />}

      <div className="rounded-2xl border border-white/15 bg-black/30 p-5">
        <h2 className="mb-3 font-bold">
          Jugadores ({state.players.length}/{MAX_PLAYERS})
        </h2>
        <ul className="space-y-2">
          {state.players.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2"
            >
              <Avatar name={p.name} avatar={p.avatar} size={32} />
              <span className="flex-1 font-medium">
                {p.name}
                {p.id === youId && <span className="text-amber-300"> (vos)</span>}
                {p.isBot && <span className="text-white/50"> · bot</span>}
                {p.wins > 0 && <span className="ml-1 text-amber-300">🏆{p.wins}</span>}
              </span>
              {p.id === state.hostId ? (
                <span className="text-xs text-white/60">anfitrión</span>
              ) : (
                isHost && (
                  <button
                    onClick={() => void act({ type: 'kick', targetId: p.id })}
                    disabled={busy}
                    title={p.isBot ? 'Sacar el bot' : 'Expulsar'}
                    className="rounded px-1.5 py-0.5 text-white/40 hover:bg-rose-500/20 hover:text-rose-300"
                  >
                    ✕
                  </button>
                )
              )}
            </li>
          ))}
        </ul>

        {!canStart && (
          <p className="mt-3 text-sm text-white/60">
            Esperando gente… Hacen falta al menos {MIN_PLAYERS} jugadores. Podés
            completar con bots.
          </p>
        )}
      </div>

      {isHost ? (
        <div className="space-y-3 rounded-2xl border border-white/15 bg-black/30 p-5">
          <label className="block text-sm">
            Rondas: <span className="font-bold text-amber-300">{rounds}</span>
            <input
              type="range"
              min={1}
              max={15}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="mt-2 w-full accent-amber-400"
            />
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => act({ type: 'addBot' })}
              disabled={busy || state.players.length >= MAX_PLAYERS}
              className="flex-1 rounded-lg bg-white/15 px-4 py-3 font-semibold hover:bg-white/25 disabled:opacity-40"
            >
              + Agregar bot
            </button>
            <button
              onClick={() => act({ type: 'start', totalRounds: rounds })}
              disabled={busy || !canStart}
              className="flex-1 rounded-lg bg-amber-400 px-4 py-3 font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-40"
            >
              Empezar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center text-white/60">
          Esperando que <b>{state.players.find((p) => p.id === state.hostId)?.name}</b>{' '}
          arranque la partida…
        </p>
      )}
    </div>
  );
}
