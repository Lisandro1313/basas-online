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
import {
  AVATAR_EMOJIS,
  MAX_AVATAR_CHARS,
  MAX_CUSTOM_EMOTES,
  MAX_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_PLAYERS,
  MAX_REACTIONS,
  MIN_PLAYERS,
} from './types';
import { isValidSticker } from './stickers';
import type { Card, Player, RoomState, RoundResult, Suit } from './types';

/** Error de regla: el API lo traduce a un 400 con mensaje para el usuario. */
export class RuleError extends Error {}

const BOT_NAMES = ['Beto', 'Carla', 'Dani', 'Elsa', 'Fito', 'Gaby', 'Hugo'];

/** Segundos que tiene cada jugador para mover antes de que juegue solo. */
export const TURN_SECONDS = 30;

/**
 * Cuánto puede durar una pausa antes de que el juego siga solo. Si el anfitrión
 * se va sin reanudar, la partida no queda congelada para siempre.
 */
export const PAUSE_SECONDS = 180;

/** Lo que "piensa" un bot antes de mover, para que se pueda seguir la mano. */
export const BOT_DELAY_SECONDS = 2;

/**
 * Cuánto se queda una baza ganada sobre la mesa antes de que alguien pueda
 * seguir jugando. Sin esto, la última carta se ve un suspiro: se juega, la baza
 * se resuelve y se recoge todo antes de que llegues a mirar quién ganó.
 */
export const TRICK_REVEAL_SECONDS = 3;

function log(state: RoomState, message: string) {
  state.log.push(message);
  if (state.log.length > 40) state.log = state.log.slice(-40);
}

function playerName(state: RoomState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? '???';
}

/**
 * Busca a un participante entre los sentados y los que esperan la próxima mano.
 * Para chatear, reaccionar o cambiar el avatar da igual si ya estás jugando.
 */
function findParticipant(state: RoomState, id: string): Player | undefined {
  return (
    state.players.find((p) => p.id === id) ?? (state.pending ?? []).find((p) => p.id === id)
  );
}

/** Tope duro: una mano más grande no entra en la pantalla de un celular. */
const HAND_CAP = 10;

/**
 * Máximo de cartas por jugador según cuántos sean. El mazo tiene 52, pero una
 * se da vuelta como triunfo, así que se reparten 51 como mucho.
 *
 * Con 7 jugadores dan 7 cartas cada uno (49 + triunfo); con 8, solo 6, porque
 * 7 × 8 = 56 no entra en el mazo.
 */
export function maxCardsPerRound(playerCount: number): number {
  return Math.max(1, Math.min(HAND_CAP, Math.floor(51 / playerCount)));
}

/**
 * Sortea cuántas cartas toca en cada ronda: valores al azar entre 1 y el máximo
 * que permite la mesa, sin repetir. Si hay más rondas que valores posibles
 * (pasa con muchos jugadores), se vuelve a barajar la bolsa y se sigue,
 * evitando que dos rondas seguidas caigan iguales.
 */
export function buildRoundPlan(rounds: number, playerCount: number): number[] {
  const max = maxCardsPerRound(playerCount);
  const plan: number[] = [];
  let pool: number[] = [];

  while (plan.length < rounds) {
    if (pool.length === 0) {
      pool = shuffle(Array.from({ length: max }, (_, i) => i + 1));
      // Si al rebarajar toca el mismo número que la ronda anterior, lo corremos.
      if (pool.length > 1 && plan.length > 0 && pool[pool.length - 1] === plan[plan.length - 1]) {
        [pool[0], pool[pool.length - 1]] = [pool[pool.length - 1], pool[0]];
      }
    }
    plan.push(pool.pop()!);
  }

  // La última mano es siempre al máximo de cartas (y se juega sin triunfo).
  plan[rounds - 1] = max;
  if (rounds >= 2 && plan[rounds - 2] === max) {
    const prev = rounds >= 3 ? plan[rounds - 3] : -1;
    let alt = max > 1 ? max - 1 : 2;
    if (alt === prev) alt = alt > 1 ? alt - 1 : alt + 1;
    plan[rounds - 2] = Math.max(1, Math.min(max, alt));
  }

  return plan;
}

