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

// Pistas de género por el nombre de la voz (según sistema operativo).
const FEMALE_HINTS = /female|mujer|helena|laura|sabina|mónica|monica|paulina|marisol|esperanza|elena|lucia|lucía|penelope|penélope|catalina|isabela|camila|sof/i;
const MALE_HINTS = /male|hombre|pablo|raul|raúl|jorge|juan|diego|carlos|miguel|enrique|alvaro|álvaro|andres|andrés/i;

let chosen: { m: SpeechSynthesisVoice | null; f: SpeechSynthesisVoice | null } | null = null;

/**
 * Elige una voz de hombre y una de mujer, de verdad distintas cuando el sistema
 * tiene varias en español. Así una bot mujer no suena con voz de hombre. Si solo
 * hay una, se comparte y la diferencia la hace el tono.
 */
function pickVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return { m: null, f: null };
  if (chosen) return chosen;

  const all = window.speechSynthesis.getVoices();
  const es = all.filter((v) => v.lang?.toLowerCase().startsWith('es'));
  const pool = es.length ? es : all;
  if (pool.length === 0) return { m: null, f: null };

  // Preferí es-AR / es-419 / es-MX si están.
  const rank = (v: SpeechSynthesisVoice) =>
    /es[-_]AR/i.test(v.lang) ? 0 : /es[-_](419|MX|US)/i.test(v.lang) ? 1 : 2;
  const sorted = [...pool].sort((a, b) => rank(a) - rank(b));

  let f = sorted.find((v) => FEMALE_HINTS.test(v.name)) ?? null;
  let m = sorted.find((v) => MALE_HINTS.test(v.name)) ?? null;

  // Si falta alguna, tomamos voces distintas entre sí de la lista.
  if (!f) f = sorted.find((v) => v !== m) ?? sorted[0] ?? null;
  if (!m) m = sorted.find((v) => v !== f) ?? sorted[0] ?? null;

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
  const sameVoice = m && f && m === f; // solo hay una: diferenciamos por tono

  const u = new SpeechSynthesisUtterance(clean);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'es-AR';
  // Pitch suave para que suene natural; más marcado solo si compartimos voz.
  u.pitch = gender === 'f' ? (sameVoice ? 1.25 : 1.08) : sameVoice ? 0.85 : 0.96;
  u.rate = 1.0;
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
