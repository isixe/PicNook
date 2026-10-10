<script setup lang="ts">
import { Download, Loader2, RefreshCw, Stamp, Upload, X } from '@lucide/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolPageHeader from '@/components/layout/ToolPageHeader.vue';
import ImageDropzone from '@/components/tools/ImageDropzone.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Slider from '@/components/ui/Slider.vue';
import { downloadBlob, fileBaseName } from '@/lib/download';
import { canvasToBlob, getContext, loadImage, nextFrame } from '@/lib/image';
import { cn } from '@/lib/utils';

type WatermarkMode = 'text' | 'image';

/** Max dimension (px) for the on-page preview canvas. */
const PREVIEW_MAX = 1280;

/** Base watermark size as a fraction of the image's shortest side (at 100% size). */
const TEXT_SIZE_RATIO = 0.055;
const IMAGE_SIZE_RATIO = 0.16;

/** Size slider range (%). 100% keeps the base ratio above. */
const SIZE_MIN = 0;
const SIZE_MAX = 200;

/** Spacing between tiles as a multiple of the watermark's largest side. */
const GAP_MAX_FACTOR = 3;
const GAP_MIN_FACTOR = 0.15;

const TEXT_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

interface ModeDefaults {
  size: number;
  density: number;
  opacity: number;
}

const HEX_DEFAULT = '#ffffff';
const ANGLE_DEFAULT = -30;

/** Default slider values per watermark type. */
const DEFAULTS: Record<WatermarkMode, ModeDefaults> = {
  text: { size: 60, density: 40, opacity: 50 },
  image: { size: 100, density: 50, opacity: 50 },
};

const { t } = useI18n();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const replaceInputRef = ref<HTMLInputElement | null>(null);
const watermarkInputRef = ref<HTMLInputElement | null>(null);

const sourceImage = ref<HTMLImageElement | null>(null);
const sourceUrl = ref('');
const sourceName = ref('');

const watermarkImage = ref<HTMLImageElement | null>(null);
const watermarkUrl = ref('');
const watermarkName = ref('');

const mode = ref<WatermarkMode>('text');
const text = ref(t('tools.tiledWatermark.defaultText'));
const hexInput = ref(HEX_DEFAULT);
const lastValidHex = ref(HEX_DEFAULT);
const size = ref(DEFAULTS.text.size);
const density = ref(DEFAULTS.text.density);
const opacity = ref(DEFAULTS.text.opacity);
const angle = ref(ANGLE_DEFAULT);

const exporting = ref(false);
const errorMessage = ref('');
const watermarkError = ref('');

const hexError = computed(() => hexInput.value.trim() !== '' && parseHex(hexInput.value) === null);
const showNeedText = computed(() => mode.value === 'text' && text.value.trim() === '');
const showNeedImage = computed(() => mode.value === 'image' && !watermarkImage.value);

let scratchCtx: CanvasRenderingContext2D | null = null;

function scratchContext(): CanvasRenderingContext2D {
  if (!scratchCtx) {
    scratchCtx = getContext(document.createElement('canvas'));
  }
  return scratchCtx;
}

