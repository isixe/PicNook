import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';

// Guard for safety: with client:only islands this only ever runs in the
// browser, but keep the module importable during build-time SSR too.
const history =
  typeof window !== 'undefined'
    ? createWebHistory(import.meta.env.BASE_URL)
    : createMemoryHistory();

export const router = createRouter({
  history,
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/components/home/HomePage.vue'),
    },
    {
      path: '/tools/color-variants',
      name: 'color-variants',
      component: () => import('@/components/tools/color-variants/ColorVariantsTool.vue'),
    },
    {
      path: '/tools/color-overlay',
      name: 'color-overlay',
      component: () => import('@/components/tools/color-overlay/ColorOverlayTool.vue'),
    },
    {
      path: '/tools/crop',
      name: 'crop',
      component: () => import('@/components/tools/crop/ImageCropTool.vue'),
    },
    {
      path: '/tools/scale',
      name: 'scale',
      component: () => import('@/components/tools/scale/ScaleTool.vue'),
    },
    {
      path: '/tools/image-info',
      name: 'image-info',
      component: () => import('@/components/tools/image-info/ImageInfoTool.vue'),
    },
    {
      path: '/tools/canvas-margin',
      name: 'canvas-margin',
      component: () => import('@/components/tools/canvas-margin/CanvasMarginTool.vue'),
    },
    {
      path: '/tools/tiled-watermark',
      name: 'tiled-watermark',
      component: () => import('@/components/tools/tiled-watermark/TiledWatermarkTool.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
