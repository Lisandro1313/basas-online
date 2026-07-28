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

/**
 * Género REAL de voces conocidas (Google, Windows/Microsoft, Apple). Es lo más
 * confiable: los nombres de estas voces son estables. La clave del nombre se
 * busca sin acentos dentro del nombre de la voz.
 */
const KNOWN_GENDER: Record<string, 'm' | 'f'> = {
  // Apple (macOS/iOS)
  monica: 'f', paulina: 'f', marisol: 'f', angelica: 'f', soledad: 'f',
  jorge: 'm', juan: 'm', diego: 'm', carlos: 'm',
  // Microsoft (desktop SAPI + neurales "Online (Natural)")
  helena: 'f', sabina: 'f', laura: 'f', dalia: 'f', elvira: 'f', ximena: 'f',
  estrella: 'f', nuria: 'f', triana: 'f', renata: 'f', yolanda: 'f', paloma: 'f',
  larissa: 'f', catalina: 'f', marina: 'f', abril: 'f', camila: 'f', salome: 'f',
  pablo: 'm', raul: 'm', alvaro: 'm', alonso: 'm', dario: 'm', gonzalo: 'm',
  lorenzo: 'm', liberto: 'm', gerardo: 'm', tomas: 'm', victor: 'm', gael: 'm',
  marcos: 'm',
};

const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Devuelve 'm' | 'f' | null según lo que se pueda saber del nombre de la voz. */
function voiceGender(v: SpeechSynthesisVoice): 'm' | 'f' | null {
  const name = stripAccents(v.name);
  for (const key in KNOWN_GENDER) if (name.includes(key)) return KNOWN_GENDER[key];
  // Las voces web de Google en español ("Google español"…) son femeninas.
  if (name.includes('google') && name.includes('espanol')) return 'f';
  if (/\bfemale\b|femenin|mujer/.test(name)) return 'f';
  if (/\bmale\b|masculin|hombre/.test(name)) return 'm';
  return null;
}

interface VoicePick {
  m: SpeechSynthesisVoice | null;
  f: SpeechSynthesisVoice | null;
  /** Género REAL de la voz que quedó para cada uno (para ajustar el tono). */
  mGender: 'm' | 'f' | null;
  fGender: 'm' | 'f' | null;
}
let chosen: VoicePick | null = null;

/**
 * Elige voz para hombre y para mujer. Prioriza una voz del género correcto; si
 * el sistema no tiene voz de un género (Chrome de escritorio suele traer solo
 * femeninas), reusa la que haya y guarda su género real, para que el tono la
 * corrija bien fuerte. Así NUNCA queda al revés.
 */
function pickVoices(): VoicePick {
  const none: VoicePick = { m: null, f: null, mGender: null, fGender: null };
  if (typeof window === 'undefined' || !window.speechSynthesis) return none;
  if (chosen) return chosen;

  const all = window.speechSynthesis.getVoices();
  const es = all.filter((v) => v.lang?.toLowerCase().startsWith('es'));
  const pool = es.length ? es : all;
  if (pool.length === 0) return none;

  // Calidad: neurales/de red suenan mucho mejor que las locales robóticas.
  const quality = (v: SpeechSynthesisVoice) => {
    let s = 0;
    if (/natural|neural|online|premium|enhanced/i.test(v.name)) s -= 5;
    if (!v.localService) s -= 2;
    if (/google/i.test(v.name)) s -= 1;
    return s;
  };
  const locale = (v: SpeechSynthesisVoice) =>
    /es[-_]AR/i.test(v.lang) ? 0 : /es[-_](419|MX|US)/i.test(v.lang) ? 1 : 2;
  const sorted = [...pool].sort((a, b) => locale(a) - locale(b) || quality(a) - quality(b));

  const realF = sorted.find((v) => voiceGender(v) === 'f') ?? null;
  const realM = sorted.find((v) => voiceGender(v) === 'm') ?? null;
  const base = sorted[0] ?? null; // mejor voz disponible como comodín

  const f = realF ?? base;
  const m = realM ?? realF ?? base; // sin masculina: uso la que haya y el tono la baja

  chosen = {
    m,
    f,
    mGender: m ? voiceGender(m) : null,
    fGender: f ? voiceGender(f) : null,
  };
  return chosen;
}

