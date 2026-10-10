import type { Component } from 'vue';
import { Crop, Frame, Info, Layers, Palette, Scaling, Stamp } from '@lucide/vue';

export type ToolCategoryId = 'color' | 'layout' | 'info';

export interface CategoryDef {
  id: ToolCategoryId;
  labelKey: string;
}

export interface ToolDef {
  slug: string;
  path: string;
  category: ToolCategoryId;
  icon: Component;
  titleKey: string;
  descKey: string;
}

export const categories: ReadonlyArray<CategoryDef> = [
  { id: 'color', labelKey: 'shell.categories.color' },
  { id: 'layout', labelKey: 'shell.categories.layout' },
  { id: 'info', labelKey: 'shell.categories.info' },
];

export const tools: ReadonlyArray<ToolDef> = [
  {
    slug: 'color-variants',
    path: '/tools/color-variants',
    category: 'color',
    icon: Palette,
    titleKey: 'tools.colorVariants.title',
    descKey: 'tools.colorVariants.desc',
  },
  {
    slug: 'color-overlay',
    path: '/tools/color-overlay',
    category: 'color',
    icon: Layers,
    titleKey: 'tools.colorOverlay.title',
    descKey: 'tools.colorOverlay.desc',
  },
  {
    slug: 'crop',
    path: '/tools/crop',
    category: 'layout',
    icon: Crop,
    titleKey: 'tools.crop.title',
    descKey: 'tools.crop.desc',
  },
  {
    slug: 'scale',
    path: '/tools/scale',
    category: 'layout',
    icon: Scaling,
    titleKey: 'tools.scale.title',
    descKey: 'tools.scale.desc',
  },
  {
    slug: 'image-info',
    path: '/tools/image-info',
    category: 'info',
    icon: Info,
    titleKey: 'tools.imageInfo.title',
    descKey: 'tools.imageInfo.desc',
  },
  {
    slug: 'canvas-margin',
    path: '/tools/canvas-margin',
    category: 'layout',
    icon: Frame,
    titleKey: 'tools.canvasMargin.title',
    descKey: 'tools.canvasMargin.desc',
  },
  {
    slug: 'tiled-watermark',
    path: '/tools/tiled-watermark',
    category: 'layout',
    icon: Stamp,
    titleKey: 'tools.tiledWatermark.title',
    descKey: 'tools.tiledWatermark.desc',
  },
];

export function findToolBySlug(slug: string): ToolDef | undefined {
  return tools.find((tool) => tool.slug === slug);
}
