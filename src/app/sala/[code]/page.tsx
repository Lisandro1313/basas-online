'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AudioControls } from '@/components/AudioControls';
import { ChatPanel } from '@/components/ChatPanel';
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

  // Se calcula durante el render, no en un efecto: si esperáramos al efecto, el
  // render en el que la fase pasa a 'roundEnd' vería holdTable todavía en false
  // y desmontaría la mesa por un instante, perdiendo la última baza.
  if (state && prevPhase.current !== state.phase) {
    const previo = prevPhase.current;
    prevPhase.current = state.phase;

    // Solo si veníamos jugando: quien entra o recarga en pleno resumen no espera.
    if (previo === 'playing' && state.phase === 'roundEnd') {
      if (!holdTable) setHoldTable(true);
    } else if (state.phase !== 'roundEnd' && holdTable) {
      setHoldTable(false);
    }
  }

  useEffect(() => {
    if (!holdTable) return;
    const id = setTimeout(() => setHoldTable(false), ROUND_END_HOLD_MS);
    return () => clearTimeout(id);
  }, [holdTable]);

  // El único error que queda es el corte de conexión: se va solo a los 3,5s.
  useEffect(() => {
    if (!room.error) return;
    const id = setTimeout(() => room.dismissError(), 3500);
    return () => clearTimeout(id);
  }, [room.error, room]);

  // Si el servidor ya no reconoce nuestra identidad, volvemos a pedir el nombre.
  // Cuenta tanto estar sentado como estar esperando la próxima mano.
  const knownPlayer = Boolean(
    session &&
      (state?.players.some((p) => p.id === session.playerId) ||
        state?.pending?.some((p) => p.id === session.playerId))
  );
  const waiting = Boolean(
    session && state?.pending?.some((p) => p.id === session.playerId)
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
              className={`h-2 w-2 rounded-full ${
                !room.connected
                  ? 'animate-pulse bg-rose-400'
                  : room.live
                    ? 'bg-emerald-400'
                    : 'bg-amber-400'
              }`}
            />
            {!room.connected ? 'reconectando…' : room.live ? 'en vivo' : 'sincronizando'}
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

      {waiting && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 py-2 text-center text-sm">
          Entraste a la mesa 👋 Empezás a jugar en la <b>próxima mano</b>, con el
          puntaje del que menos tiene.
        </div>
      )}

      <div key={showTable ? 'table' : state.phase} className="screen-in">
        {state.phase === 'lobby' && <Lobby {...props} />}
        {showTable && <GameTable {...props} />}
        {state.phase === 'roundEnd' && !holdTable && <RoundSummary {...props} />}
        {state.phase === 'gameOver' && <GameOver {...props} />}
      </div>

      <ChatPanel state={state} youId={youId} act={room.act} />
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

      <div className="space-y-4 rounded-2xl border border-white/15 bg-black/30 p-5">
        {started && (
          <p className="rounded-lg bg-amber-400/15 px-3 py-2 text-center text-sm text-amber-100">
            La partida está en curso: podés entrar igual y jugás desde la{' '}
            <b>próxima mano</b>, con el puntaje del que menos tiene.
          </p>
        )}
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
          {busy ? 'Entrando…' : started ? 'Sumarme a la mesa' : 'Entrar a la sala'}
        </button>
        {error && <p className="text-center text-sm text-rose-300">{error}</p>}
      </div>
    </main>
  );
}
