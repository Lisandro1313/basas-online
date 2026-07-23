'use client';

import { SUIT_SYMBOL, valueLabel } from '@/lib/game/cards';
import type { Card } from '@/lib/game/types';

const SIZES = {
  sm: 'w-10 h-14 text-sm',
  md: 'w-14 h-20 text-lg',
  lg: 'w-16 h-24 text-xl sm:w-20 sm:h-28 sm:text-2xl',
} as const;

interface Props {
  card: Card;
  size?: keyof typeof SIZES;
  /** Ocupa el ancho del contenedor (para escalar con container queries). */
  fluid?: boolean;
  disabled?: boolean;
  selected?: boolean;
  /** Resalta la carta como jugable ahora mismo. */
  glow?: boolean;
  onClick?: () => void;
}

export function PlayingCard({ card, size = 'md', fluid, disabled, selected, glow, onClick }: Props) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  const interactive = Boolean(onClick) && !disabled;

  // En modo fluido la carta llena el ancho del contenedor; el texto (en em) y
  // la relación de aspecto la siguen. El font-size va en cqmin para escalar.
  // El font va en cqw: 26% del ancho de la carta (su contenedor inline-size),
  // así todo lo interno (medido en em) escala con la carta.
  const fluidStyle = fluid
    ? { width: '100%', aspectRatio: '5 / 7', height: 'auto', fontSize: 'clamp(9px, 26cqw, 20px)' }
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={`${valueLabel(card.value)} de ${card.suit}`}
      style={fluidStyle}
      className={[
        fluid ? '' : SIZES[size],
        'deal-in relative flex flex-col items-center justify-center rounded-md border bg-linear-to-b from-white to-slate-100 font-bold shadow-lg transition',
        red ? 'text-rose-600' : 'text-slate-900',
        selected ? 'border-amber-400 ring-2 ring-amber-400' : 'border-slate-400/60',
        interactive
          ? 'cursor-pointer hover:-translate-y-2 hover:shadow-xl'
          : 'cursor-default',
        glow ? 'card-glow' : '',
        disabled && onClick ? 'opacity-40 saturate-50' : '',
      ].join(' ')}
    >
      <span className="absolute top-0.5 left-1 flex flex-col items-center leading-none">
        <span className="text-[0.95em] font-black">{valueLabel(card.value)}</span>
        <span className="text-[0.6em]">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="translate-x-[0.18em] translate-y-[0.12em] text-[1.75em] leading-none">
        {SUIT_SYMBOL[card.suit]}
      </span>
    </button>
  );
}

export function CardBack({ size = 'sm' }: { size?: keyof typeof SIZES }) {
  return (
    <div
      className={`${SIZES[size]} rounded-lg border border-slate-700 bg-linear-to-br from-indigo-800 to-indigo-950 shadow-md`}
    />
  );
}