function parseHex(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const expanded = trimmed
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
    return `#${expanded.toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return null;
}

function onHexUpdate(value: string): void {
  hexInput.value = value;
  const parsed = parseHex(value);
  if (parsed !== null) {
    lastValidHex.value = parsed;
  }
}

function onNativeColorInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  onHexUpdate(target.value);
}

interface WatermarkMetrics {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, centerX: number, centerY: number) => void;
}

function measureWatermark(canvasWidth: number, canvasHeight: number): WatermarkMetrics | null {
  if (size.value <= 0) return null;
  const minDim = Math.min(canvasWidth, canvasHeight);
  const sizeFactor = size.value / 100;

  if (mode.value === 'text') {
    const content = text.value.trim();
    if (!content) return null;
    const fontSize = Math.max(8, minDim * TEXT_SIZE_RATIO * sizeFactor);
    const font = `600 ${fontSize}px ${TEXT_FONT_STACK}`;
    const ctx = scratchContext();
    ctx.font = font;
    const width = ctx.measureText(content).width;
    const height = fontSize * 1.2;
    return {
      width,
      height,
      draw: (target, centerX, centerY) => {
        target.font = font;
        target.textAlign = 'center';
        target.textBaseline = 'middle';
        target.fillStyle = lastValidHex.value;
        target.fillText(content, centerX, centerY);
      },
    };
  }

  const wm = watermarkImage.value;
  if (!wm) return null;
  const naturalMax = Math.max(wm.naturalWidth, wm.naturalHeight) || 1;
  const scale = (minDim * IMAGE_SIZE_RATIO * sizeFactor) / naturalMax;
  const width = wm.naturalWidth * scale;
  const height = wm.naturalHeight * scale;
  return {
    width,
    height,
    draw: (target, centerX, centerY) => {
      target.drawImage(wm, centerX - width / 2, centerY - height / 2, width, height);
    },
  };
}

function drawTiledWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const metrics = measureWatermark(canvasWidth, canvasHeight);
  if (!metrics) return;

  const { width, height, draw } = metrics;
  const unit = Math.max(width, height);
  const gapFactor = GAP_MAX_FACTOR - (GAP_MAX_FACTOR - GAP_MIN_FACTOR) * (density.value / 100);
  const gap = unit * gapFactor;
  const cellWidth = width + gap;
  const cellHeight = height + gap;
  if (cellWidth <= 0 || cellHeight <= 0) return;

  const half = Math.hypot(canvasWidth, canvasHeight) / 2 + unit;
  const columns = Math.ceil(half / cellWidth);
  const rows = Math.ceil(half / cellHeight);

  ctx.save();
  ctx.globalAlpha = opacity.value / 100;
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate((angle.value * Math.PI) / 180);
  for (let row = -rows; row <= rows; row += 1) {
    for (let column = -columns; column <= columns; column += 1) {
      draw(ctx, column * cellWidth, row * cellHeight);
    }
  }
  ctx.restore();
}

function renderInto(canvas: HTMLCanvasElement, img: HTMLImageElement, maxDimension: number): void {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = getContext(canvas);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  drawTiledWatermark(ctx, canvas.width, canvas.height);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function renderPreview(): void {
  const img = sourceImage.value;
  const canvas = canvasRef.value;
  if (!img || !canvas) return;
  renderInto(canvas, img, PREVIEW_MAX);
}

let rafId = 0;

function scheduleRender(): void {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    renderPreview();
  });
}

watch(
  [sourceImage, watermarkImage, mode, text, lastValidHex, size, density, opacity, angle],
  scheduleRender,
);

/** Apply the default slider values for a watermark type. */
function applyDefaults(targetMode: WatermarkMode): void {
  const preset = DEFAULTS[targetMode];
  size.value = preset.size;
  density.value = preset.density;
  opacity.value = preset.opacity;
}

/** Switch watermark type, loading that type's default settings. */
function setMode(next: WatermarkMode): void {
  if (mode.value === next) return;
  mode.value = next;
  applyDefaults(next);
}

function resetAll(): void {
  mode.value = 'text';
  text.value = t('tools.tiledWatermark.defaultText');
  hexInput.value = HEX_DEFAULT;
  lastValidHex.value = HEX_DEFAULT;
  angle.value = ANGLE_DEFAULT;
  applyDefaults('text');
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

function openWatermarkPicker(): void {
  watermarkInputRef.value?.click();
}

async function loadWatermarkFile(file: File): Promise<void> {
  if (watermarkUrl.value) {
    URL.revokeObjectURL(watermarkUrl.value);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    watermarkImage.value = img;
    watermarkUrl.value = url;
    watermarkName.value = file.name;
    watermarkError.value = '';
    setMode('image');
  } catch {
    URL.revokeObjectURL(url);
    watermarkError.value = t('common.invalidType');
  }
}

function onWatermarkChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    watermarkError.value = t('common.invalidType');
    return;
  }
  void loadWatermarkFile(file);
}

function clearWatermarkImage(): void {
  if (watermarkUrl.value) {
    URL.revokeObjectURL(watermarkUrl.value);
  }
  watermarkImage.value = null;
  watermarkUrl.value = '';
  watermarkName.value = '';
}

async function download(): Promise<void> {
  const img = sourceImage.value;
  if (!img) return;
  exporting.value = true;
  try {
    await nextFrame();
    const offscreen = document.createElement('canvas');
    renderInto(offscreen, img, Number.POSITIVE_INFINITY);
    const blob = await canvasToBlob(offscreen);
    downloadBlob(blob, `${fileBaseName(sourceName.value)}-tiled-watermark.png`);
  } finally {
    exporting.value = false;
  }
}

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
  }
  if (watermarkUrl.value) {
    URL.revokeObjectURL(watermarkUrl.value);
  }
});
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-8">
    <ToolPageHeader
      :title="t('tools.tiledWatermark.title')"
      :description="t('tools.tiledWatermark.desc')"
      :icon="Stamp"
    >
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
            <canvas ref="canvasRef" class="max-h-[560px] w-auto rounded object-contain shadow-sm" />
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
          <h3 class="mb-4 text-sm font-semibold">{{ t('tools.tiledWatermark.typeTitle') }}</h3>

          <div class="mb-4 grid grid-cols-2 gap-2">
            <Button
              :variant="mode === 'text' ? 'default' : 'outline'"
              size="sm"
              @click="setMode('text')"
            >
              {{ t('tools.tiledWatermark.typeText') }}
            </Button>
            <Button
              :variant="mode === 'image' ? 'default' : 'outline'"
              size="sm"
              @click="setMode('image')"
            >
              {{ t('tools.tiledWatermark.typeImage') }}
            </Button>
          </div>

          <template v-if="mode === 'text'">
            <Label class="mb-1.5 block">{{ t('tools.tiledWatermark.textLabel') }}</Label>
            <Input
              v-model="text"
              type="text"
              class="mb-4"
              :placeholder="t('tools.tiledWatermark.textPlaceholder')"
            />

            <Label class="mb-1.5 block">{{ t('tools.tiledWatermark.colorLabel') }}</Label>
            <div class="mb-1.5 flex items-center gap-2">
              <input
                type="color"
                :value="lastValidHex"
                :aria-label="t('tools.tiledWatermark.colorLabel')"
                class="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                @input="onNativeColorInput"
              />
              <input
                :value="hexInput"
                type="text"
                spellcheck="false"
                :placeholder="t('tools.tiledWatermark.hexLabel')"
                :aria-label="t('tools.tiledWatermark.hexLabel')"
                :class="
                  cn(
                    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    hexError && 'border-destructive focus-visible:ring-destructive',
                  )
                "
                @input="onHexUpdate(($event.target as HTMLInputElement).value)"
              />
            </div>
            <p v-if="hexError" class="text-xs text-destructive">
              {{ t('tools.tiledWatermark.invalidHex') }}
            </p>
          </template>

          <template v-else>
            <Label class="mb-1.5 block">{{ t('tools.tiledWatermark.imageLabel') }}</Label>
            <button
              v-if="!watermarkImage"
              type="button"
              class="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
              @click="openWatermarkPicker"
            >
              <Upload class="h-5 w-5" />
              {{ t('tools.tiledWatermark.uploadImage') }}
            </button>
            <div v-else class="flex items-center gap-2 rounded-md border border-input p-2">
              <img
                :src="watermarkUrl"
                alt=""
                class="h-12 w-12 shrink-0 rounded bg-muted/40 object-contain"
              />
              <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {{ watermarkName }}
              </span>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="t('common.replace')"
                @click="openWatermarkPicker"
              >
                <RefreshCw />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="t('common.close')"
                @click="clearWatermarkImage"
              >
                <X />
              </Button>
            </div>
            <input
              ref="watermarkInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onWatermarkChange"
            />
          </template>

          <p v-if="watermarkError" class="mt-2 text-xs text-destructive">
            {{ watermarkError }}
          </p>
        </Card>

        <Card class="p-4">
          <h3 class="mb-4 text-sm font-semibold">
            {{ t('tools.tiledWatermark.settingsTitle') }}
          </h3>

          <div class="space-y-4">
            <div>
              <div class="flex items-center justify-between">
                <Label>{{ t('tools.tiledWatermark.sizeLabel') }}</Label>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {{ t('tools.tiledWatermark.percentValue', { value: size }) }}
                </span>
              </div>
              <Slider v-model="size" :min="SIZE_MIN" :max="SIZE_MAX" :step="1" class="mt-2" />
            </div>

            <div>
              <div class="flex items-center justify-between">
                <Label>{{ t('tools.tiledWatermark.densityLabel') }}</Label>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {{ t('tools.tiledWatermark.percentValue', { value: density }) }}
                </span>
              </div>
              <Slider v-model="density" :min="0" :max="100" :step="1" class="mt-2" />
            </div>

            <div>
              <div class="flex items-center justify-between">
                <Label>{{ t('tools.tiledWatermark.opacityLabel') }}</Label>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {{ t('tools.tiledWatermark.percentValue', { value: opacity }) }}
                </span>
              </div>
              <Slider v-model="opacity" :min="0" :max="100" :step="1" class="mt-2" />
            </div>

            <div>
              <div class="flex items-center justify-between">
                <Label>{{ t('tools.tiledWatermark.angleLabel') }}</Label>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {{ t('tools.tiledWatermark.degreeValue', { value: angle }) }}
                </span>
              </div>
              <Slider v-model="angle" :min="-180" :max="180" :step="1" class="mt-2" />
            </div>
          </div>

          <p v-if="showNeedText" class="mt-4 text-xs text-muted-foreground">
            {{ t('tools.tiledWatermark.needText') }}
          </p>
          <p v-else-if="showNeedImage" class="mt-4 text-xs text-muted-foreground">
            {{ t('tools.tiledWatermark.needWatermarkImage') }}
          </p>
          <p v-else class="mt-4 text-xs text-muted-foreground">
            {{ t('tools.tiledWatermark.hint') }}
          </p>
        </Card>
      </div>
    </div>
  </div>
</template>
