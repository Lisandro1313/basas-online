'use client';

import { getSticker } from '@/lib/game/stickers';

/**
 * Dibuja un sticker: emoji suelto, carita animada original (SVG), o un clip de
 * video propio dejado en /public/emotes/<id>.mp4. Todo dentro de un círculo.
 */
export function AnimatedEmote({ id, size = 56 }: { id: string; size?: number }) {
  // Emote de video propio: `url:https://res.cloudinary.com/...`
  if (id.startsWith('url:')) {
    return (
      <span
        className="inline-block overflow-hidden rounded-full ring-2 ring-white/60"
        style={{ width: size, height: size }}
      >
        <video
          src={id.slice(4)}
          autoPlay
          loop
          playsInline
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  const sticker = getSticker(id);
  if (!sticker) return null;

  if (sticker.kind === 'emoji') {
    return (
      <span
        className="emote-bob inline-flex items-center justify-center"
        style={{ fontSize: size * 0.8, lineHeight: 1 }}
      >
        {sticker.glyph}
      </span>
    );
  }

  if (sticker.kind === 'video') {
    // El clip lo pone el usuario en su copia; si no está, no molesta.
    return (
      <span
        className="inline-block overflow-hidden rounded-full ring-2 ring-white/60"
        style={{ width: size, height: size }}
      >
        <video
          src={`/emotes/${id}.mp4`}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return <EmoteSvg id={id} size={size} />;
}

/* Caritas animadas originales, dibujadas a mano en SVG. */
function EmoteSvg({ id, size }: { id: string; size: number }) {
  const common = { width: size, height: size, viewBox: '0 0 100 100' };

  switch (id) {
    case 'risa-trebol':
      return (
        <svg {...common} className="emote-giggle">
          <SuitClover />
          <LaughFace />
        </svg>
      );

    case 'risa-pica':
      return (
        <svg {...common} className="emote-giggle">
          <SuitSpade />
          <LaughFace dark />
        </svg>
      );

    case 'enojo':
      return (
        <svg {...common} className="emote-shake">
          <circle cx="50" cy="52" r="34" fill="#ef4444" />
          <circle cx="50" cy="52" r="34" fill="none" stroke="#991b1b" strokeWidth="3" />
          {/* cejas fruncidas */}
          <path d="M28 40 L44 48" stroke="#7f1d1d" strokeWidth="5" strokeLinecap="round" />
          <path d="M72 40 L56 48" stroke="#7f1d1d" strokeWidth="5" strokeLinecap="round" />
          <circle cx="39" cy="54" r="4" fill="#1f2937" />
          <circle cx="61" cy="54" r="4" fill="#1f2937" />
          {/* boca enojada */}
          <path d="M38 72 Q50 64 62 72" stroke="#1f2937" strokeWidth="4" fill="none" strokeLinecap="round" />
          {/* vena de enojo */}
          <path d="M70 30 l6 -4 l-2 6 l6 -2 l-4 6" stroke="#dc2626" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      );

    case 'saludo':
      return (
        <svg {...common}>
          <circle cx="50" cy="54" r="32" fill="#fbbf24" />
          <circle cx="41" cy="50" r="4" fill="#1f2937" />
          <circle cx="59" cy="50" r="4" fill="#1f2937" />
          <path d="M38 64 Q50 74 62 64" stroke="#1f2937" strokeWidth="4" fill="none" strokeLinecap="round" />
          {/* mano que saluda */}
          <g className="emote-wave">
            <path
              d="M74 34 q6 -10 12 -6 q4 -8 8 -2 q6 -4 6 4 l-4 16 q-2 8 -12 8 q-10 0 -12 -8 z"
              fill="#fbbf24"
              stroke="#d97706"
              strokeWidth="2"
            />
          </g>
        </svg>
      );

    case 'sorpresa':
      return (
        <svg {...common} className="emote-bob">
          <circle cx="50" cy="52" r="34" fill="#38bdf8" />
          <circle cx="40" cy="46" r="7" fill="#fff" />
          <circle cx="60" cy="46" r="7" fill="#fff" />
          <circle cx="40" cy="47" r="3.5" fill="#0f172a" />
          <circle cx="60" cy="47" r="3.5" fill="#0f172a" />
          {/* boca abierta de sorpresa */}
          <ellipse cx="50" cy="70" rx="9" ry="12" fill="#0f172a" />
        </svg>
      );

    case 'aplauso':
      return (
        <svg {...common}>
          <g className="emote-shake">
            <path d="M30 40 l-8 22 q-2 8 6 10 l14 4" fill="#fbbf24" stroke="#d97706" strokeWidth="2" />
            <path d="M70 40 l8 22 q2 8 -6 10 l-14 4" fill="#fde68a" stroke="#d97706" strokeWidth="2" />
          </g>
          {/* rayitas de aplauso */}
          <path d="M48 30 l0 -10 M36 34 l-6 -8 M64 34 l6 -8" stroke="#fde047" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );

    default:
      return null;
  }
}

/* Piezas reutilizables */
function SuitClover() {
  return (
    <g>
      <circle cx="50" cy="34" r="16" fill="#16a34a" />
      <circle cx="34" cy="52" r="16" fill="#16a34a" />
      <circle cx="66" cy="52" r="16" fill="#16a34a" />
      <path d="M46 56 L54 56 L57 82 L43 82 Z" fill="#15803d" />
    </g>
  );
}

function SuitSpade() {
  return (
    <g>
      <path d="M50 16 C30 40 20 48 20 62 a14 14 0 0 0 26 6 L44 84 L56 84 L54 74 a14 14 0 0 0 26 -12 C80 48 70 40 50 16 Z" fill="#1f2937" />
    </g>
  );
}

/* Cara riéndose: ojos ^^ y boca abierta. */
function LaughFace({ dark = false }: { dark?: boolean }) {
  const ink = dark ? '#f8fafc' : '#0f172a';
  const mouth = dark ? '#f8fafc' : '#0f172a';
  return (
    <g>
      <path d="M38 46 q4 -6 8 0" stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M54 46 q4 -6 8 0" stroke={ink} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M40 56 q10 12 20 0 q-10 4 -20 0 Z" fill={mouth} />
    </g>
  );
}
