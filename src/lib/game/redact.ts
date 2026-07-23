import { PAUSE_SECONDS, TURN_SECONDS, forbiddenBid } from './engine';
import { playableCards } from './cards';
import type { Card, Phase, PlayedCard, RoundHistory, Suit } from './types';
import type { RoomState } from './types';

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  avatar: string | null;
  handCount: number;
  bid: number | null;
  tricks: number;
  points: number;
}

export interface PublicState {
  code: string;
  hostId: string;
  phase: Phase;
  players: PublicPlayer[];
  totalRounds: number;
  round: number;
  cardsThisRound: number;
  dealerIndex: number;
  turnIndex: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  trick: PlayedCard[];
  leadSuit: Suit | null;
  lastTrick: { cards: PlayedCard[]; winnerId: string; seq: number } | null;
  turnDeadline: number | null;
  pausedAt: number | null;
  pauseSeconds: number;
  botReadyAt: number | null;
  /** Cuántas cartas toca en cada ronda, sorteado al empezar. */
  roundCards: number[];
  /** Reloj del servidor al responder: el cliente corrige su propio desfasaje. */
  serverNow: number;
  turnSeconds: number;
  history: RoundHistory[];
  winnerId: string | null;
  log: string[];
  /** Todo lo que sigue es específico del jugador que pide el estado. */
  you: {
    id: string;
    hand: Card[];
    playableIds: string[];
    isYourTurn: boolean;
    forbiddenBid: number | null;
  } | null;
}

/**
 * Convierte el estado completo del servidor en la vista que puede recibir un
 * jugador: sin tokens y sin las manos ajenas. Esto es lo único que sale por la red.
 */
export function redact(state: RoomState, viewerId: string | null): PublicState {
  const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const isPlaying = state.phase === 'playing';

  return {
    code: state.code,
    hostId: state.hostId,
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      avatar: p.avatar,
      handCount: p.hand.length,
      bid: p.bid,
      tricks: p.tricks,
      points: p.points,
    })),
    totalRounds: state.totalRounds,
    round: state.round,
    cardsThisRound: state.cardsThisRound,
    dealerIndex: state.dealerIndex,
    turnIndex: state.turnIndex,
    trumpCard: state.trumpCard,
    trumpSuit: state.trumpSuit,
    trick: state.trick,
    leadSuit: state.leadSuit,
    lastTrick: state.lastTrick,
    turnDeadline: state.turnDeadline,
    pausedAt: state.pausedAt,
    pauseSeconds: PAUSE_SECONDS,
    botReadyAt: state.botReadyAt,
    roundCards: state.roundCards,
    serverNow: Date.now(),
    turnSeconds: TURN_SECONDS,
    history: state.history,
    winnerId: state.winnerId,
    log: state.log.slice(-12),
    you: viewer
      ? {
          id: viewer.id,
          hand: viewer.hand,
          playableIds: isPlaying
            ? playableCards(viewer.hand, state.leadSuit, state.trumpSuit).map((c) => c.id)
            : [],
          isYourTurn: state.players[state.turnIndex]?.id === viewer.id,
          forbiddenBid:
            state.phase === 'bidding' && state.players[state.turnIndex]?.id === viewer.id
              ? forbiddenBid(state)
              : null,
        }
      : null,
  };
}
