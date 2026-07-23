import {
  createDeck,
  deal,
  isPlayable,
  playableCards,
  shuffle,
  sortHand,
  trickWinner,
  SUIT_NAME,
  valueLabel,
} from './cards';
import { MAX_PLAYERS, MIN_PLAYERS } from './types';
import type { Card, Player, RoomState, RoundResult, Suit } from './types';

/** Error de regla: el API lo traduce a un 400 con mensaje para el usuario. */
export class RuleError extends Error {}

const BOT_NAMES = ['Beto', 'Carla', 'Dani', 'Elsa', 'Fito'];

/** Segundos que tiene cada jugador para mover antes de que juegue solo. */
export const TURN_SECONDS = 15;

function log(state: RoomState, message: string) {
  state.log.push(message);
  if (state.log.length > 40) state.log = state.log.slice(-40);
}

function playerName(state: RoomState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? '???';
}

/**
 * Cartas por ronda: arranca en 5 y sube de a una hasta 10, pero nunca más de
 * las que permite el mazo (dejando una para el triunfo cuando se puede).
 */
export function cardsForRound(round: number, playerCount: number): number {
  const byDeck = Math.floor(52 / playerCount);
  return Math.max(1, Math.min(10, 5 + round - 1, byDeck));
}

export function createRoom(code: string, hostName: string, hostId: string, token: string): RoomState {
  const state: RoomState = {
    code,
    hostId,
    phase: 'lobby',
    players: [],
    totalRounds: 8,
    round: 0,
    cardsThisRound: 0,
    dealerIndex: 0,
    turnIndex: 0,
    trumpCard: null,
    trumpSuit: null,
    trick: [],
    leadSuit: null,
    lastTrick: null,
    trickSeq: 0,
    turnDeadline: null,
    history: [],
    winnerId: null,
    log: [],
    tokens: {},
  };
  addPlayer(state, hostId, hostName, token);
  return state;
}

export function addPlayer(state: RoomState, id: string, name: string, token: string) {
  if (state.phase !== 'lobby') throw new RuleError('La partida ya arrancó.');
  if (state.players.length >= MAX_PLAYERS) throw new RuleError('La sala está llena.');
  const clean = name.trim().slice(0, 16) || 'Jugador';
  if (state.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw new RuleError('Ya hay alguien con ese nombre en la sala.');
  }
  state.players.push({ id, name: clean, isBot: false, hand: [], bid: null, tricks: 0, points: 0 });
  state.tokens[id] = token;
  log(state, `${clean} entró a la sala.`);
}

