'use client';

/**
 * Sonido sintetizado con Web Audio. No hay archivos de audio: todo se genera en
 * el navegador, así el repo no carga megas de assets y no hay que esperar
 * ninguna descarga para escuchar el primer naipe.
 *
 * Los navegadores no dejan sonar nada hasta que el usuario interactúa, por eso
 * el contexto se crea recién en el primer gesto (ver `unlockAudio`).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;

const PREFS = { sfx: 'basas:sfx', music: 'basas:music' };

export function prefEnabled(kind: 'sfx' | 'music'): boolean {
  try {
    // Los efectos vienen activados; la música, apagada (es más invasiva).
    return (localStorage.getItem(PREFS[kind]) ?? (kind === 'sfx' ? '1' : '0')) === '1';
  } catch {
    return kind === 'sfx';
  }
}

export function setPref(kind: 'sfx' | 'music', on: boolean) {
  try {
    localStorage.setItem(PREFS[kind], on ? '1' : '0');
  } catch {
    /* sin storage, vale solo para esta sesión */
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Llamar desde cualquier click: destraba el audio en navegadores modernos. */
export function unlockAudio() {
  audio();
}

/* ------------------------------------------------------------------ */
/* Efectos                                                             */
/* ------------------------------------------------------------------ */

/** Ráfaga corta de ruido filtrado: el "fsst" del naipe al deslizarse. */
function noiseBurst(duration: number, freq: number, gainValue: number) {
  const ac = audio();
  if (!ac || !master || !prefEnabled('sfx')) return;

  const frames = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Ruido blanco con caída exponencial: suena a roce, no a zumbido.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2.5);
  }

  const src = ac.createBufferSource();
  src.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 0.8;

  const gain = ac.createGain();
  gain.gain.value = gainValue;

  src.connect(filter).connect(gain).connect(master);
  src.start();
  src.stop(ac.currentTime + duration);
}

function tone(freq: number, duration: number, gainValue: number, type: OscillatorType = 'sine', delay = 0) {
  const ac = audio();
  if (!ac || !master || !prefEnabled('sfx')) return;

  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Tirar una carta a la mesa. */
export function sndPlayCard() {
  noiseBurst(0.13, 1800, 0.35);
  tone(220, 0.08, 0.06, 'triangle');
}

/** Reparto: varias cartas seguidas. */
export function sndDeal() {
  for (let i = 0; i < 5; i++) {
    setTimeout(() => noiseBurst(0.1, 2200, 0.22), i * 85);
  }
}

/** Alguien se llevó la baza: las cartas se recogen. */
export function sndTrickWon() {
  noiseBurst(0.22, 900, 0.3);
  tone(523.25, 0.18, 0.05, 'sine', 0.04);
}

/** Confirmar la apuesta. */
export function sndBid() {
  tone(440, 0.1, 0.05, 'sine');
  tone(660, 0.12, 0.04, 'sine', 0.07);
}

/** Te toca jugar. */
export function sndYourTurn() {
  tone(880, 0.12, 0.05, 'sine');
  tone(1174.66, 0.16, 0.04, 'sine', 0.1);
}

/** Se acaba el tiempo: tic de aviso. */
export function sndTick() {
  tone(1200, 0.05, 0.035, 'square');
}

/** Fin de partida. */
export function sndFanfare() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.4, 0.06, 'triangle', i * 0.12));
}

/* ------------------------------------------------------------------ */
/* Música de fondo                                                     */
/* ------------------------------------------------------------------ */

// Escala pentatónica en La menor: cualquier combinación suena bien junta, así
// que se puede improvisar al azar sin que desafine nunca.
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
const BASS = [110, 130.81, 146.83, 164.81];

function pluck(freq: number, when: number, gainValue: number) {
  const ac = ctx;
  if (!ac || !musicGain) return;

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(gainValue, when + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);

  osc.connect(filter).connect(gain).connect(musicGain);
  osc.start(when);
  osc.stop(when + 2.5);
}

/**
 * Loop ambiental generativo: cada compás elige notas de la pentatónica al azar.
 * No se repite nunca igual y no cansa, que es lo que se busca de fondo.
 */
export function startMusic() {
  const ac = audio();
  if (!ac || !master || musicTimer) return;

  if (!musicGain) {
    musicGain = ac.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
  }
  // Entrada suave, para que no arranque de golpe.
  musicGain.gain.cancelScheduledValues(ac.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ac.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.16, ac.currentTime + 2);

  const bar = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    pluck(BASS[Math.floor(Math.random() * BASS.length)], t, 0.5);
    const notes = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < notes; i++) {
      pluck(SCALE[Math.floor(Math.random() * SCALE.length)], t + 0.6 + i * 0.85, 0.28);
    }
  };

  bar();
  musicTimer = setInterval(bar, 3400);
}

export function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  if (musicGain && ctx) {
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
  }
}
