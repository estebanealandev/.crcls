import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  compressHTML: true,
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'de', 'pt'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