export function addBot(state: RoomState) {
  if (state.phase !== 'lobby') throw new RuleError('La partida ya arrancó.');
  if (state.players.length >= MAX_PLAYERS) throw new RuleError('La sala está llena.');
  const used = new Set(state.players.map((p) => p.name));
  const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${state.players.length}`;
  state.players.push({
    id: `bot-${Math.random().toString(36).slice(2, 8)}`,
    name,
    isBot: true,
    hand: [],
    bid: null,
    tricks: 0,
    points: 0,
  });
  log(state, `${name} (bot) entró a la sala.`);
}

export function removePlayer(state: RoomState, playerId: string) {
  if (state.phase !== 'lobby') throw new RuleError('No se puede salir con la partida en curso.');
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  state.players = state.players.filter((p) => p.id !== playerId);
  delete state.tokens[playerId];
  log(state, `${player.name} salió de la sala.`);
  if (state.hostId === playerId) {
    const nextHost = state.players.find((p) => !p.isBot);
    if (nextHost) state.hostId = nextHost.id;
  }
}

export function startGame(state: RoomState, totalRounds: number) {
  if (state.phase !== 'lobby') throw new RuleError('La partida ya arrancó.');
  if (state.players.length < MIN_PLAYERS) {
    throw new RuleError(`Hacen falta al menos ${MIN_PLAYERS} jugadores.`);
  }
  state.totalRounds = Math.max(1, Math.min(20, Math.floor(totalRounds)));
  state.round = 0;
  state.dealerIndex = state.players.length - 1;
  state.players = state.players.map((p) => ({ ...p, points: 0 }));
  state.history = [];
  log(state, `¡Arranca la partida! ${state.totalRounds} rondas.`);
  startRound(state);
}

export function startRound(state: RoomState) {
  const nextRound = state.round + 1;

  if (nextRound > state.totalRounds) {
    const best = [...state.players].sort((a, b) => b.points - a.points)[0];
    state.phase = 'gameOver';
    state.winnerId = best.id;
    log(state, `Fin del juego. Ganó ${best.name} con ${best.points} puntos.`);
    return;
  }

  const count = state.players.length;
  const perPlayer = cardsForRound(nextRound, count);
  const { hands, rest } = deal(shuffle(createDeck()), count, perPlayer);
  const trumpCard = rest[0] ?? null;

  state.round = nextRound;
  state.cardsThisRound = perPlayer;
  state.dealerIndex = (state.dealerIndex + 1) % count;
  state.turnIndex = (state.dealerIndex + 1) % count;
  state.trumpCard = trumpCard;
  state.trumpSuit = trumpCard?.suit ?? null;
  state.trick = [];
  state.leadSuit = null;
  state.lastTrick = null;
  state.phase = 'bidding';
  state.players = state.players.map((p, i) => ({
    ...p,
    hand: sortHand(hands[i]),
    bid: null,
    tricks: 0,
  }));

  log(
    state,
    `Ronda ${nextRound}: ${perPlayer} carta(s). Triunfo: ${
      state.trumpSuit ? SUIT_NAME[state.trumpSuit] : 'sin triunfo'
    }.`
  );
}

/** Cuántos jugadores ya apostaron. El repartidor apuesta último. */
function bidsPlaced(state: RoomState): number {
  return state.players.filter((p) => p.bid !== null).length;
}

/**
 * El último en apostar (el repartidor) no puede hacer que la suma de apuestas
 * dé exactamente la cantidad de bazas: siempre alguien tiene que fallar.
 */
export function forbiddenBid(state: RoomState): number | null {
  if (bidsPlaced(state) !== state.players.length - 1) return null;
  const sum = state.players.reduce((acc, p) => acc + (p.bid ?? 0), 0);
  const forbidden = state.cardsThisRound - sum;
  return forbidden >= 0 && forbidden <= state.cardsThisRound ? forbidden : null;
}

export function placeBid(state: RoomState, playerId: string, bid: number) {
  if (state.phase !== 'bidding') throw new RuleError('No es momento de apostar.');
  const player = state.players[state.turnIndex];
  if (!player || player.id !== playerId) throw new RuleError('No es tu turno.');
  if (player.bid !== null) throw new RuleError('Ya apostaste esta ronda.');
  if (!Number.isInteger(bid) || bid < 0 || bid > state.cardsThisRound) {
    throw new RuleError(`La apuesta tiene que estar entre 0 y ${state.cardsThisRound}.`);
  }
  if (forbiddenBid(state) === bid) {
    throw new RuleError(`No podés apostar ${bid}: la suma no puede dar ${state.cardsThisRound}.`);
  }

  player.bid = bid;
  log(state, `${player.name} pidió ${bid}.`);

  if (bidsPlaced(state) === state.players.length) {
    state.phase = 'playing';
    state.turnIndex = (state.dealerIndex + 1) % state.players.length;
    state.trick = [];
    state.leadSuit = null;
  } else {
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
  }
}

export function playCard(state: RoomState, playerId: string, cardId: string) {
  if (state.phase !== 'playing') throw new RuleError('No es momento de jugar cartas.');
  const player = state.players[state.turnIndex];
  if (!player || player.id !== playerId) throw new RuleError('No es tu turno.');

  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index === -1) throw new RuleError('No tenés esa carta.');
  const card = player.hand[index];

  if (!isPlayable(card, player.hand, state.leadSuit)) {
    throw new RuleError('Tenés que servir el palo de salida.');
  }

  player.hand.splice(index, 1);
  state.trick.push({ card, playerId });
  if (state.trick.length === 1) state.leadSuit = card.suit;
  log(state, `${player.name} jugó ${valueLabel(card.value)} de ${SUIT_NAME[card.suit]}.`);

  if (state.trick.length === state.players.length) {
    resolveTrick(state);
  } else {
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
  }
}

function resolveTrick(state: RoomState) {
  const winnerId = trickWinner(state.trick, state.leadSuit, state.trumpSuit);
  const winner = state.players.find((p) => p.id === winnerId)!;
  winner.tricks += 1;

  state.trickSeq += 1;
  state.lastTrick = { cards: [...state.trick], winnerId, seq: state.trickSeq };
  log(state, `${winner.name} se llevó la baza.`);

  state.trick = [];
  state.leadSuit = null;
  state.turnIndex = state.players.findIndex((p) => p.id === winnerId);

  const roundOver = state.players.every((p) => p.hand.length === 0);
  if (roundOver) scoreRound(state);
}

/** Si clavás la apuesta: 10 + 3 por baza. Si no: solo las bazas ganadas. */
function scoreRound(state: RoomState) {
  const results: RoundResult[] = state.players.map((p) => {
    const bid = p.bid ?? 0;
    const roundPoints = p.tricks === bid ? 10 + p.tricks * 3 : p.tricks;
    return { playerId: p.id, bid, tricks: p.tricks, roundPoints };
  });

  for (const r of results) {
    const player = state.players.find((p) => p.id === r.playerId)!;
    player.points += r.roundPoints;
  }

  state.history.push({
    round: state.round,
    cards: state.cardsThisRound,
    trumpSuit: state.trumpSuit,
    results,
  });
  state.phase = 'roundEnd';
  log(state, `Fin de la ronda ${state.round}.`);
}

export function nextRound(state: RoomState) {
  if (state.phase !== 'roundEnd') throw new RuleError('La ronda todavía no terminó.');
  startRound(state);
}

/* ------------------------------------------------------------------ */
/* Reloj de turno                                                      */
/* ------------------------------------------------------------------ */

/**
 * Reinicia el reloj del turno. Se llama después de cada acción, así el plazo
 * lo fija siempre el servidor y todos los clientes ven la misma cuenta atrás.
 */
export function refreshDeadline(state: RoomState) {
  const activo = state.phase === 'bidding' || state.phase === 'playing';
  state.turnDeadline = activo ? Date.now() + TURN_SECONDS * 1000 : null;
}

/**
 * Juega automáticamente por quien se quedó sin tiempo. Lo dispara cualquier
 * cliente que vea el plazo vencido, pero el servidor vuelve a comprobar el
 * reloj: nadie puede apurarle el turno a otro.
 */
export function applyTimeout(state: RoomState) {
  if (state.phase !== 'bidding' && state.phase !== 'playing') {
    throw new RuleError('No hay ningún turno activo.');
  }
  if (state.turnDeadline === null || Date.now() < state.turnDeadline) {
    throw new RuleError('Todavía queda tiempo.');
  }

  const player = state.players[state.turnIndex];
  if (!player) throw new RuleError('No hay nadie en turno.');

  log(state, `${player.name} se quedó sin tiempo.`);
  if (state.phase === 'bidding') {
    placeBid(state, player.id, botBid(state, player));
  } else {
    playCard(state, player.id, botCard(state, player).id);
  }
}

export function playAgain(state: RoomState) {
  if (state.phase !== 'gameOver') throw new RuleError('La partida sigue en curso.');
  state.phase = 'lobby';
  state.turnDeadline = null;
  state.round = 0;
  state.winnerId = null;
  state.history = [];
  state.trick = [];
  state.lastTrick = null;
  state.trumpCard = null;
  state.trumpSuit = null;
  state.players = state.players.map((p) => ({
    ...p,
    hand: [],
    bid: null,
    tricks: 0,
    points: 0,
  }));
  log(state, 'Vuelta al lobby para otra partida.');
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

function botBid(state: RoomState, player: Player): number {
  let strength = 0;
  for (const card of player.hand) {
    if (card.value >= 12) strength += 1;
    else if (card.value >= 10) strength += 0.5;
    if (card.suit === state.trumpSuit) strength += 0.5;
  }

  let bid = Math.max(0, Math.min(Math.round(strength), state.cardsThisRound));
  const forbidden = forbiddenBid(state);
  if (forbidden === bid) {
    bid = bid > 0 ? bid - 1 : bid + 1;
    bid = Math.max(0, Math.min(bid, state.cardsThisRound));
  }
  return bid;
}

function botCard(state: RoomState, player: Player): Card {
  const options = playableCards(player.hand, state.leadSuit);
  const needsMore = player.tricks < (player.bid ?? 0);
  const byValue = [...options].sort((a, b) => a.value - b.value);

  // Abre la baza: si necesita bazas tira lo más alto, si no lo más bajo.
  if (state.trick.length === 0) {
    return needsMore ? byValue[byValue.length - 1] : byValue[0];
  }

  const currentWinner = trickWinner(state.trick, state.leadSuit, state.trumpSuit);
  const winning = byValue.filter((card) => {
    const hypothetical = [...state.trick, { card, playerId: player.id }];
    return trickWinner(hypothetical, state.leadSuit, state.trumpSuit) === player.id;
  });

  if (needsMore && winning.length > 0) return winning[0];
  if (!needsMore) {
    const losing = byValue.filter((c) => !winning.includes(c));
    if (losing.length > 0) return losing[0];
  }
  void currentWinner;
  return byValue[0];
}

/**
 * Aplica los turnos de los bots hasta que le toque a un humano.
 * Corre en el servidor después de cada acción, así el estado que se publica
 * ya está al día.
 */
export function runBots(state: RoomState) {
  for (let guard = 0; guard < 200; guard++) {
    if (state.phase !== 'bidding' && state.phase !== 'playing') return;
    const player = state.players[state.turnIndex];
    if (!player || !player.isBot) return;

    if (state.phase === 'bidding') {
      placeBid(state, player.id, botBid(state, player));
    } else {
      playCard(state, player.id, botCard(state, player).id);
    }
  }
}

export function isBotOnly(state: RoomState): boolean {
  return state.players.every((p) => p.isBot);
}

export { SUIT_NAME };
export type { Suit };
