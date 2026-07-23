export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

/** 11=J, 12=Q, 13=K, 14=A */
export type CardValue = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  value: CardValue;
  id: string;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  hand: Card[];
  /** null = todavía no apostó. Ojo: 0 es una apuesta válida. */
  bid: number | null;
  tricks: number;
  points: number;
}

export type Phase = 'lobby' | 'bidding' | 'playing' | 'roundEnd' | 'gameOver';

export interface PlayedCard {
  card: Card;
  playerId: string;
}

export interface RoundResult {
  playerId: string;
  bid: number;
  tricks: number;
  roundPoints: number;
}

export interface RoundHistory {
  round: number;
  cards: number;
  trumpSuit: Suit | null;
  results: RoundResult[];
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  players: Player[];
  totalRounds: number;
  round: number;
  cardsThisRound: number;
  dealerIndex: number;
  turnIndex: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  trick: PlayedCard[];
  leadSuit: Suit | null;
  /**
   * Última baza completa. `seq` sube con cada baza: es lo que le permite al
   * cliente darse cuenta de que hay una nueva para mostrar antes de recogerla.
   */
  lastTrick: { cards: PlayedCard[]; winnerId: string; seq: number } | null;
  /** Bazas resueltas en toda la partida, para numerar `lastTrick`. */
  trickSeq: number;
  /** Momento (epoch ms) en que vence el turno actual. null si no hay turno. */
  turnDeadline: number | null;
  /** Momento (epoch ms) en que el anfitrión pausó. null si el juego corre. */
  pausedAt: number | null;
  history: RoundHistory[];
  winnerId: string | null;
  log: string[];
  /** Secreto por jugador. Nunca sale del servidor: se borra al redactar. */
  tokens: Record<string, string>;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
