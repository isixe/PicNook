<script setup lang="ts">
import { Crop, Download, Loader2, RefreshCw } from '@lucide/vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolPageHeader from '@/components/layout/ToolPageHeader.vue';
import ImageDropzone from '@/components/tools/ImageDropzone.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Select from '@/components/ui/Select.vue';
import type { SelectOption } from '@/components/ui/Select.vue';
import { downloadBlob, fileBaseName } from '@/lib/download';
import { canvasToBlob, getContext, loadImage, nextFrame } from '@/lib/image';

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type Interaction =
  | { kind: 'move'; start: Point; base: CropRect }
  | { kind: 'resize'; handle: HandleId; start: Point; base: CropRect };

const PRESET_RATIOS = ['1:1', '4:3', '3:2', '16:9', '9:16', '3:4', '2:3'] as const;

/** Minimum crop edge (source px) while dragging; typed values may go lower. */
const MIN_SIZE = 16;

const HANDLES: ReadonlyArray<{ id: HandleId; class: string }> = [
  { id: 'nw', class: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
  { id: 'n', class: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize' },
  { id: 'ne', class: 'left-full top-0 -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
  { id: 'e', class: 'left-full top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize' },
  { id: 'se', class: 'left-full top-full -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
  { id: 's', class: 'left-1/2 top-full -translate-x-1/2 -translate-y-1/2 cursor-ns-resize' },
  { id: 'sw', class: 'left-0 top-full -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
  { id: 'w', class: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize' },
];

const { t } = useI18n();

const imgRef = ref<HTMLImageElement | null>(null);
const replaceInputRef = ref<HTMLInputElement | null>(null);

const sourceImage = ref<HTMLImageElement | null>(null);
const sourceUrl = ref('');
const sourceName = ref('');

const crop = ref<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
const ratioKey = ref('free');
const customRW = ref('');
const customRH = ref('');
const lastValidCustomRatio = ref<number | null>(null);

/**
 * Rect the custom-ratio fields fit against. Kept stable while the user types
 * the two fields so intermediate values (e.g. W filled before H) don't
 * compound shrink-only fits on top of each other.
 */
let customBaseline: CropRect | null = null;

const exporting = ref(false);
const errorMessage = ref('');

let interaction: Interaction | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function parsePositive(raw: string): number | null {
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function gcd(a: number, b: number): number {
  let x = Math.round(a);
  let y = Math.round(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

const ratio = computed<number | null>(() => resolveRatio(ratioKey.value));

const ratioOptions = computed<ReadonlyArray<SelectOption>>(() => [
  { value: 'free', label: t('tools.crop.free') },
  { value: 'original', label: t('tools.crop.original') },
  ...PRESET_RATIOS.map((preset) => ({ value: preset, label: preset })),
  { value: 'custom', label: t('tools.crop.custom') },
]);

const ratioError = computed(() => {
  if (ratioKey.value !== 'custom') return false;
  for (const raw of [customRW.value, customRH.value]) {
    const s = raw.trim();
    if (s === '') continue;
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return true;
  }
  return false;
});

const frameStyle = computed(() => {
  const img = sourceImage.value;
  if (!img || img.naturalWidth === 0) return {};
  const { x, y, w, h } = crop.value;
  return {
    left: `${(x / img.naturalWidth) * 100}%`,
    top: `${(y / img.naturalHeight) * 100}%`,
    width: `${(w / img.naturalWidth) * 100}%`,
    height: `${(h / img.naturalHeight) * 100}%`,
  };
});

const outputText = computed(() =>
  t('tools.crop.output', {
    width: Math.round(crop.value.w),
    height: Math.round(crop.value.h),
  }),
);

function resolveRatio(key: string): number | null {
  const img = sourceImage.value;
  if (key === 'free') return null;
  if (key === 'original') {
    return img && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null;
  }
  if (key === 'custom') return lastValidCustomRatio.value;
  const [w, h] = key.split(':').map(Number);
  return w > 0 && h > 0 ? w / h : null;
}

/** Predicted equal-ratio fit: keep the center, shrink-only, clamp to image. */
function fitFromRect(rect: CropRect, r: number): CropRect {
  const img = sourceImage.value;
  if (!img || !r || r <= 0) return rect;
  const { naturalWidth: nw, naturalHeight: nh } = img;
  if (rect.w <= 0 || rect.h <= 0) return rect;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let w = Math.min(rect.w, rect.h * r);
  let h = w / r;
  if (w > nw) {
    w = nw;
    h = w / r;
  }
  if (h > nh) {
    h = nh;
    w = h * r;
  }
  return {
    x: clamp(cx - w / 2, 0, nw - w),
    y: clamp(cy - h / 2, 0, nh - h),
    w,
    h,
  };
}

function applyRatioChange(r: number | null): void {
  if (!r || r <= 0) return;
  crop.value = fitFromRect(crop.value, r);
}

function fitRatioRect(r: number | null): CropRect {
  const img = sourceImage.value;
  if (!img) return { x: 0, y: 0, w: 0, h: 0 };
  const { naturalWidth: nw, naturalHeight: nh } = img;
  if (!r || r <= 0) return { x: 0, y: 0, w: nw, h: nh };
  let w = Math.min(nw, nh * r);
  let h = w / r;
  if (h > nh) {
    h = nh;
    w = h * r;
  }
  return { x: (nw - w) / 2, y: (nh - h) / 2, w, h };
}

/**
 * Ratio text like `16:9`. Uses the gcd-reduced form; when the reduced terms
 * exceed 99 it first tries a simple fraction (terms ≤ 99, within 0.5% error)
 * and otherwise falls back to the exact reduced `a:b`.
 */
function formatRatio(w: number, h: number): string {
  if (!(w > 0) || !(h > 0)) return '';
  const rw = Math.max(1, Math.round(w));
  const rh = Math.max(1, Math.round(h));
  const g = gcd(rw, rh);
  let a = rw / g;
  let b = rh / g;
  if (a > 99 || b > 99) {
    const r = rw / rh;
    let best: { a: number; b: number } | null = null;
    for (let db = 1; db <= 99; db += 1) {
      const da = Math.round(r * db);
      if (da < 1 || da > 99) continue;
      if (Math.abs(da / db - r) > r * 0.005) continue;
      if (!best || da + db < best.a + best.b) best = { a: da, b: db };
    }
    if (best) {
      a = best.a;
      b = best.b;
    }
  }
  return `${a}:${b}`;
}

function onRatioChange(value: string): void {
  ratioKey.value = value;
  if (value === 'custom') {
    const terms = formatRatio(crop.value.w, crop.value.h).split(':');
    customRW.value = terms[0] ?? '';
    customRH.value = terms[1] ?? '';
    lastValidCustomRatio.value = crop.value.h > 0 ? crop.value.w / crop.value.h : null;
    customBaseline = { ...crop.value };
  }
  applyRatioChange(resolveRatio(value));
}

/** Validate both ratio fields; when complete, apply the custom ratio live. */
function applyCustomRatio(): void {
  const w = parsePositive(customRW.value);
  const h = parsePositive(customRH.value);
  if (w === null || h === null) return;
  const r = w / h;
  lastValidCustomRatio.value = r;
  crop.value = fitFromRect(customBaseline ?? crop.value, r);
}

function onCustomRWInput(value: string): void {
  customRW.value = value;
  applyCustomRatio();
}

function onCustomRHInput(value: string): void {
  customRH.value = value;
  applyCustomRatio();
}

function setCropSize(size: { w?: number; h?: number }): void {
  const img = sourceImage.value;
  if (!img) return;
  const { naturalWidth: nw, naturalHeight: nh } = img;
  const r = ratio.value;
  let w = crop.value.w;
  let h = crop.value.h;
  if (size.w !== undefined) {
    w = clamp(size.w, 1, nw);
    if (r) {
      h = w / r;
      if (h > nh) {
        h = nh;
        w = h * r;
      }
    }
  }
  if (size.h !== undefined) {
    h = clamp(size.h, 1, nh);
    if (r) {
      w = h * r;
      if (w > nw) {
        w = nw;
        h = w / r;
      }
    }
  }
  crop.value = {
    x: clamp(crop.value.x, 0, nw - w),
    y: clamp(crop.value.y, 0, nh - h),
    w,
    h,
  };
  customBaseline = { ...crop.value };
}

function onWidthInput(value: string): void {
  const parsed = parsePositive(value);
  if (parsed !== null) setCropSize({ w: parsed });
}

function onHeightInput(value: string): void {
  const parsed = parsePositive(value);
  if (parsed !== null) setCropSize({ h: parsed });
}

/** Re-assign the rect so the size inputs resync after invalid typing. */
function syncSizeInputs(): void {
  crop.value = { ...crop.value };
}

function resetCropFrame(): void {
  const img = sourceImage.value;
  if (!img) return;
  crop.value = fitRatioRect(ratio.value);
  customBaseline = { ...crop.value };
}

function resetAll(): void {
  const img = sourceImage.value;
  ratioKey.value = 'free';
  customRW.value = '';
  customRH.value = '';
  lastValidCustomRatio.value = null;
  customBaseline = null;
  crop.value = img
    ? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }
    : { x: 0, y: 0, w: 0, h: 0 };
}

function toSourcePoint(event: PointerEvent): Point {
  const img = imgRef.value;
  const natural = sourceImage.value;
  if (!img || !natural) return { x: 0, y: 0 };
  const rect = img.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * natural.naturalWidth) / Math.max(1, rect.width),
    y: ((event.clientY - rect.top) * natural.naturalHeight) / Math.max(1, rect.height),
  };
}

function startMove(event: PointerEvent): void {
  if (!sourceImage.value) return;
  event.preventDefault();
  const point = toSourcePoint(event);
  interaction = { kind: 'move', start: point, base: { ...crop.value } };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', endInteraction);
  window.addEventListener('pointercancel', endInteraction);
}

function startResize(event: PointerEvent, handle: HandleId): void {
  if (!sourceImage.value) return;
  interaction = { kind: 'resize', handle, start: toSourcePoint(event), base: { ...crop.value } };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', endInteraction);
  window.addEventListener('pointercancel', endInteraction);
}

function endInteraction(): void {
  interaction = null;
  customBaseline = { ...crop.value };
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', endInteraction);
  window.removeEventListener('pointercancel', endInteraction);
}

function onPointerMove(event: PointerEvent): void {
  const img = sourceImage.value;
  if (!img || !interaction) return;
  const point = toSourcePoint(event);
  const { naturalWidth: nw, naturalHeight: nh } = img;
  if (interaction.kind === 'move') {
    const { base, start } = interaction;
    crop.value = {
      ...base,
      x: clamp(base.x + (point.x - start.x), 0, nw - base.w),
      y: clamp(base.y + (point.y - start.y), 0, nh - base.h),
    };
    return;
  }
  const r = ratio.value;
  crop.value =
    r === null
      ? resizeFree(interaction.base, interaction.handle, point, nw, nh)
      : resizeLocked(interaction.base, interaction.handle, point, r, nw, nh);
}

function resizeFree(base: CropRect, handle: HandleId, p: Point, nw: number, nh: number): CropRect {
  const minW = Math.min(MIN_SIZE, nw);
  const minH = Math.min(MIN_SIZE, nh);
  let left = base.x;
  let top = base.y;
  let right = base.x + base.w;
  let bottom = base.y + base.h;
  if (handle.includes('w')) left = Math.min(p.x, right - minW);
  if (handle.includes('e')) right = Math.max(p.x, left + minW);
  if (handle.includes('n')) top = Math.min(p.y, bottom - minH);
  if (handle.includes('s')) bottom = Math.max(p.y, top + minH);
  left = clamp(left, 0, nw);
  right = clamp(right, 0, nw);
  top = clamp(top, 0, nh);
  bottom = clamp(bottom, 0, nh);
  return {
    x: left,
    y: top,
    w: Math.max(right - left, 1),
    h: Math.max(bottom - top, 1),
  };
}

function resizeLocked(
  base: CropRect,
  handle: HandleId,
  p: Point,
  r: number,
  nw: number,
  nh: number,
): CropRect {
  const minW = Math.min(MIN_SIZE, nw);
  if (handle.length === 2) {
    return resizeLockedCorner(base, handle, p, r, nw, nh, minW);
  }
  return resizeLockedEdge(base, handle, p, r, nw, nh);
}

function resizeLockedCorner(
  base: CropRect,
  handle: HandleId,
  p: Point,
  r: number,
  nw: number,
  nh: number,
  minW: number,
): CropRect {
  const west = handle.includes('w');
  const north = handle.includes('n');
  const anchorX = west ? base.x + base.w : base.x;
  const anchorY = north ? base.y + base.h : base.y;
  const proposedW = west ? anchorX - p.x : p.x - anchorX;
  const proposedH = north ? anchorY - p.y : p.y - anchorY;
  const maxW = west ? anchorX : nw - anchorX;
  const maxH = north ? anchorY : nh - anchorY;
  const floor = Math.min(minW, maxW, maxH * r);
  const w = Math.min(Math.max(proposedW, proposedH * r, floor), maxW, maxH * r);
  const h = w / r;
  return {
    x: west ? anchorX - w : anchorX,
    y: north ? anchorY - h : anchorY,
    w,
    h,
  };
}

function resizeLockedEdge(
  base: CropRect,
  handle: HandleId,
  p: Point,
  r: number,
  nw: number,
  nh: number,
): CropRect {
  const centerX = base.x + base.w / 2;
  const centerY = base.y + base.h / 2;
  if (handle === 'e' || handle === 'w') {
    const maxW = handle === 'e' ? nw - base.x : base.x + base.w;
    const proposed = handle === 'e' ? p.x - base.x : base.x + base.w - p.x;
    const w = clamp(Math.min(proposed, maxW, nh * r), 1, maxW);
    const h = w / r;
    const x = handle === 'e' ? base.x : base.x + base.w - w;
    return { x, y: clamp(centerY - h / 2, 0, nh - h), w, h };
  }
  const maxH = handle === 's' ? nh - base.y : base.y + base.h;
  const proposed = handle === 's' ? p.y - base.y : base.y + base.h - p.y;
  const h = clamp(Math.min(proposed, maxH, nw / r), 1, maxH);
  const w = h * r;
  const y = handle === 's' ? base.y : base.y + base.h - h;
  return { x: clamp(centerX - w / 2, 0, nw - w), y, w, h };
}

async function onFile(file: File): Promise<void> {
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    sourceImage.value = img;
    sourceUrl.value = url;
    sourceName.value = file.name;
    errorMessage.value = '';
    crop.value = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    applyRatioChange(resolveRatio(ratioKey.value));
    customBaseline = { ...crop.value };
  } catch {
    URL.revokeObjectURL(url);
    errorMessage.value = t('common.invalidType');
  }
}

function openReplacePicker(): void {
  replaceInputRef.value?.click();
}

function onReplaceChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    errorMessage.value = t('common.invalidType');
    return;
  }
  void onFile(file);
}

async function download(): Promise<void> {
  const img = sourceImage.value;
  if (!img) return;
  exporting.value = true;
  try {
    await nextFrame();
    const { x, y, w, h } = crop.value;
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.max(1, Math.round(w));
    offscreen.height = Math.max(1, Math.round(h));
    const ctx = getContext(offscreen);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h, 0, 0, offscreen.width, offscreen.height);
    const blob = await canvasToBlob(offscreen);
    downloadBlob(blob, `${fileBaseName(sourceName.value)}-crop.png`);
  } finally {
    exporting.value = false;
  }
}

onBeforeUnmount(() => {
  endInteraction();
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
  }
});
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-8">
    <ToolPageHeader :title="t('tools.crop.title')" :description="t('tools.crop.desc')" :icon="Crop">
      <Button variant="outline" :disabled="!sourceImage" @click="resetAll">
        <RefreshCw />
        {{ t('common.reset') }}
      </Button>
      <Button :disabled="exporting || !sourceImage" @click="download">
        <Loader2 v-if="exporting" class="animate-spin" />
        <Download v-else />
        {{ t('common.download') }}
      </Button>
    </ToolPageHeader>

    <p v-if="errorMessage" class="mb-4 text-sm font-medium text-destructive">
      {{ errorMessage }}
    </p>

    <ImageDropzone v-if="!sourceUrl" @file="onFile" />

    <div v-else class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <!-- Preview -->
      <div class="min-w-0">
        <Card class="overflow-hidden">
          <div class="flex min-h-[280px] items-center justify-center bg-muted/40 p-3">
            <div class="relative inline-block max-w-full">
              <img
                ref="imgRef"
                :src="sourceUrl"
                draggable="false"
                class="block max-h-[560px] w-auto max-w-full rounded shadow-sm"
                alt=""
              />
              <div
                class="absolute inset-0 touch-none select-none overflow-hidden"
                @contextmenu.prevent
              >
                <!-- Crop frame: move + mask outside -->
                <div
                  class="absolute cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/90"
                  :style="frameStyle"
                  @pointerdown="startMove"
                >
                  <!-- Rule of thirds -->
                  <div
                    class="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-white/40"
                  />
                  <div
                    class="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-white/40"
                  />
                  <div
                    class="pointer-events-none absolute left-0 top-1/3 h-px w-full bg-white/40"
                  />
                  <div
                    class="pointer-events-none absolute left-0 top-2/3 h-px w-full bg-white/40"
                  />

                  <!-- Resize handles -->
                  <div
                    v-for="h in HANDLES"
                    :key="h.id"
                    :class="[
                      'absolute z-10 bg-white shadow ring-1 ring-black/40 transition-colors hover:bg-primary',
                      h.class,
                      h.id.length === 2
                        ? 'h-3.5 w-3.5 rounded-md'
                        : h.id === 'n' || h.id === 's'
                          ? 'h-2 w-7 rounded-md'
                          : 'h-7 w-2 rounded-md',
                    ]"
                    @pointerdown.stop.prevent="startResize($event, h.id)"
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3 border-t p-3">
            <p class="min-w-0 truncate text-xs text-muted-foreground">
              {{ sourceName }}
            </p>
            <Button variant="ghost" size="sm" @click="openReplacePicker">
              <RefreshCw />
              {{ t('common.replace') }}
            </Button>
          </div>
        </Card>
        <input
          ref="replaceInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onReplaceChange"
        />
      </div>

      <!-- Controls -->
      <div class="h-fit space-y-4 lg:sticky lg:top-4">
        <Card class="p-4">
          <h3 class="mb-4 text-sm font-semibold">
            {{ t('tools.crop.ratioTitle') }}
          </h3>
          <Select
            :model-value="ratioKey"
            :options="ratioOptions"
            @update:model-value="onRatioChange"
          />

          <div v-if="ratioKey === 'custom'" class="mt-3">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <Label class="mb-1.5 block">
                  {{ t('tools.crop.ratioWidthLabel') }}
                </Label>
                <Input
                  :model-value="customRW"
                  type="number"
                  min="1"
                  placeholder="16"
                  :aria-label="t('tools.crop.ratioWidthLabel')"
                  @update:model-value="onCustomRWInput"
                />
              </div>
              <div>
                <Label class="mb-1.5 block">
                  {{ t('tools.crop.ratioHeightLabel') }}
                </Label>
                <Input
                  :model-value="customRH"
                  type="number"
                  min="1"
                  placeholder="9"
                  :aria-label="t('tools.crop.ratioHeightLabel')"
                  @update:model-value="onCustomRHInput"
                />
              </div>
            </div>
            <p v-if="ratioError" class="mt-2 text-xs text-destructive">
              {{ t('tools.crop.invalidRatio') }}
            </p>
          </div>

          <p class="mt-4 text-xs text-muted-foreground">
            {{ t('tools.crop.hint') }}
          </p>
        </Card>

        <Card class="p-4">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              {{ t('tools.crop.sizeTitle') }}
            </h3>
            <Button variant="ghost" size="sm" @click="resetCropFrame">
              {{ t('common.reset') }}
            </Button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <Label class="mb-1.5 block">{{ t('tools.crop.widthLabel') }}</Label>
              <Input
                :model-value="String(Math.round(crop.w))"
                type="number"
                min="1"
                :aria-label="t('tools.crop.widthLabel')"
                @update:model-value="onWidthInput"
                @blur="syncSizeInputs"
              />
            </div>
            <div>
              <Label class="mb-1.5 block">{{ t('tools.crop.heightLabel') }}</Label>
              <Input
                :model-value="String(Math.round(crop.h))"
                type="number"
                min="1"
                :aria-label="t('tools.crop.heightLabel')"
                @update:model-value="onHeightInput"
                @blur="syncSizeInputs"
              />
            </div>
          </div>

          <p class="mt-3 text-xs tabular-nums text-muted-foreground">
            {{ outputText }}
          </p>
        </Card>
      </div>
    </div>
  </div>
</template>
