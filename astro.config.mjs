import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

// The whole UI is a single Vue island (AppShell) rendered client-only,
// so vue-router / Pinia / vue-i18n all live in one app instance.
export default defineConfig({
  integrations: [vue({ appEntrypoint: '/src/plugins/vue-app' })],
});
