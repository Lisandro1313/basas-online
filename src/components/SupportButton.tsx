'use client';

/**
 * Botón de propina/donación voluntaria al creador. Es un simple link a un "Link
 * de pago" de MercadoPago (donación de monto abierto): NO es una apuesta ni el
 * juego mueve plata: solo lleva al que quiere apoyar a la página de MercadoPago.
 *
 * La URL viene de NEXT_PUBLIC_TIP_URL (se configura en Vercel/.env.local), así
 * se cambia sin tocar código. Si no está configurada, el botón no aparece.
 */
export function SupportButton({ className = '' }: { className?: string }) {
  const url = process.env.NEXT_PUBLIC_TIP_URL;
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/15 ${className}`}
    >
      ☕ Apoyar el proyecto
    </a>
  );
}
