'use client';

/**
 * Sonido de cartas sintetizado con Web Audio.
 *
 * La clave para que no suene a 8 bits: una carta real no produce un tono, sino
 * ruido de banda ancha con ataque instantáneo y caída de decenas de
 * milisegundos. Por eso acá casi no hay osciladores; casi todo sale de buffers
 * de ruido pasados por filtros con envolvente de frecuencia.
 *
 * Todo se enruta además por una reverb corta (impulso generado, sin archivos):
 * un sonido totalmente seco delata que es sintético, una cola de sala de 200 ms
 * lo vuelve creíble.
 *
 * Si preferís samples reales, dejá los archivos en `public/sounds/` con estos
 * nombres y se usan en lugar de la síntesis, sin tocar código:
 *   card-play.mp3, card-deal.mp3, trick-won.mp3, bid.mp3, your-turn.mp3, tick.mp3
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let dry: GainNode | null = null;
let wet: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;

const PREFS = { sfx: 'basas:sfx', music: 'basas:music' };

export function prefEnabled(kind: 'sfx' | 'music'): boolean {
  try {
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

/** Impulso de sala pequeña: ruido que decae. Da la cola de reverb. */
function buildImpulse(ac: AudioContext): AudioBuffer {
  const seconds = 0.35;
  const frames = Math.floor(ac.sampleRate * seconds);
  const impulse = ac.createBuffer(2, frames, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 3.2);
    }
  }
  return impulse;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = buildImpulse(ctx);

    dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(master);

    wet = ctx.createGain();
    wet.gain.value = 0.22; // apenas un ambiente, no una catedral
    wet.connect(reverb).connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Llamar desde cualquier click: destraba el audio en navegadores modernos. */
export function unlockAudio() {
  audio();
}

/* ------------------------------------------------------------------ */
/* Samples opcionales                                                  */
/* ------------------------------------------------------------------ */

const SAMPLES: Record<string, string> = {
  play: '/sounds/card-play.mp3',
  deal: '/sounds/card-deal.mp3',
  trick: '/sounds/trick-won.mp3',
  bid: '/sounds/bid.mp3',
  turn: '/sounds/your-turn.mp3',
  tick: '/sounds/tick.mp3',
};

const loaded: Record<string, AudioBuffer | null> = {};

/** Intenta cargar un sample. Si no está, devuelve null y se usa la síntesis. */
async function sample(name: string): Promise<AudioBuffer | null> {
  const ac = audio();
  if (!ac || !SAMPLES[name]) return null;
  if (name in loaded) return loaded[name];

  loaded[name] = null; // marca "en curso" para no pedirlo dos veces
  try {
    const res = await fetch(SAMPLES[name]);
    if (!res.ok) return null;
    const buf = await ac.decodeAudioData(await res.arrayBuffer());
    loaded[name] = buf;
    return buf;
  } catch {
    return null;
  }
}

function playSample(buffer: AudioBuffer, gainValue = 0.8) {
  const ac = audio();
  if (!ac || !dry || !wet) return;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.value = gainValue;
  src.connect(gain);
  gain.connect(dry);
  gain.connect(wet);
  src.start();
}

/** Si hay sample lo usa; si no, ejecuta la síntesis. */
function emit(name: string, synth: () => void) {
  if (!prefEnabled('sfx')) return;
  const cached = loaded[name];
  if (cached) {
    playSample(cached);
    return;
  }
  synth();
  void sample(name); // queda listo para la próxima vez
}

/* ------------------------------------------------------------------ */
/* Ladrillos de síntesis                                               */
/* ------------------------------------------------------------------ */

let noiseCache: AudioBuffer | null = null;

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noiseCache) return noiseCache;
  const frames = ac.sampleRate * 2;
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  noiseCache = buffer;
  return buffer;
}

interface NoiseOpts {
  when?: number;
  duration: number;
  /** Frecuencia del filtro al inicio y al final: el barrido da el "swish". */
  from: number;
  to: number;
  type?: BiquadFilterType;
  q?: number;
  gain: number;
  /** Curva de caída: más alto, más seco y percusivo. */
  curve?: number;
}

function noise({ when = 0, duration, from, to, type = 'bandpass', q = 1, gain, curve = 3 }: NoiseOpts) {
  const ac = audio();
  if (!ac || !dry || !wet) return;

  const start = ac.currentTime + when;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;

  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), start + duration);

  const env = ac.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.004); // ataque casi instantáneo
  env.gain.setValueAtTime(gain, start + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  src.connect(filter).connect(env);
  env.connect(dry);
  env.connect(wet);
  src.start(start);
  src.stop(start + duration + 0.05);
  void curve;
}

/** Golpe grave y corto: la carta apoyando sobre el paño. */
function thud(when: number, gain: number) {
  noise({ when, duration: 0.09, from: 420, to: 90, type: 'lowpass', q: 0.7, gain });
}

/* ------------------------------------------------------------------ */
/* Efectos                                                             */
/* ------------------------------------------------------------------ */

/** Tirar una carta: roce agudo que baja, más el golpe sobre la mesa. */
export function sndPlayCard() {
  emit('play', () => {
    noise({ duration: 0.075, from: 7000, to: 1600, q: 0.9, gain: 0.4 });
    thud(0.02, 0.34);
  });
}

/** Reparto: varias cartas seguidas, con ritmo irregular como en la vida real. */
export function sndDeal() {
  emit('deal', () => {
    let t = 0;
    for (let i = 0; i < 6; i++) {
      noise({ when: t, duration: 0.06, from: 6500 + Math.random() * 2000, to: 1800, q: 1, gain: 0.26 });
      thud(t + 0.015, 0.2);
      t += 0.075 + Math.random() * 0.045;
    }
  });
}

