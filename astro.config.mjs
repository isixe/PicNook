import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

// The whole UI is a single Vue island (AppShell) rendered client-only,
// so vue-router / Pinia / vue-i18n all live in one app instance.
export default defineConfig({
  // Canonical production origin. Drives canonical URLs, sitemap.xml and
  // llms.txt; change this single value if the site ever moves.
  site: 'https://picnook.itea.dev/',
  integrations: [vue({ appEntrypoint: '/src/plugins/vue-app' })],
});
