import type { App } from 'vue';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';
import { router } from '@/router';

export default (app: App): void => {
  app.use(createPinia());
  app.use(i18n);
  app.use(router);

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', i18n.global.locale.value);
  }
};
