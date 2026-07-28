'use client';

/**
 * Lee en voz alta las frases de los bots con la voz del navegador
 * (SpeechSynthesis). No hay archivos ni API: es la síntesis del sistema.
 *
 * La diferencia hombre/mujer se logra ante todo con el tono (pitch): aunque el
 * navegador tenga una sola voz en español, un pitch más grave o más agudo la
 * vuelve claramente masculina o femenina.
 */

import { getVolume } from './audio';

export function botVoicesOn(): boolean {
  return getVolume('bots') > 0;
}

// Pistas de género por el nombre de la voz (según sistema operativo). Amplias
// para cubrir Windows (Microsoft …), Google y Apple en español.
const FEMALE_HINTS =
  /female|mujer|femenin|helena|laura|sabina|m[oó]nica|paulina|marisol|esperanza|elena|luc[ií]a|pen[eé]lope|catalina|isabela|camila|sof[ií]a|ximena|dalia|paloma|ang[eé]lica|tania|nuria|montserrat|conchita|lupe|marisa|rosa|valentina/i;
const MALE_HINTS =
  /\bmale|masculin|hombre|pablo|ra[uú]l|jorge|juan|diego|carlos|miguel|enrique|[aá]lvaro|andr[eé]s|dar[ií]o|gonzalo|liam|felipe|arnau|roberto|ricardo|fernando/i;

let chosen: { m: SpeechSynthesisVoice | null; f: SpeechSynthesisVoice | null } | null = null;

/**
 * Elige la voz de hombre y la de mujer. Clave para que NUNCA queden al revés:
 * solo usamos dos voces distintas cuando podemos reconocer una masculina Y una
 * femenina por el nombre. Si no reconocemos el género (voces tipo "Google
 * español"), usamos UNA sola voz base para ambos y la diferencia la hace el
 * tono (agudo = mujer, grave = hombre). Así jamás se asigna una voz de hombre a
 * una bot mujer por error.
 */
function pickVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return { m: null, f: null };
  if (chosen) return chosen;

  const all = window.speechSynthesis.getVoices();
  const es = all.filter((v) => v.lang?.toLowerCase().startsWith('es'));
  const pool = es.length ? es : all;
  if (pool.length === 0) return { m: null, f: null };

  // Calidad: las voces "naturales"/neurales o de red suenan mucho mejor que las
  // locales robóticas. Cuanto más bajo, mejor.
  const quality = (v: SpeechSynthesisVoice) => {
    let s = 0;
    if (/natural|neural|online|premium|enhanced/i.test(v.name)) s -= 5;
    if (!v.localService) s -= 2; // de red, suelen ser mejores
    if (/google/i.test(v.name)) s -= 1;
    return s;
  };
  // Preferí es-AR, después es-419/MX/US, después el resto; a igualdad, la de más calidad.
  const locale = (v: SpeechSynthesisVoice) =>
    /es[-_]AR/i.test(v.lang) ? 0 : /es[-_](419|MX|US)/i.test(v.lang) ? 1 : 2;
  const sorted = [...pool].sort((a, b) => locale(a) - locale(b) || quality(a) - quality(b));

  const females = sorted.filter((v) => FEMALE_HINTS.test(v.name));
  const males = sorted.filter((v) => MALE_HINTS.test(v.name));

  let f = females[0] ?? null;
  let m = males[0] ?? null;

  // Rellenos SIN inventar género: si solo conozco una, la otra usa la misma voz
  // (el tono la diferencia). Si no conozco ninguna, una sola base para las dos.
  if (f && !m) m = f;
  else if (m && !f) f = m;
  else if (!f && !m) {
    f = sorted[0] ?? null;
    m = sorted[0] ?? null;
  }

  chosen = { m, f };
  return chosen;
}

/**
 * Habla el texto con la voz indicada. Quita los emojis (no se leen) y limita el
 * largo. Descarta si hay demasiado en cola, para no acumular.
 */
export function speakBot(text: string, gender: 'm' | 'f') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const vol = getVolume('bots');
  if (vol <= 0) return;
  if (document.hidden) return; // no hablar en segundo plano

  const clean = text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .trim()
    .slice(0, 120);
  if (!clean) return;

  const synth = window.speechSynthesis;
  // Si ya hay varias frases esperando, no encolamos más (evita el "coro").
  if (synth.speaking && synth.pending) return;

  const { m, f } = pickVoices();
  const voice = gender === 'f' ? f : m;
  const sameVoice = m && f && m === f; // comparten voz: el tono hace TODA la diferencia

  const u = new SpeechSynthesisUtterance(clean);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'es-AR';
  // Mujer: aguda y un toque más ligera. Hombre: grave y más pausado (voz de
  // macho). Si comparten voz base, la brecha de tono es más grande para que se
  // note bien quién es quién sin sonar robótico.
  if (gender === 'f') {
    u.pitch = sameVoice ? 1.45 : 1.2;
    u.rate = 1.03;
  } else {
    u.pitch = sameVoice ? 0.62 : 0.82;
    u.rate = 0.95;
  }
  u.volume = vol;
  synth.speak(u);
}

/** Algunos navegadores cargan las voces async; forzamos el primer inventario. */
export function warmUpVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  pickVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    chosen = null;
    pickVoices();
  };
}
