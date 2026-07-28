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
import { genLine, type Tone } from './chatter';
import type { BotStats, Card, Player, RoomState, RoundResult, Suit } from './types';

/** Error de regla: el API lo traduce a un 400 con mensaje para el usuario. */
export class RuleError extends Error {}

// Orden alternado hombre/mujer, así una mesa chica queda pareja de géneros.
// (m) Beto, Fito, Hugo · (f) Carla, Elsa, Gaby, Dani, Ana
const BOT_NAMES = ['Beto', 'Carla', 'Fito', 'Elsa', 'Hugo', 'Gaby', 'Dani', 'Ana'];

type Evento =
  | 'saludo'
  | 'bidAlto'
  | 'bidCero'
  | 'ganaBaza'
  | 'pierdeBaza'
  | 'ganaJuego'
  | 'pierdeJuego'
  | 'relleno';

interface Persona {
  voice: 'm' | 'f';
  lines: Record<Evento, string[]>;
}

/**
 * Cada bot tiene su personalidad y sus frases propias (banter de mesa de cartas).
 * El cliente las lee en voz alta con TTS según su voz (hombre/mujer).
 */
const PERSONAS: Record<string, Persona> = {
  // Resongón
  Beto: {
    voice: 'm',
    lines: {
      saludo: ['Otra vez a jugar… bueno 😒', 'Dale, repartí de una vez 😤'],
      bidAlto: ['Voy, pero no me gusta 😤', 'Pido alto y que sea rápido'],
      bidCero: ['Cero, estas cartas son un desastre 😒', 'Nada, como siempre me toca lo peor'],
      ganaBaza: ['Era hora 😤', 'Por fin una'],
      pierdeBaza: ['Obvio, siempre yo 😩', 'Qué manera de robar…'],
      ganaJuego: ['Gané y ni contento estoy 😒', 'Ya era hora, che'],
      pierdeJuego: ['Sabía que iba a perder 😤', 'Esto está arreglado 😩'],
      relleno: ['¿Van a tardar mucho? 😒', 'Qué juego lento…'],
    },
  },
  // Amorosa
  Carla: {
    voice: 'f',
    lines: {
      saludo: ['¡Holis a todos! ❤️', 'Qué lindo jugar con ustedes 🥰'],
      bidAlto: ['Voy con fe y con amor 💕', 'Pido alto, corazones 💖'],
      bidCero: ['Cero, pero igual los quiero 🥰', '¡Suerte a todos! 💗'],
      ganaBaza: ['¡Ay, gané! 🥰', 'Gracias, mis amores 💞'],
      pierdeBaza: ['No importa, jugaron divino 💕', 'Bien ahí 🥰'],
      ganaJuego: ['¡Gané, amores! 🏆❤️', 'Los quiero igual 💖'],
      pierdeJuego: ['Perdí pero me divertí 🥰', 'La próxima con más amor 💕'],
      relleno: ['Qué linda mesa hoy 🥰', 'Me encanta jugar con ustedes 💖'],
    },
  },
  // Canchera
  Dani: {
    voice: 'f',
    lines: {
      saludo: ['Llegó la que sabe 😎', 'Preparen la derrota 😏'],
      bidAlto: ['Obvio que voy alto 😎', 'Miren y aprendan'],
      bidCero: ['Cero, me reservo pa\' después 😏'],
      ganaBaza: ['Fácil 😎', 'Ni la vieron'],
      pierdeBaza: ['Te la dejé, tranqui 😏', 'Calentando nomás'],
      ganaJuego: ['¿Alguien dudaba? 😎🏆', 'Clase magistral'],
      pierdeJuego: ['Me distraje, va de nuevo 😏'],
      relleno: ['Esto es muy fácil 😎', 'Gano igual, jueguen tranquilos'],
    },
  },
  // Dramática
  Elsa: {
    voice: 'f',
    lines: {
      saludo: ['¡No puedo con los nervios! 😱'],
      bidAlto: ['¡Me juego la vida! 😱', 'Todo o nada 😰'],
      bidCero: ['Cero, no soporto la presión 😰'],
      ganaBaza: ['¡No lo puedo creer! 😱', '¡Ayyy gané! 🙌'],
      pierdeBaza: ['¡Nooo! 😭', '¡Qué tragedia! 😱'],
      ganaJuego: ['¡ES UN MILAGRO! 😱🏆'],
      pierdeJuego: ['¡Estoy destruida! 😭'],
      relleno: ['¡Qué tensión! 😰', 'No miro, no miro 🙈'],
    },
  },
  // Tranqui
  Fito: {
    voice: 'm',
    lines: {
      saludo: ['Tranca, buenas 😌'],
      bidAlto: ['Voy piola, alto 😌'],
      bidCero: ['Cero, sin drama 😌'],
      ganaBaza: ['Ahí está 😌', 'Todo fluye'],
      pierdeBaza: ['Nah, tranqui 😌', 'Se da, se da'],
      ganaJuego: ['Gané, qué grande 😎'],
      pierdeJuego: ['Perdí, no pasa nada 😌'],
      relleno: ['Qué paz esta mesa 😌', 'Todo bien por acá'],
    },
  },
  // Risueña
  Gaby: {
    voice: 'f',
    lines: {
      saludo: ['¡Buenas jaja! 😂'],
      bidAlto: ['Voy alto, jaja qué locura 😆'],
      bidCero: ['Cero, me mató la mano 🤣'],
      ganaBaza: ['¡Jaja mía! 😂', 'Ni yo lo esperaba 🤣'],
      pierdeBaza: ['Jaja me la afanaron 😆'],
      ganaJuego: ['¡Gané jajaja! 😂🏆'],
      pierdeJuego: ['Perdí y me río igual 🤣'],
      relleno: ['Jaja qué desastre esta mano 😆', 'Me divierto igual jaja'],
    },
  },
  // Pesimista
  Hugo: {
    voice: 'm',
    lines: {
      saludo: ['Uf, otra derrota en camino 😮‍💨'],
      bidAlto: ['Voy alto pero ya sé que pierdo 😮‍💨'],
      bidCero: ['Cero, total no gano nunca'],
      ganaBaza: ['¿Gané? Raro 😮‍💨'],
      pierdeBaza: ['Obvio que la perdí 😞'],
      ganaJuego: ['¿Gané? No me lo creo 😮‍💨'],
      pierdeJuego: ['Lo sabía… 😞'],
      relleno: ['Esto va a salir mal 😮‍💨', 'No tengo fe'],
    },
  },
  // Coqueta (piropos picantes, con gracia)
  Ana: {
    voice: 'f',
    lines: {
      saludo: ['Hola, guapos… ¿jugamos? 😏', 'Llegó la que te va a distraer 😘'],
      bidAlto: ['Voy con todo, como me gusta 😏', 'Alto, igual que mis expectativas con vos 😘'],
      bidCero: ['Cero… por ahora 😉'],
      ganaBaza: [
        'Con esa suerte, esta noche me voy con vos 😏',
        'Uy, me encanta cómo jugás 😘',
        'Gano yo… ¿lo festejamos después? 😉',
      ],
      pierdeBaza: ['Dejámela ganar y after te invito algo 😏', 'Me ganaste… me gusta un desafío 😘'],
      ganaJuego: ['Gané yo, lindo. Vos ganás mi atención 😏🏆'],
      pierdeJuego: ['Perdí, pero me llevo tu mirada 😘'],
      relleno: ['¿Venís seguido a esta mesa? 😏', 'Me estás distrayendo, guapo 😉'],
    },
  },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const FALLBACK_PERSONA: Persona = PERSONAS.Fito;

/** Stickers que un bot puede tirar según el momento. */
const BOT_STICKERS: Partial<Record<Evento, string[]>> = {
  ganaBaza: ['aplauso', 'risa-trebol', 'e-fuego'],
  pierdeBaza: ['enojo', 'e-calavera'],
  ganaJuego: ['aplauso', 'e-corona'],
  pierdeJuego: ['enojo', 'e-pensando'],
  saludo: ['saludo'],
};

/**
 * Un bot "habla": con cierta probabilidad manda una frase de SU personalidad al
 * chat y/o tira un sticker, sin spamear (enfriamiento por bot).
 */
function botChatter(state: RoomState, botId: string, evento: Evento, prob = 0.5) {
  const bot = state.players.find((p) => p.id === botId);
  if (!bot || !bot.isBot) return;
  if (Math.random() > prob) return;

  const now = Date.now();
  const ultima = [...state.messages].reverse().find((m) => m.playerId === botId);
  if (ultima && now - ultima.at < 2500) return; // enfriamiento: no repite muy seguido

  const persona = PERSONAS[bot.name] ?? FALLBACK_PERSONA;
  const opciones = persona.lines[evento] ?? [];
  if (opciones.length === 0) return;

  state.messageSeq += 1;
  state.messages.push({
    seq: state.messageSeq,
    playerId: botId,
    name: bot.name,
    kind: 'text',
    text: pick(opciones),
    at: now,
  });
  if (state.messages.length > MAX_MESSAGES) state.messages = state.messages.slice(-MAX_MESSAGES);

  // A veces además tira un sticker.
  const stickers = BOT_STICKERS[evento];
  if (stickers && Math.random() < 0.5) {
    state.reactionSeq += 1;
    state.reactions.push({ seq: state.reactionSeq, playerId: botId, sticker: pick(stickers), at: now });
    if (state.reactions.length > MAX_REACTIONS) state.reactions = state.reactions.slice(-MAX_REACTIONS);
  }
}

/** El bot apuesta y, a veces, comenta según lo que pidió. */
function botDoBid(state: RoomState, player: Player) {
  const bid = botBid(state, player);
  placeBid(state, player.id, bid);
  if (bid === 0) botChatter(state, player.id, 'bidCero', 0.35);
  else if (bid >= Math.ceil(state.cardsThisRound / 2)) botChatter(state, player.id, 'bidAlto', 0.35);
}

/** El bot juega su carta y, a veces, larga un comentario, ambiente o abre charla. */
function botDoPlay(state: RoomState, player: Player) {
  playCard(state, player.id, botCard(state, player).id);
  botChatter(state, player.id, 'relleno', 0.12);
  botAmbiente(state, player.id);
  // De tanto en tanto arranca una charla de ida y vuelta con otro bot.
  if (Math.random() < 0.1) startConversation(state);
}

/**
 * Cruce entre bots: uno le contesta a otro para que la charla tenga vida y
 * picardía. Elige otro bot al azar y le tira una réplica corta.
 */
const BOT_REPLIES = [
  'jaja',
  'dale, dale 😏',
  'ni ahí 😂',
  'callate que venís perdiendo 😆',
  'uh, mirá quién habla',
  'tenés razón eh',
  'mmm sospechoso 🤨',
  'seee, seguí participando',
  'me hacés reír 😂',
  'ay, no empieces 🙄',
  'tranqui campeón 😎',
  'esa no te la creo 😏',
  '¿cómo te pusiste esos jeans? 👖😏',
];

// Cuando alguien no tiene el palo y tiene que "saltar" (tirar otra cosa).
const SALTO_GENERAL = [
  'apaaa, saltó {n} 🐔',
  'picó {n}, no tenía nada',
  'tuvo que saltar {n}',
  'saltó el pollo 🐔',
  '¿cuántos perros te quedan, {n}? 🐶',
  'se quedó sin palo {n} 😅',
  'uh, {n} no tenía y saltó',
];
const SALTO_TRIUNFO = [
  '¡{n} mató con triunfo! 🔥',
  'ojo que {n} saltó con muestra 😱',
  '{n} sacó el triunfo, picante',
];
const SALTO_DESCARTE = [
  '{n} descartando lo peor 😂',
  '{n} aprovechó para limpiar la mano',
  '{n} se saca los perros de encima 🐶',
];

// Charla de ambiente (comentarios sueltos, para dar clima de mesa).
const AMBIENTE = [
  'unas ganas de un cigarrillo 🚬',
  'qué hambre tengo, che 😋',
  'unas ganas de salir a la noche...',
  'me tomaría unos mates 🧉',
  'después de esta, birra 🍺',
  'qué sueño tengo 😴',
  'ganas de pizza 🍕',
  'qué calor hoy eh',
  'me estoy quedando dormido acá',
  'unas ganas de parrandear 🎉',
  'necesito un café ya ☕',
  'tengo la garganta seca',
];

// Cargadas cuando alguien se pasa de basas (hizo más de las que pidió).
const PASADA = [
  'ahhh {n} se pasó, jajaja 🤣',
  'te pasaste {n}, no cumpliste 😝',
  'uh {n}, ¿para qué agarraste tantas? 😂',
  'miralo a {n}, se pasó de basas 🙈',
  '¡se pasó {n}! le ganó la ansiedad 😂',
  'demasiadas {n}, no sabés parar 😆',
  '{n} no supo cuándo frenar, jaja',
  'te comiste una de más, {n} 😏',
];

// Dichos y refranes argentinos (folclóricos) para darle color a la mesa.
const DICHOS = [
  'al pan, pan, y al vino... Toro 🍷',
  'el que no llora, no mama',
  'camarón que se duerme, se lo lleva la corriente 🦐',
  'más vale pájaro en mano que cien volando 🐦',
  'el que ríe último, ríe mejor 😏',
  'perro que ladra no muerde 🐶',
  'el que quiere celeste, que le cueste',
  'éramos pocos y parió la abuela 👵',
  'acá se pudrió todo 😂',
  'esto está más picante que chori con criolla 🌶️',
  'el horno no está para bollos',
  'zapatero a tus zapatos 👞',
  'la suerte está echada 🎲',
  'no hay mal que por bien no venga',
  'a caballo regalado no se le miran los dientes 🐴',
  'estamos para el arrastre 😩',
  'el que avisa no traiciona ✋',
  'quien mucho abarca, poco aprieta',
  'a las cartas y al amor, por un pelo se pierde 🃏',
  'de este pan comeré, dijo y no cumplió',
];

function botBanter(state: RoomState, exceptId: string, prob = 0.35) {
  if (Math.random() > prob) return;
  const otros = state.players.filter((p) => p.isBot && p.id !== exceptId);
  if (otros.length === 0) return;
  const bot = otros[Math.floor(Math.random() * otros.length)];

  const now = Date.now();
  const ultima = [...state.messages].reverse().find((m) => m.playerId === bot.id);
  if (ultima && now - ultima.at < 2500) return;

  state.messageSeq += 1;
  state.messages.push({
    seq: state.messageSeq,
    playerId: bot.id,
    name: bot.name,
    kind: 'text',
    text: pick(BOT_REPLIES),
    at: now,
  });
  if (state.messages.length > MAX_MESSAGES) state.messages = state.messages.slice(-MAX_MESSAGES);
}

/* ------------------------------------------------------------------ */
/* Devoluciones: los bots comentan las jugadas de otros por nombre     */
/* ------------------------------------------------------------------ */

type ReactEvento = 'ganoOtro' | 'clavo' | 'fallo' | 'lidera';

// `{n}` se reemplaza por el nombre del jugador comentado.
const REACT_SHARED: Record<ReactEvento, string[]> = {
  ganoOtro: ['bien ahí {n} 👏', 'esa fue tuya {n}', 'uh, {n} se la llevó', '{n} viene picante hoy 🔥', 'ojo con {n} 👀'],
  clavo: ['¡{n} la clavó! 🎯', 'uh, {n} calculó justo 👏', 'crack {n}', 'qué precisión, {n}'],
  fallo: ['jaja {n} se pasó 😆', 'uy {n}, no te salió', '{n} apostó cualquiera 😅'],
  lidera: ['{n} va adelante eh 👀', 'ojo que {n} lidera', 'alguien que frene a {n} 😅'],
};

// Sabor por personalidad (lo que no esté acá cae en el banco compartido).
const REACT_PERSONA: Record<string, Partial<Record<ReactEvento, string[]>>> = {
  Beto: { ganoOtro: ['claro, {n}, todo para vos 😒', 'otra para {n}, genial 😩'], fallo: ['te lo dije, {n} 😒'] },
  Dani: { ganoOtro: ['disfrutá {n}, ya te alcanzo 😏', 'suerte nomás, {n}'], lidera: ['tranqui que te remonto, {n} 😎'] },
  Gaby: { ganoOtro: ['jaja {n} otra vez 😂', 'no lo puedo creer {n} 🤣'], fallo: ['jajaja {n} 😂'] },
  Ana: { ganoOtro: ['{n}, ganás y me conquistás 😏', 'me encanta cómo juega {n} 😘'], clavo: ['qué precisión, {n}… me gusta 😉'] },
  Carla: { ganoOtro: ['¡bravo {n}! 🥰', 'qué bien {n} 💕'], fallo: ['no importa {n}, jugaste divino 💕'] },
  Elsa: { ganoOtro: ['¡{n} me está matando! 😱'] },
  Hugo: { ganoOtro: ['obvio, gana {n} y no yo 😮‍💨'] },
  Fito: { ganoOtro: ['bien {n}, tranca 😌'] },
};

function randomOtherBot(state: RoomState, exceptId: string): Player | null {
  const otros = state.players.filter((p) => p.isBot && p.id !== exceptId);
  return otros.length ? otros[Math.floor(Math.random() * otros.length)] : null;
}

/** Tono de cada bot para el generador procedural. */
const TONE: Record<string, Tone> = {
  Beto: 'grumpy',
  Carla: 'sweet',
  Dani: 'cocky',
  Elsa: 'drama',
  Fito: 'chill',
  Gaby: 'laughing',
  Hugo: 'pessimist',
  Ana: 'flirty',
};
const toneOf = (name: string): Tone => TONE[name] ?? 'chill';

/** Agrega el mensaje de un bot al chat, sin chequear enfriamiento. */
function appendBotMsg(state: RoomState, botId: string, text: string) {
  const bot = state.players.find((p) => p.id === botId);
  if (!bot || !bot.isBot || !text) return;
  state.messageSeq += 1;
  state.messages.push({
    seq: state.messageSeq,
    playerId: botId,
    name: bot.name,
    kind: 'text',
    text,
    at: Date.now(),
  });
  if (state.messages.length > MAX_MESSAGES) state.messages = state.messages.slice(-MAX_MESSAGES);
}

/** Empuja un mensaje de un bot respetando el enfriamiento. Devuelve si lo hizo. */
function pushBotMsg(state: RoomState, botId: string, text: string): boolean {
  const bot = state.players.find((p) => p.id === botId);
  if (!bot || !bot.isBot || !text) return false;
  const now = Date.now();
  const ultima = [...state.messages].reverse().find((m) => m.playerId === botId);
  if (ultima && now - ultima.at < 2500) return false;
  appendBotMsg(state, botId, text);
  return true;
}

/**
 * Conversaciones con ida y vuelta entre dos bots: uno abre y el otro (a veces el
 * primero) contesta con coherencia, nombrándose entre ellos. Los turnos son
 * `[quién, texto]` con quién 0 = el que abre, 1 = el otro; {vos} = el otro del par.
 */
type ConvTurn = [0 | 1, string];
const CONVERSACIONES: ConvTurn[][] = [
  [
    [0, '¡Qué bien venís, {vos}!'],
    [1, 'Gracias, {vos} 😌 vos también estás jugando fino'],
  ],
  [
    [0, 'Uh {vos}, ¿cómo hacés para clavarla siempre?'],
    [1, 'Práctica nomás, {vos} 😏'],
    [0, 'Enseñame algún día jaja'],
  ],
  [
    [0, 'Che {vos}, ¿todo bien por casa?'],
    [1, 'Todo bien, {vos}, gracias por preguntar 🙂'],
    [0, 'Me alegro 💛'],
  ],
  [
    [0, '{vos}, después de esta jugamos la revancha, ¿dale?'],
    [1, 'Obvio {vos}, no me voy sin ganarte una 😎'],
  ],
  [
    [0, 'Me caés bien, {vos}, en serio'],
    [1, 'Ay, {vos}, qué lindo 🥰 vos también'],
  ],
  [
    [0, '{vos} me está ganando y me da una bronca…'],
    [1, 'Tranqui {vos}, hoy es mi día 😏'],
  ],
  [
    [0, 'Buena esa, {vos} 👏'],
    [1, 'Gracias {vos}, me salió de pura suerte jaja'],
  ],
  [
    [0, '{vos}, ¿viste cómo se picó la mesa hoy?'],
    [1, 'Sí {vos}, está brava la cosa 😅'],
  ],
  [
    [0, '{vos} sos mi rival favorito eh'],
    [1, 'Jaja {vos}, que gane el mejor 😎'],
  ],
  [
    [0, 'Igual jugás bien, {vos}, te tengo cortita'],
    [1, 'Uy {vos}, ojito que te remonto 😏'],
  ],
];

/** Estado del chat programado: agrega los mensajes cuya hora ya llegó. */
export function flushChatQueue(state: RoomState) {
  const q = state.chatQueue;
  if (!q || q.length === 0) return;
  const now = Date.now();
  const restan: typeof q = [];
  for (const e of q) {
    if (e.at > now) {
      restan.push(e);
    } else if (now - e.at <= 12000) {
      // Si no se atrasó demasiado (perdería el hilo), lo mostramos.
      appendBotMsg(state, e.botId, e.text);
    }
  }
  state.chatQueue = restan;
}

/** Arranca una charla entre dos bots: el primer turno ya, el resto programado. */
function startConversation(state: RoomState) {
  if (!state.chatQueue) state.chatQueue = [];
  if (state.chatQueue.length > 0) return; // ya hay una charla en curso
  const bots = state.players.filter((p) => p.isBot);
  if (bots.length < 2) return;
  const a = bots[Math.floor(Math.random() * bots.length)];
  const resto = bots.filter((p) => p.id !== a.id);
  const b = resto[Math.floor(Math.random() * resto.length)];

  const conv = pick(CONVERSACIONES);
  const now = Date.now();
  let delay = 0;
  conv.forEach((turn, i) => {
    const [quien, tpl] = turn;
    const speaker = quien === 0 ? a : b;
    const other = quien === 0 ? b : a;
    const text = tpl.split('{vos}').join(other.name);
    if (i === 0) {
      appendBotMsg(state, speaker.id, text);
    } else {
      delay += 1500 + Math.floor(Math.random() * 1300);
      state.chatQueue.push({ botId: speaker.id, text, at: now + delay });
    }
  });
}

/** Un bot larga una frase GENERADA (procedural, con datos reales de la partida). */
function botGen(
  state: RoomState,
  botId: string,
  coreKey: string,
  vars: Record<string, string | number>,
  prob = 0.4
) {
  if (Math.random() > prob) return;
  const bot = state.players.find((p) => p.id === botId);
  if (!bot || !bot.isBot) return;
  pushBotMsg(state, botId, genLine(toneOf(bot.name), coreKey, vars));
}

function statBucket(state: RoomState, id: string) {
  const stats = state.botStats;
  if (!stats.per[id]) stats.per[id] = { clavadas: 0, fallos: 0, bidHigh: 0, bidZero: 0 };
  return stats.per[id];
}

/** Cuando alguien "salta" (no tenía el palo), un bot lo carga. */
function botSalto(state: RoomState, playerId: string, card: Card) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  const b = randomOtherBot(state, playerId);
  if (!b) return;
  let bank = SALTO_GENERAL;
  if (Math.random() < 0.6) {
    bank = card.suit === state.trumpSuit ? SALTO_TRIUNFO : SALTO_DESCARTE;
  }
  pushBotMsg(state, b.id, pick(bank).split('{n}').join(player.name));
}

