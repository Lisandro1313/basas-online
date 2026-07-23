import type { Card, CardValue, PlayedCard, Suit } from './types';

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const VALUES: CardValue[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const SUIT_NAME: Record<Suit, string> = {
  hearts: 'Corazones',
  diamonds: 'Diamantes',
  clubs: 'Tréboles',
  spades: 'Picas',
};

export function valueLabel(value: CardValue): string {
  if (value === 11) return 'J';
  if (value === 12) return 'Q';
  if (value === 13) return 'K';
  if (value === 14) return 'A';
  return String(value);
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value, id: `${suit}-${value}` });
    }
  }
  return deck;
}

export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Reparte `perPlayer` cartas a cada jugador y devuelve lo que sobra del mazo. */
export function deal(
  deck: Card[],
  playerCount: number,
  perPlayer: number
): { hands: Card[][]; rest: Card[] } {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let i = 0;
  for (let c = 0; c < perPlayer; c++) {
    for (let p = 0; p < playerCount; p++) {
      hands[p].push(deck[i++]);
    }
  }
  return { hands, rest: deck.slice(i) };
}

export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return b.value - a.value;
  });
}

/**
 * Solo hay una obligación: seguir el palo de salida si tenés cartas de ese palo.
 * No hay obligación de matar con triunfo.
 */
export function isPlayable(
  card: Card,
  hand: Card[],
  leadSuit: Suit | null
): boolean {
  if (!leadSuit) return true;
  const hasLead = hand.some((c) => c.suit === leadSuit);
  if (!hasLead) return true;
  return card.suit === leadSuit;
}

export function playableCards(
  hand: Card[],
  leadSuit: Suit | null
): Card[] {
  return hand.filter((c) => isPlayable(c, hand, leadSuit));
}

/** Gana el triunfo más alto; si no se jugó triunfo, la más alta del palo de salida. */
export function trickWinner(
  trick: PlayedCard[],
  leadSuit: Suit | null,
  trumpSuit: Suit | null
): string {
  const trumps = trumpSuit ? trick.filter((p) => p.card.suit === trumpSuit) : [];
  const pool = trumps.length > 0 ? trumps : trick.filter((p) => p.card.suit === leadSuit);
  const contenders = pool.length > 0 ? pool : trick;
  return contenders.reduce((best, cur) =>
    cur.card.value > best.card.value ? cur : best
  ).playerId;
}
