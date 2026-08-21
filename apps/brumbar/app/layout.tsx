import type { Metadata, Viewport } from 'next';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Брумбар — лист персонажа',
  description: 'Мобильный игровой помощник для Брумбара Бочкобрюха.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  manifest: `${basePath}/manifest.webmanifest`,
  openGraph: {
    title: 'Брумбар “Бочкобрюх”',
    description: 'Мобильный лист персонажа для игры за столом.',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: `${basePath}/og.png`, width: 1731, height: 909, alt: 'Брумбар “Бочкобрюх” — мобильный лист персонажа' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Брумбар “Бочкобрюх”',
    description: 'Мобильный лист персонажа для игры за столом.',
    images: [`${basePath}/og.png`],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0e0f0f',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