/** Comentario de ambiente suelto: clima de mesa o un dicho argentino. */
function botAmbiente(state: RoomState, botId: string, prob = 0.07) {
  if (Math.random() > prob) return;
  // Mitad clima (hambre, birra…), mitad refrán argentino.
  pushBotMsg(state, botId, pick(Math.random() < 0.5 ? AMBIENTE : DICHOS));
}

/** Un bot le comenta a otro jugador (por nombre) según lo que hizo. */
function botReact(state: RoomState, botId: string, evento: ReactEvento, targetName: string, prob = 0.4) {
  if (Math.random() > prob) return;
  const bot = state.players.find((p) => p.id === botId);
  if (!bot || !bot.isBot) return;

  const now = Date.now();
  const ultima = [...state.messages].reverse().find((m) => m.playerId === botId);
  if (ultima && now - ultima.at < 2500) return;

  const bank = REACT_PERSONA[bot.name]?.[evento] ?? REACT_SHARED[evento];
  const text = pick(bank).replace('{n}', targetName);

  state.messageSeq += 1;
  state.messages.push({ seq: state.messageSeq, playerId: botId, name: bot.name, kind: 'text', text, at: now });
  if (state.messages.length > MAX_MESSAGES) state.messages = state.messages.slice(-MAX_MESSAGES);
}

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

