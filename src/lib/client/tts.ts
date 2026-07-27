'use client';

/**
 * Lee en voz alta las frases de los bots con la voz del navegador
 * (SpeechSynthesis). No hay archivos ni API: es la síntesis del sistema.
 *
 * La diferencia hombre/mujer se logra ante todo con el tono (pitch): aunque el
 * navegador tenga una sola voz en español, un pitch más grave o más agudo la
 * vuelve claramente masculina o femenina.
 */

const PREF = 'basas:botvoices';

export function botVoicesOn(): boolean {
  try {
    return (localStorage.getItem(PREF) ?? '1') === '1'; // por defecto, prendidas
  } catch {
    return true;
  }
}

export function setBotVoices(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? '1' : '0');
  } catch {
    /* sin storage: vale solo esta sesión */
  }
}

let spanishVoice: SpeechSynthesisVoice | null = null;

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  if (spanishVoice) return spanishVoice;
  const voices = window.speechSynthesis.getVoices();
  spanishVoice =
    voices.find((v) => /es[-_]AR/i.test(v.lang)) ??
    voices.find((v) => /es[-_]419|es[-_]MX/i.test(v.lang)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('es')) ??
    null;
  return spanishVoice;
}

/**
 * Habla el texto con la voz indicada. Quita los emojis (no se leen) y limita el
 * largo. Descarta si hay demasiado en cola, para no acumular.
 */
export function speakBot(text: string, gender: 'm' | 'f') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  if (!botVoicesOn()) return;
  if (document.hidden) return; // no hablar en segundo plano

  const clean = text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .trim()
    .slice(0, 120);
  if (!clean) return;

  const synth = window.speechSynthesis;
  // Si ya hay varias frases esperando, no encolamos más (evita el "coro").
  if (synth.speaking && synth.pending) return;

  const u = new SpeechSynthesisUtterance(clean);
  const voice = pickSpanishVoice();
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'es-AR';
  // Mujer más agudo, hombre más grave, con una pizca de variación por bot.
  u.pitch = gender === 'f' ? 1.35 : 0.75;
  u.rate = 1.02;
  u.volume = 0.9;
  synth.speak(u);
}

/** Algunos navegadores cargan las voces async; forzamos el primer inventario. */
export function warmUpVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  pickSpanishVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    spanishVoice = null;
    pickSpanishVoice();
  };
}
