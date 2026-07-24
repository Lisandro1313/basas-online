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
  /**
   * Avatar: o `emoji:🦊`, o una foto como data URL ya reducida en el navegador.
   * null = se muestra la inicial del nombre.
   */
  avatar: string | null;
  /** Emotes de video propios (URLs de Cloudinary). Cortos, tope de 4. */
  emotes: string[];
  hand: Card[];
  /** null = todavía no apostó. Ojo: 0 es una apuesta válida. */
  bid: number | null;
  tricks: number;
  points: number;
  /** Partidas ganadas en esta sala (marcador acumulado entre partidas). */
  wins: number;
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
  /** Nombre visible en la lista de salas. */
  name: string;
  /** Si es pública aparece en la lista; si no, solo se entra con el código. */
  isPublic: boolean;
  hostId: string;
  phase: Phase;
  players: Player[];
  /**
   * Los que entraron con la partida en curso. No se puede repartir en una mano
   * ya empezada, así que esperan acá y se suman al arrancar la mano siguiente.
   */
  pending: Player[];
  /** Ids marcados para expulsar; se van al arrancar la mano siguiente. */
  kicking: string[];
  totalRounds: number;
  round: number;
  cardsThisRound: number;
  /** Cuántas cartas toca en cada ronda. Se sortea al empezar la partida. */
  roundCards: number[];
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
  /** Cuándo puede mover el bot que está en turno. null si no juega un bot. */
  botReadyAt: number | null;
  /**
   * Hasta cuándo la baza recién ganada se queda en la mesa. Nadie puede jugar
   * antes de eso, así todos llegan a ver la última carta y quién se la llevó.
   */
  trickPauseUntil: number | null;
  history: RoundHistory[];
  winnerId: string | null;
  log: string[];
  /** Stickers recientes tirados en la mesa. Efímeros: el cliente los deja de
   *  mostrar solos por tiempo. Se guardan pocos para no engordar el estado. */
  reactions: Reaction[];
  reactionSeq: number;
  /** Chat de la sala. Persiste durante la partida, acotado a los últimos N. */
  messages: ChatMessage[];
  messageSeq: number;
  /** Quién está escribiendo: id → hasta cuándo (epoch ms). Efímero. */
  typing: Record<string, number>;
  /** Secreto por jugador. Nunca sale del servidor: se borra al redactar. */
  tokens: Record<string, string>;
}

export interface Reaction {
  seq: number;
  playerId: string;
  sticker: string;
  at: number;
}

/** Cuántos stickers recientes se conservan. */
export const MAX_REACTIONS = 12;

export interface ChatMessage {
  seq: number;
  playerId: string;
  name: string;
  kind: 'text' | 'image';
  /** Presente en `text`. */
  text?: string;
  /** Presente en `image`: URL de Cloudinary. */
  url?: string;
  at: number;
}

/** Cuántos mensajes de chat se conservan (los más viejos se descartan). */
export const MAX_MESSAGES = 60;
export const MAX_MESSAGE_CHARS = 400;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/**
 * Tope del data URL de la foto. El estado entero de la sala se guarda en un
 * documento de Firestore, que no puede pasar de 1 MB: con 8 jugadores hay que
 * dejar margen. El navegador reduce la foto bastante por debajo de esto.
 */
export const MAX_AVATAR_CHARS = 40_000;

export const AVATAR_EMOJIS = ['🦊', '🐺', '🦉', '🐸', '🐼', '🦁', '🐯', '🐵', '🦈', '🐙', '🦖', '🐝'];

/** Cuántos emotes de video propios puede guardar cada jugador. */
export const MAX_CUSTOM_EMOTES = 4;
