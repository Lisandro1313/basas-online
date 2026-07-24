import type { Metadata, Viewport } from 'next';
import { PwaSetup } from '@/components/PwaSetup';
import './globals.css';

export const metadata: Metadata = {
  title: 'Basas Online',
  description: 'El juego de bazas con predicción, para jugar con amigos por internet.',
  applicationName: 'Basas',
  appleWebApp: { capable: true, title: 'Basas', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0f5132',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
