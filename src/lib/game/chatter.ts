/**
 * Generador procedural de frases para los bots. En vez de un banco fijo, arma
 * cada frase combinando un arranque (según el tono del bot), un núcleo (según lo
 * que pasó, con datos reales de la partida) y un remate. Con pocas opciones por
 * pieza salen miles de combinaciones distintas y coherentes.
 *
 * No es "aprendizaje" en el sentido de ML: la sensación de que te conoce viene
 * de los datos que le pasamos (rachas, tendencias, quién lidera), que se llevan
 * en el estado de la sala (ver botStats en engine).
 */

export type Tone =
  | 'grumpy'
  | 'sweet'
  | 'cocky'
  | 'drama'
  | 'chill'
  | 'laughing'
  | 'pessimist'
  | 'flirty';

const R = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const PREFIX: Record<Tone, string[]> = {
  grumpy: ['', 'Uf,', 'Otra vez,', 'Claro,', 'Y bueno,'],
  sweet: ['', 'Ay,', 'Uh,', 'Miren,', 'Qué lindo,'],
  cocky: ['', 'Ja,', 'Obvio,', 'Miren,', 'Atenti,'],
  drama: ['', '¡Nooo,', '¡Ayyy,', '¡No puede ser,', 'Basta,'],
  chill: ['', 'Tranqui,', 'Mirá vos,', 'Che,', 'Naa,'],
  laughing: ['', 'Jaja,', 'Jajaja,', 'No,', 'Pero'],
  pessimist: ['', 'Obvio,', 'Y sí,', 'Como siempre,', 'Lo sabía,'],
  flirty: ['', 'Uy,', 'Mmm,', 'Guapo,', 'Ojito,'],
};

const SUFFIX: Record<Tone, string[]> = {
  grumpy: ['😒', '😤', '😩', ''],
  sweet: ['🥰', '💕', '💖', ''],
  cocky: ['😎', '😏', '', ''],
  drama: ['😱', '😰', '😭', ''],
  chill: ['😌', '', '', ''],
  laughing: ['😂', '🤣', '😆', ''],
  pessimist: ['😮‍💨', '😞', '', ''],
  flirty: ['😏', '😘', '😉', ''],
};

/** Núcleos por situación. {n}=jugador, {k}=número, {lead}=líder. */
const CORE: Record<string, string[]> = {
  streak: [
    '{n} lleva {k} bazas seguidas',
    '{k} al hilo se lleva {n}',
    'nadie para a {n}, van {k}',
    '{n} está imparable, {k} seguidas',
    'otra más para {n}, ya van {k}',
  ],
  clavoOtra: [
    '{n} la clavó de nuevo',
    'otra vez justo {n}',
    '{n} no falla una',
    'de nuevo {n}, qué precisión',
    '{n} calcula como reloj',
  ],
  bidHigh: [
    '{n} siempre pide alto',
    'otra apuesta grande de {n}',
    '{n} nunca se guarda nada',
    'ahí va {n} con todo, como siempre',
    '{n} no sabe pedir bajo',
  ],
  bidZeroAlways: [
    '{n} de vuelta pide cero',
    '{n} siempre se borra',
    'cero otra vez {n}, jugado',
    '{n} es un experto en el cero',
  ],
  lead: [
    '{n} se está escapando arriba',
    'ojo que {n} lidera cómodo',
    'alguien que baje a {n}',
    '{n} nos está pasando el trapo',
    'va ganando {n}, ¿lo dejamos?',
  ],
};

/**
 * Arma una frase. `vars` reemplaza los huecos ({n}, {k}, …). Si no hay arranque,
 * capitaliza el núcleo para que quede prolijo.
 */
export function genLine(
  tone: Tone,
  coreKey: keyof typeof CORE | string,
  vars: Record<string, string | number> = {}
): string {
  const cores = CORE[coreKey];
  if (!cores) return '';
  let core = R(cores);
  for (const [k, v] of Object.entries(vars)) core = core.split(`{${k}}`).join(String(v));

  const p = R(PREFIX[tone]);
  const s = R(SUFFIX[tone]);
  let text = p ? `${p} ${core}` : core.charAt(0).toUpperCase() + core.slice(1);
  if (s) text += ` ${s}`;
  return text;
}
