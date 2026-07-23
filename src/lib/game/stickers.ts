/**
 * Catálogo de stickers que un jugador puede tirar en la mesa.
 *
 * Hay tres clases:
 *  - `emoji`: un emoji suelto, aparece grande sobre tu asiento.
 *  - `svg`:   una carita animada original (se dibuja en AnimatedEmote.tsx).
 *  - `video`: un clip propio que dejes en /public/emotes/<id>.mp4. Si el
 *             archivo no está, el sticker no se ofrece. NO se versionan clips
 *             con derechos de autor en el repo.
 */
export type StickerKind = 'emoji' | 'svg' | 'video';

export interface Sticker {
  id: string;
  kind: StickerKind;
  label: string;
  /** Para `emoji`, el caracter. Para `video`, la ruta del clip. */
  glyph?: string;
  /** Sonido sintetizado asociado (ver audio.ts). null = sin sonido. */
  sound: 'laugh' | 'aww' | 'angry' | 'wow' | 'clap' | 'wave' | 'boo' | null;
}

export const STICKERS: Sticker[] = [
  // Animados originales
  { id: 'risa-trebol', kind: 'svg', label: 'Risa trébol', sound: 'laugh' },
  { id: 'risa-pica', kind: 'svg', label: 'Risa pica', sound: 'laugh' },
  { id: 'enojo', kind: 'svg', label: 'Enojo', sound: 'angry' },
  { id: 'saludo', kind: 'svg', label: 'Saludo', sound: 'wave' },
  { id: 'sorpresa', kind: 'svg', label: 'Sorpresa', sound: 'wow' },
  { id: 'aplauso', kind: 'svg', label: 'Aplauso', sound: 'clap' },
  // Emojis rápidos
  { id: 'e-risa', kind: 'emoji', label: 'Risa', glyph: '😂', sound: 'laugh' },
  { id: 'e-pensando', kind: 'emoji', label: 'Pensando', glyph: '🤔', sound: null },
  { id: 'e-fuego', kind: 'emoji', label: 'Fuego', glyph: '🔥', sound: null },
  { id: 'e-calavera', kind: 'emoji', label: 'Muerto', glyph: '💀', sound: 'boo' },
  { id: 'e-ojos', kind: 'emoji', label: 'Atento', glyph: '👀', sound: null },
  { id: 'e-corona', kind: 'emoji', label: 'Rey', glyph: '👑', sound: null },
];

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

export function getSticker(id: string): Sticker | undefined {
  return BY_ID.get(id);
}

export function isValidSticker(id: string): boolean {
  return BY_ID.has(id);
}
