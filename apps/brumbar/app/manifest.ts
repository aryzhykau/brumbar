import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Брумбар — лист персонажа',
    short_name: 'Брумбар',
    description: 'Мобильный игровой помощник для персонажа D&D.',
    start_url: './',
    display: 'standalone',
    background_color: '#0e0f0f',
    theme_color: '#0e0f0f',
    orientation: 'portrait',
    lang: 'ru',
  };
}
