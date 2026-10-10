import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import { categories, tools } from '@/lib/tool-registry';

function resolveKey(messages: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((accumulator, segment) => {
    if (accumulator && typeof accumulator === 'object') {
      return (accumulator as Record<string, unknown>)[segment];
    }
    return undefined;
  }, messages);
  return typeof value === 'string' ? value : '';
}

export interface LocalizedText {
  title: string;
  description: string;
}

export interface SiteRoute {
  path: string;
  zh: LocalizedText;
  en: LocalizedText;
}

export interface SiteCategoryGroup {
  id: string;
  zh: string;
  en: string;
  routes: SiteRoute[];
}

export const siteInfo = {
  zh: {
    name: resolveKey(zhCN, 'shell.brand.title'),
    tagline: resolveKey(zhCN, 'shell.brand.subtitle'),
    description:
      '免费、隐私优先的在线图片工具箱：裁切、配色、缩放、画布边距、平铺水印与元数据清理，全部在浏览器本地处理。',
  },
  en: {
    name: resolveKey(en, 'shell.brand.title'),
    tagline: resolveKey(en, 'shell.brand.subtitle'),
    description:
      'A free, privacy-first online image toolbox: crop, recolor, resize, add canvas margins, watermark, and inspect or clean metadata — all processed locally in your browser.',
  },
} as const;

function toRoute(path: string, titleKey: string, descriptionKey: string): SiteRoute {
  return {
    path,
    zh: {
      title: resolveKey(zhCN, titleKey),
      description: resolveKey(zhCN, descriptionKey),
    },
    en: {
      title: resolveKey(en, titleKey),
      description: resolveKey(en, descriptionKey),
    },
  };
}

export const homeRoute: SiteRoute = {
  path: '/',
  zh: {
    title: `${siteInfo.zh.name} · ${siteInfo.en.name}`,
    description: siteInfo.zh.description,
  },
  en: {
    title: `${siteInfo.en.name} · ${siteInfo.zh.name}`,
    description: siteInfo.en.description,
  },
};

export function siteRoutes(): SiteRoute[] {
  return [homeRoute, ...tools.map((tool) => toRoute(tool.path, tool.titleKey, tool.descKey))];
}

export function siteCategoryGroups(): SiteCategoryGroup[] {
  return categories.map((category) => ({
    id: category.id,
    zh: resolveKey(zhCN, category.labelKey),
    en: resolveKey(en, category.labelKey),
    routes: tools
      .filter((tool) => tool.category === category.id)
      .map((tool) => toRoute(tool.path, tool.titleKey, tool.descKey)),
  }));
}
