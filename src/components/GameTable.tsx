'use client';

import { useEffect, useRef, useState } from 'react';
import { PlayingCard } from './PlayingCard';
import { PauseOverlay } from './PauseOverlay';
import { RoundTable } from './RoundTable';
import { StickerBar } from './StickerBar';
import { GameHistory } from './GameHistory';
import { useReactions } from '@/lib/client/useReactions';
import {
  sndBid,
  sndDeal,
  sndPlayCard,
  sndTick,
  sndTrickWon,
  sndYourTurn,
  unlockAudio,
} from '@/lib/client/audio';
import type { PublicState } from '@/lib/game/redact';

/** Cuánto se queda la baza ganada a la vista antes de recogerse. */
const REVEAL_MS = 2000;

interface Props {
  state: PublicState;
  youId: string;
  busy: boolean;
  act: (payload: Record<string, unknown>, opts?: { silent?: boolean }) => Promise<void>;
}

export function GameTable({ state, youId, busy, act }: Props) {
  const you = state.you;
  const turnPlayer = state.players[state.turnIndex];
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '';

  /* --- Desfasaje contra el reloj del servidor ----------------------------- */
  const offset = useRef(0);
  useEffect(() => {
    offset.current = state.serverNow - Date.now();
  }, [state.serverNow]);

  /* --- Baza ganada: se muestra un momento y después la mesa queda vacía --- */
  const [reveal, setReveal] = useState<PublicState['lastTrick']>(null);
  const seenSeq = useRef<number | null>(null);

  useEffect(() => {
    const seq = state.lastTrick?.seq ?? 0;
    if (seenSeq.current === null) {
      seenSeq.current = seq; // primer render: no revivimos bazas viejas…
      // …salvo que la ronda acabe de terminar, que es justo la baza a mirar.
      if (state.phase === 'roundEnd' && state.lastTrick) setReveal(state.lastTrick);
      return;
    }
    if (seq === seenSeq.current || !state.lastTrick) return;

    seenSeq.current = seq;
    setReveal(state.lastTrick);
    sndTrickWon();

    // Si esta fue la última baza de la ronda, se queda a la vista hasta que la
    // pantalla pase al resumen: es la jugada que define la ronda y hay que verla.
    if (state.phase === 'roundEnd') return;

    // Se recoge cuando el servidor levanta la pausa, así todos ven lo mismo.
    const hasta = state.trickPauseUntil;
    const ms = hasta
      ? Math.max(1000, hasta - (Date.now() + offset.current))
      : REVEAL_MS;

    const timer = setTimeout(() => setReveal(null), ms);
    return () => clearTimeout(timer);
  }, [state.lastTrick?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Reloj del turno ---------------------------------------------------- */
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!state.turnDeadline) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, state.turnDeadline! - (Date.now() + offset.current)));
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [state.turnDeadline]);

  // Al vencer el plazo, cualquiera avisa y el servidor juega solo. El pequeño
  // desfasaje por jugador evita que los cuatro disparen a la vez.
  const myIndex = state.players.findIndex((p) => p.id === youId);
  useEffect(() => {
    if (!state.turnDeadline) return;
    if (state.phase !== 'bidding' && state.phase !== 'playing') return;

    const wait = state.turnDeadline - (Date.now() + offset.current) + 400 + Math.max(0, myIndex) * 500;
    const id = setTimeout(() => void act({ type: 'timeout' }, { silent: true }), Math.max(0, wait));
    return () => clearTimeout(id);
  }, [state.turnDeadline, state.phase, myIndex, act]);

  // Los bots ya no juegan de golpe dentro del request: tienen su propio reloj y
  // el cliente les avisa cuando les toca, igual que con el turno vencido.
  useEffect(() => {
    if (!state.botReadyAt) return;
    const wait =
      state.botReadyAt - (Date.now() + offset.current) + 150 + Math.max(0, myIndex) * 400;
    const id = setTimeout(() => void act({ type: 'botMove' }, { silent: true }), Math.max(0, wait));
    return () => clearTimeout(id);
  }, [state.botReadyAt, myIndex, act]);

  /* --- Sonidos ------------------------------------------------------------ */
  const prevCards = useRef(state.trick.length);
  useEffect(() => {
    if (state.trick.length > prevCards.current) sndPlayCard();
    prevCards.current = state.trick.length;
  }, [state.trick.length]);

  const prevRound = useRef(state.round);
  useEffect(() => {
    if (state.round !== prevRound.current) {
      prevRound.current = state.round;
      sndDeal();
    }
  }, [state.round]);

  /* --- Aviso de turno: sonido, destello y vibración ----------------------- */
  const [flash, setFlash] = useState(false);
  const wasMyTurn = useRef(false);
  useEffect(() => {
    const mine = Boolean(you?.isYourTurn);
    if (mine && !wasMyTurn.current) {
      sndYourTurn();
      setFlash(true);
      // Patrón de vibración (más notorio que un pulso) para cuando el celu está
      // en silencio o mirás para otro lado.
      navigator.vibrate?.([140, 70, 140]);
      const id = setTimeout(() => setFlash(false), 1500);
      wasMyTurn.current = mine;
      return () => clearTimeout(id);
    }
    wasMyTurn.current = mine;
  }, [you?.isYourTurn]);

  const lastTickSecond = useRef(99);
  useEffect(() => {
    const secs = Math.ceil(remaining / 1000);
    if (you?.isYourTurn && secs <= 5 && secs > 0 && secs !== lastTickSecond.current) {
      sndTick();
      if (secs <= 3) navigator.vibrate?.(70);
    }
    lastTickSecond.current = secs;
  }, [remaining, you?.isYourTurn]);

  /* --- Reacciones (stickers) --------------------------------------------- */
  const reactions = useReactions(state, offset.current);

  /* --- Qué se ve en la mesa ---------------------------------------------- */
  const onTable = reveal ? reveal.cards : state.trick;
  const seconds = Math.ceil(remaining / 1000);
  const myTurn = Boolean(you?.isYourTurn);
  // Los avisos rojos son solo para vos: que a otro se le acabe el tiempo no
  // tiene por qué ponerte nervioso.
  const urgent = myTurn && seconds <= 10 && seconds > 0;
  const critical = myTurn && seconds <= 5 && seconds > 0;
  const pct = state.turnDeadline
    ? Math.max(0, Math.min(100, (remaining / (state.turnSeconds * 1000)) * 100))
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-3 pb-6" onPointerDown={unlockAudio}>
      {/* Destello dorado al empezar tu turno */}
      {flash && (
        <div
          aria-hidden
          className="turn-flash pointer-events-none fixed inset-0 z-50"
          style={{ boxShadow: 'inset 0 0 90px 14px rgba(250, 204, 21, 0.75)' }}
        />
      )}

      {/* Latido rojo cuando se te acaba el tiempo */}
      {urgent && (
        <div
          aria-hidden
          className="urgent-vignette pointer-events-none fixed inset-0 z-40"
          style={{ boxShadow: 'inset 0 0 100px 18px rgba(244, 63, 94, 0.85)' }}
        />
      )}
      {/* Cabecera: ronda + tira de manos (el triunfo vive en la mesa) */}
      <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span>
            Ronda <b>{state.round}</b>/{state.totalRounds} · {state.cardsThisRound} cartas
          </span>
          {state.hostId === youId && (
            <button
              onClick={() => void act({ type: 'pause' })}
              disabled={busy}
              title="Pausar el juego"
              className="rounded-lg bg-white/15 px-2 py-1 text-xs font-semibold hover:bg-white/25 disabled:opacity-40"
            >
              ⏸ Pausa
            </button>
          )}
        </div>

        {/* Cuántas cartas se juegan en cada mano; la actual resaltada */}
        {state.roundCards.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {state.roundCards.map((n, i) => {
              const round = i + 1;
              const done = round < state.round;
              const current = round === state.round;
              const noTrump = round === state.totalRounds;
              return (
                <span
                  key={i}
                  title={`Mano ${round}: ${n} carta${n === 1 ? '' : 's'}${
                    noTrump ? ', sin triunfo' : ''
                  }`}
                  className={`flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-bold ${
                    current
                      ? 'bg-amber-400 text-slate-900'
                      : done
                        ? 'bg-white/10 text-white/40'
                        : 'bg-white/5 text-white/70'
                  }`}
                >
                  {n}
                  {noTrump && <span className="ml-0.5 text-[9px] opacity-70">∅</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {state.pausedAt !== null && (
        <PauseOverlay state={state} youId={youId} busy={busy} act={act} />
      )}

      {/* Reloj del turno */}
      {state.turnDeadline && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span
              className={
                myTurn ? 'font-bold text-amber-300' : 'text-white/60'
              }
            >
              {myTurn ? '¡Te toca a vos!' : `Turno de ${turnPlayer?.name}`}
            </span>
            <span
              className={`tabular-nums ${
                critical
                  ? 'beat-fast text-base font-black text-rose-300'
                  : urgent
                    ? 'beat font-bold text-rose-300'
                    : 'text-white/60'
              }`}
            >
              {seconds}s
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-[width] duration-150 ease-linear ${
                urgent ? 'bg-rose-400' : myTurn ? 'bg-amber-400' : 'bg-white/40'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Mesa con los jugadores alrededor */}
      <RoundTable
        state={state}
        youId={youId}
        onTable={onTable}
        reveal={reveal}
        reactions={reactions}
      />

      <StickerBar
        busy={busy}
        myEmotes={state.players.find((p) => p.id === youId)?.emotes ?? []}
        act={act}
      />

      {reveal && state.phase === 'roundEnd' && (
        <p className="text-center text-sm text-white/60">Última de la ronda · va la tabla…</p>
      )}

      {/* Panel de apuesta */}
      {state.phase === 'bidding' && you && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
          {you.isYourTurn ? (
            <>
              <p
                className={`mb-3 text-center font-semibold ${
                  critical ? 'beat-fast text-rose-300' : ''
                }`}
              >
                {critical ? `¡Apostá, ${seconds}s!` : '¿Cuántas bazas vas a ganar?'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {Array.from({ length: state.cardsThisRound + 1 }, (_, n) => {
                  const blocked = you.forbiddenBid === n;
                  return (
                    <button
                      key={n}
                      disabled={busy || blocked}
                      title={
                        blocked
                          ? `No podés pedir ${n}: la suma no puede dar ${state.cardsThisRound}`
                          : undefined
                      }
                      onClick={() => {
                        sndBid();
                        void act({ type: 'bid', bid: n });
                      }}
                      className="h-12 w-12 rounded-lg bg-white/15 text-lg font-bold hover:bg-amber-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/25 disabled:hover:bg-white/5"
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              {you.forbiddenBid !== null && (
                <p className="mt-2 text-center text-xs text-white/50">
                  Repartís vos: no podés cerrar la suma en {state.cardsThisRound}.
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-white/60">
              Esperando la apuesta de <b>{turnPlayer?.name}</b>…
            </p>
          )}
        </div>
      )}

      {/* Tu mano */}
      {you && you.hand.length > 0 && (
        <div className="space-y-2">
          <p className="text-center text-sm text-white/60">
            {state.phase === 'playing' &&
              (you.isYourTurn ? (
                <span
                  className={`inline-block rounded-full px-3 py-1 font-bold ${
                    critical
                      ? 'beat-fast bg-rose-400/25 text-rose-200'
                      : 'beat bg-amber-400/20 text-amber-300'
                  }`}
                >
                  {critical ? `¡Rápido, ${seconds}s!` : '¡Te toca jugar!'}
                </span>
              ) : (
                <>Juega {turnPlayer?.name}…</>
              ))}
          </p>
          {/* Las cartas se reparten el ancho: con muchas se achican para entrar
              en una fila, sin desbordar el teléfono; en pantalla grande topan
              en un tamaño cómodo. El contenedor es la referencia de cqmin. */}
          <div
            className="mx-auto flex justify-center gap-[1.5%]"
            style={{ maxWidth: `${Math.min(you.hand.length, 8) * 4.6}rem` }}
          >
            {you.hand.map((card) => {
              const playable =
                state.phase === 'playing' && you.isYourTurn && you.playableIds.includes(card.id);
              return (
                <div
                  key={card.id}
                  className="min-w-0 flex-1"
                  style={{ maxWidth: '4.4rem', containerType: 'inline-size' }}
                >
                  <PlayingCard
                    card={card}
                    fluid
                    disabled={!playable}
                    glow={playable}
                    onClick={playable ? () => void act({ type: 'play', cardId: card.id }) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Registro de la mano actual */}
      <details className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm">
        <summary className="cursor-pointer text-white/60">Historial de la mano</summary>
        <ul className="mt-2 space-y-0.5 text-white/70">
          {state.log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </details>

      {/* Recorrido de toda la partida */}
      <GameHistory state={state} youId={youId} />

      {/* Administrar jugadores (solo anfitrión): expulsar / sacar bots */}
      {state.hostId === youId && state.players.length > 1 && (
        <details className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm">
          <summary className="cursor-pointer text-white/60">Jugadores</summary>
          <ul className="mt-2 space-y-1">
            {state.players
              .filter((p) => p.id !== youId)
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>
                    {p.name}
                    {p.isBot && <span className="text-white/40"> · bot</span>}
                    {p.kicking && <span className="text-rose-300"> · sale la próxima mano</span>}
                  </span>
                  {!p.kicking && (
                    <button
                      onClick={() => void act({ type: 'kick', targetId: p.id })}
                      disabled={busy}
                      className="rounded px-2 py-0.5 text-xs text-white/50 hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      Expulsar
                    </button>
                  )}
                </li>
              ))}
          </ul>
          <p className="mt-2 text-xs text-white/40">
            En curso, el expulsado se va al arrancar la próxima mano.
          </p>
        </details>
      )}
    </div>
  );
}
