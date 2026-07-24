import { PAUSE_SECONDS, TURN_SECONDS, forbiddenBid } from './engine';
import { playableCards } from './cards';
import type { Card, ChatMessage, Phase, PlayedCard, RoundHistory, Suit } from './types';
import type { RoomState } from './types';

export interface PublicPlayer {
  id: string;
  name: string;
  isBot: boolean;
  avatar: string | null;
  emotes: string[];
  handCount: number;
  bid: number | null;
  tricks: number;
  points: number;
  wins: number;
  /** Marcado para expulsarse en la próxima mano. */
  kicking: boolean;
}

export interface PublicState {
  code: string;
  name: string;
  isPublic: boolean;
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
  trickPauseUntil: number | null;
  /** Cuántas cartas toca en cada ronda, sorteado al empezar. */
  roundCards: number[];
  /** Reloj del servidor al responder: el cliente corrige su propio desfasaje. */
  serverNow: number;
  turnSeconds: number;
  history: RoundHistory[];
  winnerId: string | null;
  log: string[];
  reactions: { seq: number; playerId: string; sticker: string; at: number }[];
  messages: ChatMessage[];
  /** Nombres de quienes están escribiendo ahora (sin incluirte a vos). */
  typing: string[];
  /** Entraron con la partida en curso; juegan desde la mano siguiente. */
  pending: { id: string; name: string; avatar: string | null }[];
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
/** Nombre de un participante (sentado o esperando) por id. */
function nameFor(state: RoomState, id: string): string | undefined {
  return (
    state.players.find((p) => p.id === id)?.name ??
    (state.pending ?? []).find((p) => p.id === id)?.name
  );
}

export function redact(state: RoomState, viewerId: string | null): PublicState {
  const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const isPlaying = state.phase === 'playing';
  const now = Date.now();

  return {
    code: state.code,
    name: state.name ?? `Sala ${state.code}`,
    isPublic: state.isPublic ?? true,
    hostId: state.hostId,
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      avatar: p.avatar,
      emotes: p.emotes ?? [],
      handCount: p.hand.length,
      bid: p.bid,
      tricks: p.tricks,
      points: p.points,
      wins: p.wins ?? 0,
      kicking: (state.kicking ?? []).includes(p.id),
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
    trickPauseUntil: state.trickPauseUntil,
    roundCards: state.roundCards,
    serverNow: Date.now(),
    turnSeconds: TURN_SECONDS,
    history: state.history,
    winnerId: state.winnerId,
    log: state.log.slice(-12),
    // Solo las de los últimos segundos: las viejas no le sirven a nadie.
    reactions: state.reactions.filter((r) => now - r.at < 6000),
    messages: state.messages ?? [],
    typing: Object.entries(state.typing ?? {})
      .filter(([id, until]) => id !== viewerId && until > now)
      .map(([id]) => nameFor(state, id))
      .filter((n): n is string => Boolean(n)),
    pending: (state.pending ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
    })),
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