/** La última ronda se juega sin triunfo: todo se define por el palo de salida. */
export function isLastRound(state: RoomState): boolean {
  return state.round === state.totalRounds;
}

export function createRoom(code: string, hostName: string, hostId: string, token: string): RoomState {
  const state: RoomState = {
    code,
    name: `Mesa de ${hostName.trim().slice(0, 16) || 'alguien'}`,
    isPublic: true,
    hostId,
    phase: 'lobby',
    players: [],
    pending: [],
    totalRounds: 8,
    round: 0,
    cardsThisRound: 0,
    roundCards: [],
    dealerIndex: 0,
    turnIndex: 0,
    trumpCard: null,
    trumpSuit: null,
    trick: [],
    leadSuit: null,
    lastTrick: null,
    trickSeq: 0,
    turnDeadline: null,
    pausedAt: null,
    botReadyAt: null,
    trickPauseUntil: null,
    history: [],
    winnerId: null,
    log: [],
    reactions: [],
    reactionSeq: 0,
    messages: [],
    messageSeq: 0,
    tokens: {},
  };
  addPlayer(state, hostId, hostName, token);
  return state;
}

/**
 * Suma un jugador. En el lobby entra directo a la mesa; con la partida en curso
 * queda en espera y se incorpora al arrancar la mano siguiente (no se puede
 * repartir en una mano ya empezada).
 */
export function addPlayer(state: RoomState, id: string, name: string, token: string) {
  const pending = state.pending ?? (state.pending = []);
  const total = state.players.length + pending.length;
  if (total >= MAX_PLAYERS) throw new RuleError('La sala está llena.');

  const clean = name.trim().slice(0, 16) || 'Jugador';
  const taken = [...state.players, ...pending].some(
    (p) => p.name.toLowerCase() === clean.toLowerCase()
  );
  if (taken) throw new RuleError('Ya hay alguien con ese nombre en la sala.');

  const player: Player = {
    id,
    name: clean,
    isBot: false,
    avatar: null,
    emotes: [],
    hand: [],
    bid: null,
    tricks: 0,
    points: 0,
  };

  state.tokens[id] = token;

  if (state.phase === 'lobby') {
    state.players.push(player);
    log(state, `${clean} entró a la sala.`);
  } else {
    pending.push(player);
    log(state, `${clean} entró: juega desde la próxima mano.`);
  }
}

/**
 * Incorpora a los que estaban esperando. Entran con el puntaje del que menos
 * tiene, para que no arranquen en desventaja, y se rehace el plan de las manos
 * que faltan: con más jugadores entran menos cartas por mano.
 */
function mergePending(state: RoomState, fromRound: number) {
  const pending = state.pending ?? [];
  if (pending.length === 0) return;

  const minPoints = state.players.length
    ? Math.min(...state.players.map((p) => p.points))
    : 0;

  for (const p of pending) {
    p.points = minPoints;
    state.players.push(p);
    log(state, `${p.name} se suma a la mesa con ${minPoints} pts.`);
  }
  state.pending = [];

  // El máximo de cartas por mano depende de cuántos son: rehacemos lo que falta.
  const remaining = state.totalRounds - fromRound + 1;
  if (remaining > 0) {
    const fresh = buildRoundPlan(remaining, state.players.length);
    state.roundCards = [...state.roundCards.slice(0, fromRound - 1), ...fresh];
  }
}

/** El anfitrión le pone nombre a la sala (lo que se ve en la lista). */
export function setRoomName(state: RoomState, name: string) {
  const clean = name.replace(/\p{Cc}/gu, ' ').trim().slice(0, 30);
  if (!clean) throw new RuleError('Poné un nombre para la sala.');
  state.name = clean;
}

/** Pública (aparece en la lista) o privada (solo con el código). */
export function setVisibility(state: RoomState, isPublic: boolean) {
  state.isPublic = isPublic;
}

/** Solo se aceptan videos servidos por Cloudinary, para no cargar URLs random. */
export function isCloudinaryVideo(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.hostname === 'res.cloudinary.com' &&
      /\.(mp4|webm)$/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

/** Igual que el video, pero para imágenes del chat. */
export function isCloudinaryImage(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.hostname === 'res.cloudinary.com' &&
      (/\.(jpe?g|png|gif|webp)$/i.test(u.pathname) || u.pathname.includes('/image/upload/'))
    );
  } catch {
    return false;
  }
}

