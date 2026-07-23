'use client';

interface Props {
  name: string;
  avatar: string | null;
  size?: number;
  /** Ocupa todo el contenedor (para escalar con container queries). */
  fluid?: boolean;
  className?: string;
}

/** Redondel del jugador: foto, emoji elegido, o la inicial del nombre. */
export function Avatar({ name, avatar, size = 40, fluid, className = '' }: Props) {
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ${className}`;
  // En modo fluido el tamaño lo pone el contenedor y el texto se mide en cqmin,
  // así escala junto con la mesa. Si no, usa los px de `size`.
  const style = fluid ? { width: '100%', height: '100%' } : { width: size, height: size };
  const glyphSize = fluid ? 'clamp(15px, 6.6cqmin, 33px)' : size * 0.55;
  const initialSize = fluid ? 'clamp(12px, 5cqmin, 25px)' : size * 0.42;

  if (avatar?.startsWith('emoji:')) {
    return (
      <span className={base} style={{ ...style, fontSize: glyphSize }}>
        {avatar.slice(6)}
      </span>
    );
  }

  if (avatar?.startsWith('data:image/')) {
    return (
      <span className={base} style={style}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className={`${base} font-bold text-white/70`} style={{ ...style, fontSize: initialSize }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