/** Tope de cartas por mano: las basas van hasta 8. */
const HAND_CAP = 8;

/**
 * Serie base de un formato (SIN topear por jugadores).
 *
 * Las manos numeradas salen en orden al azar (una baraja del 1 al 8) y cada
 * bloque cierra con una mano de 8 sin triunfo.
 *
 * Corta: 8 manos al azar + un cierre sin triunfo (9 en total).
 * Larga: dos bloques de 8 al azar, cada uno con su cierre sin triunfo (18).
 */
function formatBase(length: 'corta' | 'larga'): { base: number[]; noTrump: number[] } {
  const bloque = () => shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
  if (length === 'larga') {
    return { base: [...bloque(), 8, ...bloque(), 8], noTrump: [9, 18] };
  }
  return { base: [...bloque(), 8], noTrump: [9] };
}

/** Topea la serie base según cuántos jugadores hay (8 no entra con 7-8). */
function capBase(base: number[], playerCount: number): number[] {
  const max = maxCardsPerRound(playerCount);
  return base.map((c) => Math.min(c, max));
}

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
    gameId: null,
    roundBase: [],
    noTrumpRounds: [],
    gameLength: null,
    hostId,
    phase: 'lobby',
    players: [],
    pending: [],
    kicking: [],
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
    typing: {},
    botStats: { streakId: null, streak: 0, per: {} },
    played: [],
    voids: {},
    chatQueue: [],
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
    voice: null,
    avatar: null,
    emotes: [],
    hand: [],
    bid: null,
    tricks: 0,
    points: 0,
    wins: 0,
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
 * Al arrancar una mano ajusta la mesa: saca a los expulsados, incorpora a los
 * que esperaban (con el puntaje del que menos tiene, para no arrancar en
 * desventaja) y rehace el plan de las manos que faltan, porque con otra cantidad
 * de jugadores cambian las cartas por mano.
 */
