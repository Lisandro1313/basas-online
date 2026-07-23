'use client';

import { PlayingCard } from './PlayingCard';
import { PlayerSeat } from './PlayerSeat';
import { SUIT_NAME, SUIT_SYMBOL } from '@/lib/game/cards';
import type { PublicState } from '@/lib/game/redact';

interface Props {
  state: PublicState;
  youId: string;
  busy: boolean;
  act: (payload: Record<string, unknown>) => Promise<void>;
}

export function GameTable({ state, youId, busy, act }: Props) {
  const you = state.you;
  const turnPlayer = state.players[state.turnIndex];
  const trickToShow = state.trick.length > 0 ? state.trick : state.lastTrick?.cards ?? [];
  const showingLast = state.trick.length === 0 && Boolean(state.lastTrick);

  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-3 pb-6">
      {/* Cabecera: ronda y triunfo */}
      <div className="flex items-center justify-between rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-sm">
        <span>
          Ronda <b>{state.round}</b>/{state.totalRounds} · {state.cardsThisRound} cartas
        </span>
        <span className="flex items-center gap-2">
          Triunfo:
          {state.trumpSuit ? (
            <b
              className={
                state.trumpSuit === 'hearts' || state.trumpSuit === 'diamonds'
                  ? 'text-rose-400'
                  : 'text-white'
              }
            >
              {SUIT_SYMBOL[state.trumpSuit]} {SUIT_NAME[state.trumpSuit]}
            </b>
          ) : (
            <b className="text-white/60">ninguno</b>
          )}
        </span>
      </div>

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
        {trickToShow.length === 0 ? (
          <p className="text-white/50">
            {state.phase === 'bidding'
              ? 'Fase de apuestas…'
              : 'Esperando la primera carta…'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap justify-center gap-3">
              {trickToShow.map((p) => (
                <div key={p.card.id} className="flex flex-col items-center gap-1">
                  <PlayingCard card={p.card} size="md" />
                  <span className="text-[11px] text-white/70">{nameOf(p.playerId)}</span>
                </div>
              ))}
            </div>
            {showingLast && state.lastTrick && (
              <p className="text-sm text-emerald-300">
                {nameOf(state.lastTrick.winnerId)} se llevó la baza
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
              <p className="mb-3 text-center font-semibold">
                ¿Cuántas bazas vas a ganar?
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
                      onClick={() => act({ type: 'bid', bid: n })}
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
                <span className="font-bold text-amber-300">¡Te toca jugar!</span>
              ) : (
                <>Juega {turnPlayer?.name}…</>
              ))}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {you.hand.map((card) => {
              const playable =
                state.phase === 'playing' &&
                you.isYourTurn &&
                you.playableIds.includes(card.id);
              return (
                <PlayingCard
                  key={card.id}
                  card={card}
                  size="lg"
                  disabled={!playable}
                  onClick={
                    playable ? () => act({ type: 'play', cardId: card.id }) : undefined
                  }
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
