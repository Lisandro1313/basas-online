'use client';

import { useEffect, useRef, useState } from 'react';
import { PlayingCard } from './PlayingCard';
import { PlayerSeat } from './PlayerSeat';
import { SUIT_NAME, valueLabel } from '@/lib/game/cards';
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

  /* --- Baza ganada: se muestra un momento y después la mesa queda vacía --- */
  const [reveal, setReveal] = useState<PublicState['lastTrick']>(null);
  const seenSeq = useRef<number | null>(null);

  useEffect(() => {
    const seq = state.lastTrick?.seq ?? 0;
    if (seenSeq.current === null) {
      seenSeq.current = seq; // primer render: no revivimos bazas viejas
      return;
    }
    if (seq === seenSeq.current || !state.lastTrick) return;

    seenSeq.current = seq;
    setReveal(state.lastTrick);
    sndTrickWon();
    const timer = setTimeout(() => setReveal(null), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [state.lastTrick?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Reloj del turno, corregido contra el reloj del servidor ------------ */
  const offset = useRef(0);
  useEffect(() => {
    offset.current = state.serverNow - Date.now();
  }, [state.serverNow]);

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
      // En el celular la vibración es lo que más se nota si mirás para otro lado.
      navigator.vibrate?.(180);
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
      {/* Cabecera: ronda y triunfo */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-sm">
        <span>
          Ronda <b>{state.round}</b>/{state.totalRounds} · {state.cardsThisRound} cartas
        </span>
        <span className="flex items-center gap-2">
          <span className="text-white/60">Triunfo:</span>
          {state.trumpCard ? (
            <>
              <PlayingCard card={state.trumpCard} size="sm" />
              <b className="text-white/80">
                {valueLabel(state.trumpCard.value)} de {SUIT_NAME[state.trumpCard.suit]}
              </b>
            </>
          ) : (
            <b className="text-white/60">ninguno</b>
          )}
        </span>
      </div>

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

      {/* Jugadores */}
      <div className="flex flex-wrap justify-center gap-2">
        {state.players.map((p, i) => (
          <PlayerSeat
            key={p.id}
            player={p}
            isTurn={i === state.turnIndex && state.phase !== 'roundEnd'}
            isDealer={i === state.dealerIndex}
            isYou={p.id === youId}
            phase={state.phase}
          />
        ))}
      </div>

      {/* Mesa */}
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
        {onTable.length === 0 ? (
          <p className="text-white/40">
            {state.phase === 'bidding' ? 'Fase de apuestas…' : `Juega ${turnPlayer?.name ?? ''}…`}
          </p>
        ) : (
          <>
            <div className={`flex flex-wrap justify-center gap-3 ${reveal ? 'opacity-90' : ''}`}>
              {onTable.map((p) => (
                <div key={p.card.id} className="flex flex-col items-center gap-1">
                  <PlayingCard card={p.card} size="md" />
                  <span className="text-[11px] text-white/70">{nameOf(p.playerId)}</span>
                </div>
              ))}
            </div>
            {reveal && (
              <p className="text-sm font-semibold text-emerald-300">
                {nameOf(reveal.winnerId)} se llevó la baza
              </p>
            )}
          </>
        )}
      </div>

      {/* Panel de apuesta */}
      {state.phase === 'bidding' && you && (
        <div className="rounded-2xl border border-white/15 bg-black/30 p-4">
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
          <div className="flex flex-wrap justify-center gap-1.5">
            {you.hand.map((card) => {
              const playable =
                state.phase === 'playing' && you.isYourTurn && you.playableIds.includes(card.id);
              return (
                <PlayingCard
                  key={card.id}
                  card={card}
                  size="lg"
                  disabled={!playable}
                  glow={playable}
                  onClick={playable ? () => void act({ type: 'play', cardId: card.id }) : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Registro */}
      <details className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm">
        <summary className="cursor-pointer text-white/60">Historial de la mano</summary>
        <ul className="mt-2 space-y-0.5 text-white/70">
          {state.log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
