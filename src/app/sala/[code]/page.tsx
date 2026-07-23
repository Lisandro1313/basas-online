'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AudioControls } from '@/components/AudioControls';
import { GameOver } from '@/components/GameOver';
import { GameTable } from '@/components/GameTable';
import { Lobby } from '@/components/Lobby';
import { RoundSummary } from '@/components/RoundSummary';
import { useRoom } from '@/lib/client/useRoom';
import { lastName, loadSession, rememberName, saveSession, type Session } from '@/lib/client/session';

/** Cuánto se queda la última baza de la ronda a la vista antes del resumen. */
const ROUND_END_HOLD_MS = 5000;

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();

  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession(code));
    setReady(true);
  }, [code]);

  const room = useRoom(code, session);
  const { state } = room;

  /**
   * Al jugarse la última carta la ronda termina de una, así que el resumen
   * taparía la baza que la define. Retenemos la mesa unos segundos para verla.
   */
  const [holdTable, setHoldTable] = useState(false);
  const prevPhase = useRef<string | null>(null);

  useEffect(() => {
    const phase = state?.phase ?? null;
    const previo = prevPhase.current;
    prevPhase.current = phase;

    // Solo si venimos de jugar: quien entra o recarga en pleno resumen no espera.
    if (previo === 'playing' && phase === 'roundEnd') {
      setHoldTable(true);
      const id = setTimeout(() => setHoldTable(false), ROUND_END_HOLD_MS);
      return () => clearTimeout(id);
    }
    if (phase !== 'roundEnd') setHoldTable(false);
  }, [state?.phase]);

  // Si el servidor ya no reconoce nuestra identidad, volvemos a pedir el nombre.
  const knownPlayer = Boolean(
    session && state?.players.some((p) => p.id === session.playerId)
  );

  if (!ready || !state) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-white/60">
        {room.error ? (
          <div className="space-y-3 text-center">
            <p className="text-rose-300">{room.error}</p>
            <Link href="/" className="inline-block rounded-lg bg-white/15 px-4 py-2">
              Volver al inicio
            </Link>
          </div>
        ) : (
          'Cargando sala…'
        )}
      </main>
    );
  }

  if (!knownPlayer) {
    return <JoinForm code={code} onJoined={setSession} state={state} />;
  }

  const youId = session!.playerId;
  const props = { state, youId, busy: room.busy, act: room.act };
  const showTable =
    state.phase === 'bidding' || state.phase === 'playing' || holdTable;

  return (
    <main className="min-h-dvh">
      <div className="flex items-center justify-between px-4 py-2 text-xs text-white/50">
        <Link href="/" className="hover:text-white">
          ← Basas
        </Link>
        <span className="flex items-center gap-3">
          <span className="font-mono tracking-widest text-white/70">{code}</span>
          <AudioControls />
          <span className="flex items-center gap-1">
            <span
              className={`h-2 w-2 rounded-full ${room.live ? 'bg-emerald-400' : 'bg-amber-400'}`}
            />
            {room.live ? 'en vivo' : 'sincronizando'}
          </span>
        </span>
      </div>

      {room.error && (
        <div className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-2 text-sm">
          <span>{room.error}</span>
          <button onClick={room.dismissError} className="px-2 font-bold">
            ✕
          </button>
        </div>
      )}

      {state.phase === 'lobby' && <Lobby {...props} />}
      {showTable && <GameTable {...props} />}
      {state.phase === 'roundEnd' && !holdTable && <RoundSummary {...props} />}
      {state.phase === 'gameOver' && <GameOver {...props} />}
    </main>
  );
}

function JoinForm({
  code,
  state,
  onJoined,
}: {
  code: string;
  state: { phase: string; players: { name: string }[] };
  onJoined: (s: Session) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(lastName()), []);

  const started = state.phase !== 'lobby';

  const join = async () => {
    if (!name.trim()) return setError('Poné tu nombre.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const session = { playerId: data.playerId, token: data.token, name };
      rememberName(name);
      saveSession(code, session);
      onJoined(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 p-6">
      <div className="text-center">
        <p className="text-white/60">Sala</p>
        <p className="font-mono text-4xl font-black tracking-[0.2em] text-amber-300">
          {code}
        </p>
        <p className="mt-2 text-sm text-white/60">
          {state.players.length} jugador(es): {state.players.map((p) => p.name).join(', ')}
        </p>
      </div>

      {started ? (
        <div className="space-y-4 rounded-2xl border border-white/15 bg-black/30 p-6 text-center">
          <p>La partida ya arrancó, no se puede entrar en el medio.</p>
          <p className="text-sm text-white/60">
            Esperá a que termine, o pediles que empiecen una nueva.
          </p>
          <Link href="/" className="inline-block rounded-lg bg-white/15 px-4 py-2">
            Volver al inicio
          </Link>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-white/15 bg-black/30 p-5">
          <label className="block">
            <span className="text-sm text-white/70">Tu nombre</span>
            <input
              value={name}
              maxLength={16}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-3 outline-none focus:border-amber-400"
            />
          </label>
          <button
            onClick={join}
            disabled={busy}
            className="w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-40"
          >
            {busy ? 'Entrando…' : 'Entrar a la sala'}
          </button>
          {error && <p className="text-center text-sm text-rose-300">{error}</p>}
        </div>
      )}
    </main>
  );
}
