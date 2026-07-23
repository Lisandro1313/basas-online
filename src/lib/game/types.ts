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
  /** Última baza completa, para poder mostrarla un instante antes de limpiar. */
  lastTrick: { cards: PlayedCard[]; winnerId: string } | null;
  history: RoundHistory[];
  winnerId: string | null;
  log: string[];
  /** Secreto por jugador. Nunca sale del servidor: se borra al redactar. */
  tokens: Record<string, string>;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