function reconcilePlayers(state: RoomState, fromRound: number) {
  const kicking = state.kicking ?? [];
  const pending = state.pending ?? [];
  if (kicking.length === 0 && pending.length === 0) return;

  // 1. Expulsados
  if (kicking.length) {
    for (const id of kicking) {
      const p = state.players.find((x) => x.id === id);
      if (p) log(state, `${p.name} fue expulsado de la mesa.`);
      delete state.tokens[id];
    }
    state.players = state.players.filter((p) => !kicking.includes(p.id));
    state.kicking = [];
    if (state.dealerIndex >= state.players.length) {
      state.dealerIndex = Math.max(0, state.players.length - 1);
    }
  }

  // 2. Los que esperaban
  if (pending.length) {
    const minPoints = state.players.length
      ? Math.min(...state.players.map((p) => p.points))
      : 0;
    for (const p of pending) {
      p.points = minPoints;
      state.players.push(p);
      log(state, `${p.name} se suma a la mesa con ${minPoints} pts.`);
    }
    state.pending = [];
  }

  // 3. Re-topear las manos que faltan para la nueva cantidad de jugadores,
  // desde la serie base (misma serie/orden; solo cambia el tope). Así, si eran
  // 6 y pasan a 7, el "8 sin muestra" y las que sigan bajan a 7, etc. Las manos
  // ya jugadas quedan como estaban.
  const base = state.roundBase?.length ? state.roundBase : state.roundCards;
  if (base.length > 0 && state.players.length > 0) {
    const recapped = capBase(base, state.players.length).slice(fromRound - 1);
    state.roundCards = [...state.roundCards.slice(0, fromRound - 1), ...recapped];
  }
}

