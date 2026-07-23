'use client';

interface Props {
  name: string;
  avatar: string | null;
  size?: number;
  className?: string;
}

/** Redondel del jugador: foto, emoji elegido, o la inicial del nombre. */
export function Avatar({ name, avatar, size = 40, className = '' }: Props) {
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 ${className}`;
  const style = { width: size, height: size };

  if (avatar?.startsWith('emoji:')) {
    return (
      <span className={base} style={{ ...style, fontSize: size * 0.55 }}>
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
    <span
      className={`${base} font-bold text-white/70`}
      style={{ ...style, fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
