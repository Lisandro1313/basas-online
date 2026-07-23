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
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export function PlayingCard({ card, size = 'md', disabled, selected, onClick }: Props) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  const interactive = Boolean(onClick) && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={`${valueLabel(card.value)} de ${card.suit}`}
      className={[
        SIZES[size],
        'deal-in relative flex flex-col items-center justify-center rounded-lg border bg-white font-bold shadow-md transition',
        red ? 'text-rose-600' : 'text-slate-900',
        selected ? 'border-amber-400 ring-2 ring-amber-400' : 'border-slate-300',
        interactive
          ? 'cursor-pointer hover:-translate-y-2 hover:shadow-xl'
          : 'cursor-default',
        disabled && onClick ? 'opacity-40 saturate-50' : '',
      ].join(' ')}
    >
      <span className="absolute top-1 left-1.5 text-[0.65em] leading-none">
        {valueLabel(card.value)}
      </span>
      <span className="text-[1.6em] leading-none">{SUIT_SYMBOL[card.suit]}</span>
      <span className="absolute right-1.5 bottom-1 rotate-180 text-[0.65em] leading-none">
        {valueLabel(card.value)}
      </span>
    </button>
  );
}

export function CardBack({ size = 'sm' }: { size?: keyof typeof SIZES }) {
  return (
    <div
      className={`${SIZES[size]} rounded-lg border border-slate-700 bg-gradient-to-br from-indigo-800 to-indigo-950 shadow-md`}
    />
  );
}