/** Manda un mensaje al chat: texto libre o una imagen (URL de Cloudinary). */
export function sendChat(
  state: RoomState,
  playerId: string,
  kind: 'text' | 'image',
  content: string
) {
  const player = findParticipant(state, playerId);
  if (!player) throw new RuleError('No estás en esta sala.');

  const now = Date.now();
  // Anti-flood suave: como mucho un mensaje cada 350 ms por jugador.
  const last = [...state.messages].reverse().find((m) => m.playerId === playerId);
  if (last && now - last.at < 350) return;

  state.messageSeq += 1;
  const base = { seq: state.messageSeq, playerId, name: player.name, at: now };

  if (kind === 'text') {
    // Sin caracteres de control; largo acotado.
    const text = content
      .replace(/\p{Cc}/gu, ' ')
      .trim()
      .slice(0, MAX_MESSAGE_CHARS);
    if (!text) throw new RuleError('El mensaje está vacío.');
    state.messages.push({ ...base, kind: 'text', text });
  } else {
    if (!isCloudinaryImage(content)) throw new RuleError('Esa imagen no es válida.');
    state.messages.push({ ...base, kind: 'image', url: content });
  }

  if (state.messages.length > MAX_MESSAGES) {
    state.messages = state.messages.slice(-MAX_MESSAGES);
  }
}

/** Registra un emote de video propio (URL de Cloudinary) en el jugador. */
export function addEmote(state: RoomState, playerId: string, url: string) {
  const player = findParticipant(state, playerId);
  if (!player) throw new RuleError('No estás en esta sala.');
  if (!isCloudinaryVideo(url)) throw new RuleError('Ese video no es válido.');
  if (player.emotes.includes(url)) return;
  player.emotes = [...player.emotes, url].slice(-MAX_CUSTOM_EMOTES);
}

/** Tira un sticker a la mesa. Anti-spam: uno cada 700 ms por jugador. */
export function sendReaction(state: RoomState, playerId: string, sticker: string) {
  const player = findParticipant(state, playerId);
  if (!player) throw new RuleError('No estás en esta sala.');
  // El sticker es o un id del catálogo, o `url:<video de Cloudinary>`.
  if (sticker.startsWith('url:')) {
    if (!isCloudinaryVideo(sticker.slice(4))) throw new RuleError('Ese video no es válido.');
  } else if (!isValidSticker(sticker)) {
    throw new RuleError('Ese sticker no existe.');
  }

  const now = Date.now();
  const ultima = [...state.reactions].reverse().find((r) => r.playerId === playerId);
  if (ultima && now - ultima.at < 700) return; // repetición muy rápida: se ignora

  state.reactionSeq += 1;
  state.reactions.push({ seq: state.reactionSeq, playerId, sticker, at: now });
  if (state.reactions.length > MAX_REACTIONS) {
    state.reactions = state.reactions.slice(-MAX_REACTIONS);
  }
}

/** Cambia el avatar: un emoji de la lista o una foto ya reducida por el cliente. */
export function setAvatar(state: RoomState, playerId: string, avatar: string | null) {
  const player = findParticipant(state, playerId);
  if (!player) throw new RuleError('No estás en esta sala.');

  if (avatar === null) {
    player.avatar = null;
    return;
  }

  if (avatar.startsWith('emoji:')) {
    const emoji = avatar.slice(6);
    if (!AVATAR_EMOJIS.includes(emoji)) throw new RuleError('Ese avatar no existe.');
    player.avatar = avatar;
    return;
  }

  // Preferido: foto hosteada en Cloudinary (una URL corta, no engorda el estado).
  if (isCloudinaryImage(avatar)) {
    player.avatar = avatar;
    return;
  }

  // Respaldo si Cloudinary no está configurado: la foto va como data URL chica.
  if (!avatar.startsWith('data:image/')) throw new RuleError('Formato de imagen inválido.');
  if (avatar.length > MAX_AVATAR_CHARS) throw new RuleError('La foto es muy pesada.');
  player.avatar = avatar;
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
    avatar: `emoji:${AVATAR_EMOJIS[state.players.length % AVATAR_EMOJIS.length]}`,
    emotes: [],
    hand: [],
    bid: null,
    tricks: 0,
    points: 0,
  });
  log(state, `${name} (bot) entró a la sala.`);
}