/**
 * Habla el texto con la voz indicada. Quita los emojis (no se leen) y limita el
 * largo. Descarta si hay demasiado en cola, para no acumular.
 */
export function speakBot(text: string, gender: 'm' | 'f', persona?: string) {
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

  synth.speak(buildUtterance(clean, gender, vol, persona));
}

/**
 * Carácter de voz por bot (sobre la base de su género): un desvío de tono y de
 * velocidad para que cada uno suene como un individuo y no como "genérico
 * hombre/mujer". Los desvíos son chicos a propósito: dan personalidad sin cruzar
 * el género (y además hay un tope de seguridad más abajo).
 */
const VOICE_PROFILES: Record<string, { dPitch: number; dRate: number }> = {
  // Hombres
  Beto: { dPitch: -0.1, dRate: -0.1 }, // resongón: grave, lento, arrastrado
  Hugo: { dPitch: -0.05, dRate: -0.07 }, // pesimista: apagado, monótono
  Fito: { dPitch: 0.03, dRate: -0.02 }, // tranqui: medio, relajado
  // Mujeres
  Carla: { dPitch: 0.05, dRate: -0.07 }, // amorosa: cálida, suave
  Elsa: { dPitch: 0.15, dRate: 0.15 }, // dramática: aguda, rápida, exagerada
  Gaby: { dPitch: 0.1, dRate: 0.1 }, // risueña: saltarina
  Dani: { dPitch: -0.02, dRate: 0.06 }, // canchera: ágil, con soltura
  Ana: { dPitch: 0.03, dRate: -0.12 }, // coqueta: lenta, insinuante
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Arma la locución con la voz y el tono del género, más el carácter del bot. */
function buildUtterance(
  text: string,
  gender: 'm' | 'f',
  vol: number,
  persona?: string
): SpeechSynthesisUtterance {
  const picks = pickVoices();
  const voice = gender === 'f' ? picks.f : picks.m;
  const voiceGen = gender === 'f' ? picks.fGender : picks.mGender;

  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'es-AR';

  // Base según cuánto haya que "corregir" la voz asignada:
  //  - si ya es del género correcto, apenas un toque;
  //  - si es neutra/desconocida, un empujón;
  //  - si es del género opuesto (no había otra), se fuerza bien fuerte.
  let pitch: number;
  let rate: number;
  if (gender === 'f') {
    pitch = voiceGen === 'f' ? 1.12 : voiceGen === 'm' ? 1.6 : 1.32; // mujer: aguda
    rate = 1.04;
  } else {
    pitch = voiceGen === 'm' ? 0.9 : voiceGen === 'f' ? 0.5 : 0.62; // hombre: grave
    rate = voiceGen === 'm' ? 0.98 : 0.9; // voz de mujer forzada: más lento = más macho
  }

  // Carácter del bot.
  const prof = persona ? VOICE_PROFILES[persona] : undefined;
  if (prof) {
    pitch += prof.dPitch;
    rate += prof.dRate;
  }

  // Tope de seguridad: que el carácter no cruce el género.
  pitch = gender === 'm' ? clamp(pitch, 0.1, 1.0) : clamp(pitch, 1.05, 2);
  u.pitch = pitch;
  u.rate = clamp(rate, 0.6, 1.4);
  u.volume = vol > 0 ? vol : 0.9;
  return u;
}

/** Muestra de varias voces (dos hombres y dos mujeres) para oír la variedad. */
export function testVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const vol = getVolume('bots');
  const demo: [string, 'm' | 'f', string][] = [
    ['Uf, otra vez a jugar…', 'm', 'Beto'],
    ['Esto va a salir mal, ya lo sé.', 'm', 'Hugo'],
    ['¡Ay, qué nervios, no puedo!', 'f', 'Elsa'],
    ['Hola, guapo… ¿jugamos?', 'f', 'Ana'],
  ];
  for (const [t, g, p] of demo) synth.speak(buildUtterance(t, g, vol, p));
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
