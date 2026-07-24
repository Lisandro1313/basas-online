import type { MetadataRoute } from 'next';

/**
 * Manifiesto PWA: permite instalar Basas como app en la PC y en el celular.
 * Next lo sirve en /manifest.webmanifest y lo enlaza solo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Basas Online',
    short_name: 'Basas',
    description: 'El juego de bazas con predicción, para jugar con amigos por internet.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b1310',
    theme_color: '#0f5132',
    lang: 'es-AR',
    categories: ['games'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