/** Baza ganada: las cartas se recogen y arrastran sobre el paño. */
export function sndTrickWon() {
  emit('trick', () => {
    noise({ duration: 0.3, from: 3000, to: 700, q: 0.5, gain: 0.3 });
    for (let i = 0; i < 3; i++) {
      noise({ when: 0.05 + i * 0.055, duration: 0.07, from: 5000, to: 1400, q: 1, gain: 0.18 });
    }
  });
}

/** Apostar: fichas de póker, dos golpecitos secos y resonantes. */
export function sndBid() {
  emit('bid', () => {
    for (let i = 0; i < 2; i++) {
      noise({
        when: i * 0.055,
        duration: 0.06,
        from: 2600 + Math.random() * 900,
        to: 1100,
        q: 5,
        gain: 0.25,
      });
    }
  });
}

/**
 * Te toca: doble golpe de nudillo sobre la mesa, como cuando alguien te avisa
 * en la mesa de verdad. Va más fuerte que el resto porque es el aviso que no
 * te podés perder.
 */
export function sndYourTurn() {
  emit('turn', () => {
    for (const when of [0, 0.13]) {
      noise({ when, duration: 0.12, from: 950, to: 250, type: 'lowpass', q: 3, gain: 0.55 });
      noise({ when: when + 0.005, duration: 0.045, from: 2600, to: 1400, q: 3, gain: 0.2 });
    }
  });
}

/** Últimos segundos: click de madera, seco y bajito. */
export function sndTick() {
  emit('tick', () => {
    noise({ duration: 0.035, from: 2000, to: 1200, q: 7, gain: 0.14 });
  });
}

/** Fin de partida: barrida de fichas. */
export function sndFanfare() {
  if (!prefEnabled('sfx')) return;
  for (let i = 0; i < 9; i++) {
    noise({
      when: i * 0.045,
      duration: 0.09,
      from: 2200 + Math.random() * 1600,
      to: 900,
      q: 4.5,
      gain: 0.2,
    });
  }
  noise({ when: 0.42, duration: 0.5, from: 2600, to: 500, q: 0.5, gain: 0.22 });
}

/* ------------------------------------------------------------------ */
/* Stickers                                                            */
/* ------------------------------------------------------------------ */

function blip(freq: number, when: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const ac = audio();
  if (!ac || !dry || !wet || !prefEnabled('sfx')) return;
  const start = ac.currentTime + when;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(dry);
  g.connect(wet);
  osc.start(start);
  osc.stop(start + dur + 0.02);
  return osc;
}

/** Reproduce el sonido de un sticker. Los nombres coinciden con Sticker.sound. */
export function playStickerSound(sound: string | null) {
  if (!sound || !prefEnabled('sfx')) return;
  switch (sound) {
    case 'laugh': // "ja ja ja" en escalón descendente
      [660, 590, 520, 460].forEach((f, i) => blip(f, i * 0.11, 0.1, 0.11, 'triangle'));
      break;
    case 'aww':
      blip(520, 0, 0.5, 0.1, 'sine');
      blip(392, 0.12, 0.5, 0.09, 'sine');
      break;
    case 'angry':
      noise({ duration: 0.35, from: 300, to: 90, type: 'lowpass', q: 2, gain: 0.35 });
      blip(120, 0, 0.35, 0.12, 'sawtooth');
      break;
    case 'wow':
      blip(440, 0, 0.4, 0.12, 'sine')?.frequency.exponentialRampToValueAtTime(
        880,
        (ctx?.currentTime ?? 0) + 0.4
      );
      break;
    case 'clap':
      for (let i = 0; i < 4; i++) {
        noise({ when: i * 0.13, duration: 0.06, from: 3500, to: 1200, q: 1.5, gain: 0.3 });
      }
      break;
    case 'wave':
      blip(784, 0, 0.15, 0.1, 'sine');
      blip(988, 0.1, 0.2, 0.09, 'sine');
      break;
    case 'boo':
      blip(200, 0, 0.6, 0.13, 'sawtooth')?.frequency.exponentialRampToValueAtTime(
        90,
        (ctx?.currentTime ?? 0) + 0.6
      );
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Música de fondo                                                     */
/* ------------------------------------------------------------------ */

// Pentatónica de La menor: cualquier combinación suena bien, así que puede
// improvisar al azar sin desafinar nunca.
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
const BASS = [110, 130.81, 146.83, 164.81];

/**
 * Nota de cuerda pulsada. Tres osciladores levemente desafinados entre sí y un
 * lowpass que se cierra: eso es lo que separa una cuerda de un pitido de sine
 * pelado.
 */
function pluck(freq: number, when: number, gainValue: number) {
  const ac = ctx;
  if (!ac || !musicGain || !wet) return;

  const env = ac.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gainValue, when + 0.06);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 3);

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(2200, when);
  filter.frequency.exponentialRampToValueAtTime(600, when + 2.4);

  for (const detune of [-6, 0, 7]) {
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(when);
    osc.stop(when + 3.1);
  }

  filter.connect(env);
  env.connect(musicGain);
  env.connect(wet);
}

/** Loop ambiental generativo: no se repite nunca igual, así no cansa. */
export function startMusic() {
  const ac = audio();
  if (!ac || !master || musicTimer) return;

  if (!musicGain) {
    musicGain = ac.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
  }
  musicGain.gain.cancelScheduledValues(ac.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ac.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.13, ac.currentTime + 2.5);

  const bar = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    pluck(BASS[Math.floor(Math.random() * BASS.length)], t, 0.42);
    const notes = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < notes; i++) {
      pluck(SCALE[Math.floor(Math.random() * SCALE.length)], t + 0.7 + i * 0.95, 0.22);
    }
  };

  bar();
  musicTimer = setInterval(bar, 3800);
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
