import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

export type AppLocale = 'zh-CN' | 'en';

export const LOCALE_STORAGE_KEY = 'image-toolbox:locale';

export const SUPPORTED_LOCALES: ReadonlyArray<{ value: AppLocale; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

function initialLocale(): AppLocale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch {
    return 'zh-CN';
  }
  return 'zh-CN';
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    en,
  },
});

export function persistLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Best-effort persistence; locale simply resets next visit.
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale);
  }
}