export function removePlayer(state: RoomState, playerId: string) {
  // Si sólo estás esperando la próxima mano, podés salir cuando quieras.
  const pending = state.pending ?? [];
  if (pending.some((p) => p.id === playerId)) {
    state.pending = pending.filter((p) => p.id !== playerId);
    delete state.tokens[playerId];
    return;
  }

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
  state.roundCards = buildRoundPlan(state.totalRounds, state.players.length);
  state.round = 0;
  state.dealerIndex = state.players.length - 1;
  state.players = state.players.map((p) => ({ ...p, points: 0 }));
  state.history = [];
  log(state, `¡Arranca la partida! ${state.totalRounds} rondas.`);
  startRound(state);
}

export function startRound(state: RoomState) {
  const nextRound = state.round + 1;

  // Los que entraron con la mano en curso se suman recién ahora, y el plan de
  // las manos que faltan se rehace para la nueva cantidad de jugadores.
  mergePending(state, nextRound);

  if (nextRound > state.totalRounds) {
    const best = [...state.players].sort((a, b) => b.points - a.points)[0];
    state.phase = 'gameOver';
    state.winnerId = best.id;
    log(state, `Fin del juego. Ganó ${best.name} con ${best.points} puntos.`);
    return;
  }

  const count = state.players.length;
  const perPlayer = state.roundCards[nextRound - 1] ?? maxCardsPerRound(count);
  const { hands, rest } = deal(shuffle(createDeck()), count, perPlayer);
  // La última mano se juega sin triunfo.
  const lastRound = nextRound === state.totalRounds;
  const trumpCard = lastRound ? null : rest[0] ?? null;

  state.round = nextRound;
  state.cardsThisRound = perPlayer;
  state.dealerIndex = (state.dealerIndex + 1) % count;
  state.turnIndex = (state.dealerIndex + 1) % count;
  state.trumpCard = trumpCard;
  state.trumpSuit = trumpCard?.suit ?? null;
  state.trick = [];
  state.leadSuit = null;
  state.lastTrick = null;
  state.trickPauseUntil = null;
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
  if (state.pausedAt !== null) throw new RuleError('El juego está pausado.');
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
  if (state.pausedAt !== null) throw new RuleError('El juego está pausado.');
  if (state.phase !== 'playing') throw new RuleError('No es momento de jugar cartas.');
  if (state.trickPauseUntil !== null && Date.now() < state.trickPauseUntil) {
    throw new RuleError('Esperá a que se recojan las cartas.');
  }
  const player = state.players[state.turnIndex];
  if (!player || player.id !== playerId) throw new RuleError('No es tu turno.');

  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index === -1) throw new RuleError('No tenés esa carta.');
  const card = player.hand[index];

  if (!isPlayable(card, player.hand, state.leadSuit, state.trumpSuit)) {
    const tieneSalida = player.hand.some((c) => c.suit === state.leadSuit);
    throw new RuleError(
      tieneSalida
        ? 'Tenés que servir el palo de salida.'
        : 'No tenés el palo de salida: estás obligado a tirar triunfo.'
    );
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
  if (roundOver) {
    scoreRound(state);
  } else {
    // Nadie juega hasta que la baza se haya visto.
    state.trickPauseUntil = Date.now() + TRICK_REVEAL_SECONDS * 1000;
  }
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
/**
 * Reinicia los relojes según quién está en turno. Se llama después de cada
 * acción, así los plazos los fija siempre el servidor.
 *
 * A un bot no se le corre el reloj de turno: se le da uno propio de un par de
 * segundos para que la mano se pueda seguir con la vista.
 */
export function refreshTimers(state: RoomState) {
  const activo =
    (state.phase === 'bidding' || state.phase === 'playing') && state.pausedAt === null;

  if (!activo) {
    state.turnDeadline = null;
    state.botReadyAt = null;
    return;
  }

  // Si se está mostrando una baza, los relojes arrancan cuando termine: nadie
  // pierde tiempo de turno mirando las cartas sobre la mesa.
  const desde = Math.max(Date.now(), state.trickPauseUntil ?? 0);

  if (state.players[state.turnIndex]?.isBot) {
    state.turnDeadline = null;
    state.botReadyAt = desde + BOT_DELAY_SECONDS * 1000;
  } else {
    state.turnDeadline = desde + TURN_SECONDS * 1000;
    state.botReadyAt = null;
  }
}

/**
 * Mueve el bot que está en turno, una sola jugada. Lo dispara cualquier cliente
 * cuando ve que se cumplió su tiempo, y el servidor revalida el reloj.
 */
export function applyBotMove(state: RoomState) {
  if (state.pausedAt !== null) throw new RuleError('El juego está pausado.');
  if (state.phase !== 'bidding' && state.phase !== 'playing') {
    throw new RuleError('No hay ningún turno activo.');
  }

  const player = state.players[state.turnIndex];
  if (!player?.isBot) throw new RuleError('No es el turno de un bot.');
  if (state.botReadyAt === null || Date.now() < state.botReadyAt) {
    throw new RuleError('El bot todavía está pensando.');
  }

  if (state.phase === 'bidding') {
    placeBid(state, player.id, botBid(state, player));
  } else {
    playCard(state, player.id, botCard(state, player).id);
  }
}

/* ------------------------------------------------------------------ */
/* Pausa                                                               */
/* ------------------------------------------------------------------ */

export function pauseGame(state: RoomState) {
  if (state.phase !== 'bidding' && state.phase !== 'playing') {
    throw new RuleError('Solo se puede pausar con la mano en juego.');
  }
  if (state.pausedAt !== null) throw new RuleError('El juego ya está pausado.');

  state.pausedAt = Date.now();
  state.turnDeadline = null; // el reloj del turno se congela
  log(state, 'El anfitrión pausó el juego.');
}

/** ¿Ya pasó el tiempo máximo de pausa? Entonces cualquiera puede reanudar. */
export function pauseExpired(state: RoomState): boolean {
  return state.pausedAt !== null && Date.now() - state.pausedAt >= PAUSE_SECONDS * 1000;
}

export function resumeGame(state: RoomState, automatico = false) {
  if (state.pausedAt === null) throw new RuleError('El juego no está pausado.');
  state.pausedAt = null;
  // Al volver arranca un turno completo: nadie pierde tiempo por la pausa.
  log(state, automatico ? 'Se reanudó solo tras la pausa.' : 'El anfitrión reanudó el juego.');
}

/**
 * Juega automáticamente por quien se quedó sin tiempo. Lo dispara cualquier
 * cliente que vea el plazo vencido, pero el servidor vuelve a comprobar el
 * reloj: nadie puede apurarle el turno a otro.
 */
export function applyTimeout(state: RoomState) {
  if (state.pausedAt !== null) throw new RuleError('El juego está pausado.');
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
  state.pausedAt = null;
  state.round = 0;
  state.winnerId = null;
  state.history = [];
  state.trick = [];
  state.lastTrick = null;
  state.trumpCard = null;
  state.trumpSuit = null;
  // Los que esperaban entran ya, que arranca de cero para todos.
  state.players = [...state.players, ...(state.pending ?? [])];
  state.pending = [];
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
  const options = playableCards(player.hand, state.leadSuit, state.trumpSuit);
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
 * Resuelve todos los turnos de bots de corrido, sin esperas.
 *
 * En el juego real no se usa: ahí cada bot mueve con su propio reloj (ver
 * `applyBotMove`), si no las manos pasan demasiado rápido para seguirlas.
 * Queda para simular partidas enteras en los tests.
 */
export function runBots(state: RoomState) {
  if (state.pausedAt !== null) return; // en pausa no juega nadie, ni los bots
  for (let guard = 0; guard < 200; guard++) {
    if (state.phase !== 'bidding' && state.phase !== 'playing') return;
    const player = state.players[state.turnIndex];
    if (!player || !player.isBot) return;

    // Modo instantáneo: no esperamos a que se recoja la baza anterior.
    state.trickPauseUntil = null;

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