/**
 * El anfitrión expulsa a un jugador o bot. En el lobby se va al toque; con la
 * partida en curso se va al arrancar la mano siguiente (no se puede sacar a
 * alguien de una mano ya repartida sin romper el orden).
 */
export function kickPlayer(state: RoomState, hostId: string, targetId: string) {
  if (state.hostId !== hostId) throw new RuleError('Solo el anfitrión puede expulsar.');
  if (targetId === hostId) throw new RuleError('No podés expulsarte a vos mismo.');

  // Si sólo estaba esperando, se va sin más.
  const pending = state.pending ?? [];
  if (pending.some((p) => p.id === targetId)) {
    state.pending = pending.filter((p) => p.id !== targetId);
    delete state.tokens[targetId];
    return;
  }

  const target = state.players.find((p) => p.id === targetId);
  if (!target) throw new RuleError('Ese jugador no está en la mesa.');

  if (state.phase === 'lobby') {
    removePlayer(state, targetId);
    return;
  }

  // En curso: encolar, cuidando que queden al menos MIN_PLAYERS para seguir.
  const kicking = state.kicking ?? (state.kicking = []);
  if (kicking.includes(targetId)) return;
  const quedarian = state.players.length - kicking.length - 1 + (state.pending?.length ?? 0);
  if (quedarian < MIN_PLAYERS) {
    throw new RuleError(`Tienen que quedar al menos ${MIN_PLAYERS} jugadores.`);
  }
  kicking.push(targetId);
  log(state, `${target.name} será expulsado en la próxima mano.`);
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
  // Ya mandó: deja de estar "escribiendo".
  if (state.typing) delete state.typing[playerId];
}

