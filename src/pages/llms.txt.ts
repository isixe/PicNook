import type { APIRoute } from 'astro';
import { homeRoute, siteCategoryGroups, siteInfo } from '@/lib/site-content';

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL(import.meta.env.SITE);

  const lines: string[] = [
    `# ${siteInfo.en.name} (${siteInfo.zh.name})`,
    '',
    `> ${siteInfo.en.description}`,
    `> ${siteInfo.zh.description}`,
    '',
    'All tools run entirely client-side in the browser — images are never uploaded. The interface is available in Simplified Chinese (zh-CN) and English (en).',
    '所有工具完全在浏览器本地运行，图片不会上传到任何服务器。界面支持简体中文（zh-CN）与英文（en）。',
    '',
    '## Pages / 页面',
    '',
    `- [Home / 首页](${new URL(homeRoute.path, origin).href}): ${homeRoute.en.description} / ${homeRoute.zh.description}`,
    '',
    '## Tools / 工具',
    '',
  ];

  for (const group of siteCategoryGroups()) {
    lines.push(`### ${group.en} / ${group.zh}`, '');
    for (const route of group.routes) {
      const url = new URL(route.path, origin).href;
      lines.push(
        `- [${route.en.title} / ${route.zh.title}](${url}): ${route.en.description} / ${route.zh.description}`,
      );
    }
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