/** Marca que el jugador está escribiendo (por unos segundos). */
export function setTyping(state: RoomState, playerId: string) {
  const player = findParticipant(state, playerId);
  if (!player) return;
  state.typing = state.typing ?? {};
  state.typing[playerId] = Date.now() + 4000;
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
    voice: (PERSONAS[name] ?? FALLBACK_PERSONA).voice,
    avatar: `emoji:${AVATAR_EMOJIS[state.players.length % AVATAR_EMOJIS.length]}`,
    emotes: [],
    hand: [],
    bid: null,
    tricks: 0,
    points: 0,
    wins: 0,
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

export function startGame(state: RoomState, length: 'corta' | 'larga' | number) {
  if (state.phase !== 'lobby') throw new RuleError('La partida ya arrancó.');
  if (state.players.length < MIN_PLAYERS) {
    throw new RuleError(`Hacen falta al menos ${MIN_PLAYERS} jugadores.`);
  }

  if (typeof length === 'number') {
    // Modo legado (tests): plan aleatorio, última mano sin triunfo.
    state.totalRounds = Math.max(1, Math.min(20, Math.floor(length)));
    state.roundBase = buildRoundPlan(state.totalRounds, state.players.length);
    state.roundCards = [...state.roundBase];
    state.noTrumpRounds = [state.totalRounds];
    state.gameLength = null;
  } else {
    const { base, noTrump } = formatBase(length);
    state.roundBase = base;
    state.roundCards = capBase(base, state.players.length);
    state.noTrumpRounds = noTrump;
    state.totalRounds = base.length;
    state.gameLength = length;
  }

  state.round = 0;
  // Dealer inicial al azar (startRound le suma 1, así que el primero en repartir
  // sale parejo entre todos). De ahí en más va rotando normal.
  state.dealerIndex = Math.floor(Math.random() * state.players.length);
  state.players = state.players.map((p) => ({ ...p, points: 0 }));
  state.history = [];
  state.botStats = { streakId: null, streak: 0, per: {} }; // memoria fresca por partida
  state.chatQueue = []; // sin charlas pendientes de antes
  state.gameId = crypto.randomUUID(); // identifica esta partida en el historial
  log(state, `¡Arranca la partida! ${state.totalRounds} manos.`);
  // Los bots saludan a su manera al arrancar.
  for (const p of state.players) {
    if (p.isBot) botChatter(state, p.id, 'saludo', 0.6);
  }
  startRound(state);
}

export function startRound(state: RoomState) {
  const nextRound = state.round + 1;

  // Al empezar la mano ajustamos la mesa: expulsados fuera, los que esperaban
  // adentro, y el plan de lo que falta rehecho para la nueva cantidad.
  reconcilePlayers(state, nextRound);

  if (nextRound > state.totalRounds) {
    const best = [...state.players].sort((a, b) => b.points - a.points)[0];
    state.phase = 'gameOver';
    state.winnerId = best.id;
    if (best) best.wins = (best.wins ?? 0) + 1; // marcador acumulado de la sala
    log(state, `Fin del juego. Ganó ${best.name} con ${best.points} puntos.`);
    // Los bots cierran: el ganador festeja, los demás se lamentan.
    for (const p of state.players) {
      if (p.isBot) botChatter(state, p.id, p.id === best.id ? 'ganaJuego' : 'pierdeJuego', 0.8);
    }
    return;
  }

  const count = state.players.length;
  const perPlayer = state.roundCards[nextRound - 1] ?? maxCardsPerRound(count);
  const { hands, rest } = deal(shuffle(createDeck()), count, perPlayer);
  // Las manos marcadas (los cierres de 8) se juegan sin triunfo.
  const noTrump = (state.noTrumpRounds ?? []).includes(nextRound);
  const trumpCard = noTrump ? null : rest[0] ?? null;

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
  state.played = []; // conteo de cartas: arranca limpio cada ronda
  state.voids = {};
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

  // Memoria de tendencias: quién siempre pide alto / siempre cero. Cuando se
  // repite, un bot lo señala (funciona para bots y para vos).
  const bucket = statBucket(state, playerId);
  if (bid === 0) {
    bucket.bidZero += 1;
    if (bucket.bidZero >= 3) {
      const b = randomOtherBot(state, playerId);
      if (b) botGen(state, b.id, 'bidZeroAlways', { n: player.name }, 0.4);
    }
  } else if (bid >= Math.ceil(state.cardsThisRound / 2)) {
    bucket.bidHigh += 1;
    if (bucket.bidHigh >= 3) {
      const b = randomOtherBot(state, playerId);
      if (b) botGen(state, b.id, 'bidHigh', { n: player.name }, 0.4);
    }
  }

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

  // "Salto": había un palo de salida y esta carta es de otro palo (no lo tenía).
  const leadBefore = state.trick.length > 0 ? state.leadSuit : null;
  const esSalto = leadBefore !== null && card.suit !== leadBefore;

  player.hand.splice(index, 1);
  state.trick.push({ card, playerId });
  if (state.trick.length === 1) state.leadSuit = card.suit;
  log(state, `${player.name} jugó ${valueLabel(card.value)} de ${SUIT_NAME[card.suit]}.`);

  // Conteo de cartas (info pública): registro la carta y, si saltó, que este
  // jugador ya no tiene el palo de salida.
  if (!state.played) state.played = [];
  if (!state.voids) state.voids = {};
  state.played.push(card);
  if (esSalto && leadBefore) {
    const v = (state.voids[playerId] ??= []);
    if (!v.includes(leadBefore)) v.push(leadBefore);
  }

  if (esSalto && Math.random() < 0.55) botSalto(state, playerId, card);

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

  // Los bots comentan: el ganador festeja, alguno de los otros se queja, y a
  // veces se cruzan entre ellos para darle vida a la charla.
  if (winner.isBot) {
    botChatter(state, winner.id, 'ganaBaza', 0.4);
    botBanter(state, winner.id, 0.3);
  }
  const perdedorBot = state.players.find((p) => p.isBot && p.id !== winnerId);
  if (perdedorBot) botChatter(state, perdedorBot.id, 'pierdeBaza', 0.22);

  // Memoria: racha de bazas al hilo.
  const stats = state.botStats;
  if (stats.streakId === winnerId) stats.streak += 1;
  else {
    stats.streakId = winnerId;
    stats.streak = 1;
  }

  // Devolución: un bot le comenta al que ganó, por su nombre. Más probable si
  // ganó un humano, para que sientas que te siguen la jugada.
  const comentarista = randomOtherBot(state, winnerId);
  if (comentarista) {
    // Si hay racha, un comentario GENERADO sobre la racha; si no, la reacción normal.
    if (stats.streak >= 2) {
      botGen(state, comentarista.id, 'streak', { n: winner.name, k: stats.streak }, 0.55);
    } else {
      botReact(state, comentarista.id, 'ganoOtro', winner.name, winner.isBot ? 0.28 : 0.6);
    }
  }

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

  // Memoria: contamos clavadas y fallos de la partida.
  for (const r of results) {
    const bucket = statBucket(state, r.playerId);
    if (r.tricks === r.bid) bucket.clavadas += 1;
    else if (Math.abs(r.tricks - r.bid) >= 2) bucket.fallos += 1;
  }

  // Devoluciones de fin de mano: felicitan al que clavó (y si ya lo hizo varias
  // veces, una frase generada más picante), cargan al que erró y marcan al líder.
  const clavaron = results.filter((r) => r.tricks === r.bid);
  const fallaron = results.filter((r) => Math.abs(r.tricks - r.bid) >= 2);
  if (clavaron.length) {
    const r = pick(clavaron);
    const j = state.players.find((p) => p.id === r.playerId)!;
    const b = randomOtherBot(state, r.playerId);
    if (b) {
      if (statBucket(state, r.playerId).clavadas >= 2) {
        botGen(state, b.id, 'clavoOtra', { n: j.name }, 0.6);
      } else {
        botReact(state, b.id, 'clavo', j.name, 0.5);
      }
    }
  }
  // Al que se pasó (hizo más de las que pidió) lo cargan con ganas.
  const pasados = results.filter((r) => r.tricks > r.bid);
  if (pasados.length && Math.random() < 0.6) {
    const r = pick(pasados);
    const j = state.players.find((p) => p.id === r.playerId)!;
    const b = randomOtherBot(state, r.playerId);
    if (b) pushBotMsg(state, b.id, pick(PASADA).split('{n}').join(j.name));
  }
  // El "fallo" genérico queda para el que quedó CORTO (no para el que se pasó).
  const cortos = fallaron.filter((r) => r.tricks < r.bid);
  if (cortos.length) {
    const r = pick(cortos);
    const j = state.players.find((p) => p.id === r.playerId)!;
    const b = randomOtherBot(state, r.playerId);
    if (b) botReact(state, b.id, 'fallo', j.name, 0.45);
  }
  if (state.round >= 2) {
    const lider = [...state.players].sort((a, b) => b.points - a.points)[0];
    if (lider) {
      const b = randomOtherBot(state, lider.id);
      if (b) botGen(state, b.id, 'lead', { n: lider.name }, 0.3);
    }
  }
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
    botDoBid(state, player);
  } else {
    botDoPlay(state, player);
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
    botDoBid(state, player);
  } else {
    botDoPlay(state, player);
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
  state.kicking = [];
  state.gameId = null; // el historial de la partida anterior ya quedó cerrado
  // Se reinician las bazas y los puntos, pero se conservan las victorias (wins).
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

/**
 * Estima cuántas bazas puede hacer la mano. Cada carta suma una probabilidad
 * aproximada de ganar su baza: los triunfos valen bastante (hasta uno bajo puede
 * matar), las cartas de otro palo casi solo si son A/K. Así, con dos triunfos
 * bajos en una mano de cuatro pide ~1, no cuatro.
 */
function estimateTricks(hand: Card[], trump: Suit | null): number {
  let exp = 0;
  for (const c of hand) {
    if (trump && c.suit === trump) {
      exp += c.value === 14 ? 1 : c.value === 13 ? 0.9 : c.value === 12 ? 0.78 : c.value === 11 ? 0.62 : 0.45;
    } else {
      exp += c.value === 14 ? 0.88 : c.value === 13 ? 0.55 : c.value === 12 ? 0.3 : c.value === 11 ? 0.15 : 0.05;
    }
  }
  return exp;
}

function botBid(state: RoomState, player: Player): number {
  const n = state.cardsThisRound;
  // Estimación + un poco de ruido para que no pidan todos exactamente igual.
  const exp = estimateTricks(player.hand, state.trumpSuit) + (Math.random() - 0.5) * 0.4;
  let bid = Math.max(0, Math.min(Math.round(exp), n));

  const forbidden = forbiddenBid(state);
  if (forbidden === bid) {
    // El dealer no puede cerrar justo: se corre al valor permitido más cercano
    // a su estimación real (no siempre para abajo).
    const down = bid - 1;
    const up = bid + 1;
    const canDown = down >= 0;
    const canUp = up <= n;
    if (canDown && (!canUp || Math.abs(exp - down) <= Math.abs(exp - up))) bid = down;
    else if (canUp) bid = up;
    bid = Math.max(0, Math.min(bid, n));
  }
  return bid;
}

const SUIT_VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/**
 * El valor más alto de `suit` que todavía podría estar en la mano de un rival:
 * el que no se jugó ni tengo yo. Devuelve 1 si ya no queda ninguna afuera. Base
 * del "conteo": si mi carta es más alta que esto, mando en ese palo.
 */
function topOutstanding(suit: Suit, played: Card[], myHand: Card[]): number {
  const usados = new Set<number>();
  for (const c of played) if (c.suit === suit) usados.add(c.value);
  for (const c of myHand) if (c.suit === suit) usados.add(c.value);
  let top = 1;
  for (const v of SUIT_VALUES) if (!usados.has(v) && v > top) top = v;
  return top;
}

/** ¿Tengo la carta más alta que queda de su palo? (mando ese palo) */
function holdsMaster(card: Card, played: Card[], myHand: Card[]): boolean {
  return card.value > topOutstanding(card.suit, played, myHand);
}

/** Cuántos triunfos siguen afuera (ni jugados ni en mi mano). */
function trumpsOutstanding(trump: Suit | null, played: Card[], myHand: Card[]): number {
  if (!trump) return 0;
  const usados = new Set<number>();
  for (const c of played) if (c.suit === trump) usados.add(c.value);
  for (const c of myHand) if (c.suit === trump) usados.add(c.value);
  return SUIT_VALUES.filter((v) => !usados.has(v)).length;
}

/**
 * Elige carta "contando": recuerda lo ya jugado (`state.played`) y quién quedó
 * sin cada palo (`state.voids`), todo info pública. Con eso sabe si su carta es
 * la más alta que queda, si su ganada va a aguantar, y si le pueden matar con
 * triunfo. Nunca mira las manos ajenas.
 */
function botCard(state: RoomState, player: Player): Card {
  const trump = state.trumpSuit;
  const hand = player.hand;
  const options = playableCards(hand, state.leadSuit, trump);
  const byValue = [...options].sort((a, b) => a.value - b.value);
  const isT = (c: Card) => trump !== null && c.suit === trump;

  const played = [...(state.played ?? []), ...state.trick.map((t) => t.card)];
  const voids = state.voids ?? {};

  const need = (player.bid ?? 0) - player.tricks;
  const ganchos = hand.length; // bazas que le quedan por jugar
  const wantWin = need > 0 && need <= ganchos;
  const desperate = wantWin && need >= ganchos; // tiene que ganar todas las que quedan

  // Quiénes juegan DESPUÉS de mí en esta baza (para saber si mi ganada aguanta).
  const total = state.players.length;
  const laterIds: string[] = [];
  for (let i = 1; i <= total - state.trick.length - 1; i++) {
    laterIds.push(state.players[(state.turnIndex + i) % total].id);
  }
  const laterVoid = (suit: Suit) => laterIds.some((id) => (voids[id] ?? []).includes(suit));
  const tOut = trumpsOutstanding(trump, played, hand);

  // La ganadora más barata, guardando triunfos (primero no-triunfo, y bajo).
  const cheapWin = (cards: Card[]) =>
    [...cards].sort((a, b) => (isT(a) ? 1 : 0) - (isT(b) ? 1 : 0) || a.value - b.value)[0];

  // ---- Abre la baza ----
  if (state.trick.length === 0) {
    if (!wantWin) {
      // No quiere ganar: sale bajo y evita salir con una carta que manda (ganaría).
      const noManda = options.filter((c) => !holdsMaster(c, played, hand));
      return (noManda.length ? noManda : options).sort((a, b) => a.value - b.value)[0];
    }
    // Quiere ganar. 1) Si tengo el triunfo que manda, lo tiro (arrastra y asegura).
    const misTriunfos = options.filter(isT).sort((a, b) => b.value - a.value);
    if (misTriunfos.length && holdsMaster(misTriunfos[0], played, hand)) return misTriunfos[0];
    // 2) Carta que manda en otro palo y que probablemente aguante (sin riesgo de
    //    que la maten: sin triunfos afuera o nadie de los que siguen quedó sin ese palo).
    const mandaSeguro = options
      .filter((c) => !isT(c) && holdsMaster(c, played, hand))
      .filter((c) => tOut === 0 || !laterVoid(c.suit))
      .sort((a, b) => b.value - a.value);
    if (mandaSeguro.length) return mandaSeguro[0];
    // 3) Sin jugada segura: si está obligado a ganar todas, va con lo más fuerte;
    //    si no, guarda las buenas y sale barato.
    if (desperate) {
      return [...options].sort((a, b) => (isT(b) ? 1 : 0) - (isT(a) ? 1 : 0) || b.value - a.value)[0];
    }
    return byValue[0];
  }

  // ---- Sigue la baza ----
  const winning = options.filter((card) => {
    const hyp = [...state.trick, { card, playerId: player.id }];
    return trickWinner(hyp, state.leadSuit, trump) === player.id;
  });
  const losing = options.filter((c) => !winning.includes(c));

  // ¿Mi ganada aguanta? (nadie que juegue después me la puede sacar)
  const aguanta = (c: Card) => {
    if (laterIds.length === 0) return true; // juego último: queda fija
    if (isT(c)) return topOutstanding(trump as Suit, played, hand) <= c.value; // no queda triunfo más alto
    // Gané sirviendo el palo: me superan con uno más alto del palo o matándome.
    const hayMasAlta = topOutstanding(state.leadSuit as Suit, played, hand) > c.value;
    const puedenMatar = tOut > 0 && laterVoid(state.leadSuit as Suit);
    return !hayMasAlta && !puedenMatar;
  };

  if (wantWin) {
    if (winning.length > 0) {
      const seguras = winning.filter(aguanta);
      return cheapWin(seguras.length ? seguras : winning);
    }
    return byValue[0]; // no puede ganar: tira bajo y guarda las altas
  }

  // No quiere ganar: deja pasar la baza y suelta su carta más peligrosa.
  if (losing.length > 0) {
    return [...losing].sort((a, b) => b.value - a.value || (isT(b) ? 1 : 0) - (isT(a) ? 1 : 0))[0];
  }
  // Obligado a ganar (todas ganan): la más barata para hacer el menor daño.
  return cheapWin(winning);
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
      botDoBid(state, player);
    } else {
      botDoPlay(state, player);
    }
  }
}

export function isBotOnly(state: RoomState): boolean {
  return state.players.every((p) => p.isBot);
}

export { SUIT_NAME };
export type { Suit };
