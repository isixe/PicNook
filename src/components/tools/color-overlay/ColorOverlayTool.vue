<script setup lang="ts">
import { Download, Loader2, Layers, RefreshCw } from '@lucide/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolPageHeader from '@/components/layout/ToolPageHeader.vue';
import ImageDropzone from '@/components/tools/ImageDropzone.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Label from '@/components/ui/Label.vue';
import Select from '@/components/ui/Select.vue';
import Slider from '@/components/ui/Slider.vue';
import { downloadBlob, fileBaseName } from '@/lib/download';
import { canvasToBlob, getContext, loadImage, nextFrame } from '@/lib/image';
import { cn } from '@/lib/utils';

const BLEND_MODES = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

type BlendMode = (typeof BLEND_MODES)[number];

const QUICK_KEYS = ['brighten', 'darken', 'warm', 'cool'] as const;

const QUICK_PRESETS: Record<
  (typeof QUICK_KEYS)[number],
  { color: string; blend: BlendMode; opacity: number }
> = {
  brighten: { color: '#ffffff', blend: 'screen', opacity: 40 },
  darken: { color: '#000000', blend: 'multiply', opacity: 40 },
  warm: { color: '#ff9a5a', blend: 'soft-light', opacity: 60 },
  cool: { color: '#5aa0ff', blend: 'soft-light', opacity: 60 },
};

const DEFAULTS = {
  hex: '#ffffff',
  blend: 'screen' as BlendMode,
  opacity: 40,
  brightness: 100,
  contrast: 100,
  gamma: 100,
};

/** Max dimension (px) for the on-page preview canvas. */
const PREVIEW_MAX = 1280;

const { t } = useI18n();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const replaceInputRef = ref<HTMLInputElement | null>(null);

const sourceImage = ref<HTMLImageElement | null>(null);
const sourceUrl = ref('');
const sourceName = ref('');

const hexInput = ref(DEFAULTS.hex);
const lastValidHex = ref(DEFAULTS.hex);
const blend = ref<BlendMode>(DEFAULTS.blend);
const opacity = ref(DEFAULTS.opacity);
const brightness = ref(DEFAULTS.brightness);
const contrast = ref(DEFAULTS.contrast);
const gamma = ref(DEFAULTS.gamma);

const exporting = ref(false);
const errorMessage = ref('');

const hexError = computed(() => hexInput.value.trim() !== '' && parseHex(hexInput.value) === null);

const blendOptions = computed(() =>
  BLEND_MODES.map((mode) => ({
    value: mode,
    label: t(`tools.colorOverlay.blendModes.${mode}`),
  })),
);

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

function applyQuick(key: (typeof QUICK_KEYS)[number]): void {
  const preset = QUICK_PRESETS[key];
  hexInput.value = preset.color;
  lastValidHex.value = preset.color;
  blend.value = preset.blend;
  opacity.value = preset.opacity;
}

function resetLevels(): void {
  brightness.value = DEFAULTS.brightness;
  contrast.value = DEFAULTS.contrast;
  gamma.value = DEFAULTS.gamma;
}

function resetAll(): void {
  hexInput.value = DEFAULTS.hex;
  lastValidHex.value = DEFAULTS.hex;
  blend.value = DEFAULTS.blend;
  opacity.value = DEFAULTS.opacity;
  resetLevels();
}

function adjustChannel(
  value: number,
  brightnessFactor: number,
  contrastFactor: number,
  gammaInverse: number,
): number {
  let channel = value * brightnessFactor;
  channel = (channel - 128) * contrastFactor + 128;
  if (channel < 0) channel = 0;
  if (channel > 255) channel = 255;
  if (gammaInverse !== 1) {
    channel = 255 * Math.pow(channel / 255, gammaInverse);
  }
  return channel;
}

function applyLevels(data: Uint8ClampedArray): void {
  const brightnessFactor = brightness.value / 100;
  const contrastFactor = contrast.value / 100;
  const gammaInverse = 1 / Math.max(0.01, gamma.value / 100);
  if (brightnessFactor === 1 && contrastFactor === 1 && gammaInverse === 1) {
    return;
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = adjustChannel(data[i], brightnessFactor, contrastFactor, gammaInverse);
    data[i + 1] = adjustChannel(data[i + 1], brightnessFactor, contrastFactor, gammaInverse);
    data[i + 2] = adjustChannel(data[i + 2], brightnessFactor, contrastFactor, gammaInverse);
  }
}

function renderInto(canvas: HTMLCanvasElement, img: HTMLImageElement, maxDimension: number): void {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = getContext(canvas);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = blend.value;
  ctx.globalAlpha = opacity.value / 100;
  ctx.fillStyle = lastValidHex.value;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyLevels(imageData.data);
  ctx.putImageData(imageData, 0, 0);
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

watch([sourceImage, lastValidHex, blend, opacity, brightness, contrast, gamma], scheduleRender);

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

async function download(): Promise<void> {
  const img = sourceImage.value;
  if (!img) return;
  exporting.value = true;
  try {
    await nextFrame();
    const offscreen = document.createElement('canvas');
    renderInto(offscreen, img, Number.POSITIVE_INFINITY);
    const blob = await canvasToBlob(offscreen);
    downloadBlob(blob, `${fileBaseName(sourceName.value)}-overlay.png`);
  } finally {
    exporting.value = false;
  }
}

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
  }
});
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-8">
    <ToolPageHeader
      :title="t('tools.colorOverlay.title')"
      :description="t('tools.colorOverlay.desc')"
      :icon="Layers"
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
          <h3 class="mb-4 text-sm font-semibold">
            {{ t('tools.colorOverlay.overlayTitle') }}
          </h3>

          <Label class="mb-1.5 block">{{ t('tools.colorOverlay.colorLabel') }}</Label>
          <div class="mb-1.5 flex items-center gap-2">
            <input
              type="color"
              :value="lastValidHex"
              :aria-label="t('tools.colorOverlay.colorLabel')"
              class="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
              @input="onNativeColorInput"
            />
            <input
              :value="hexInput"
              type="text"
              spellcheck="false"
              :placeholder="t('tools.colorOverlay.hexLabel')"
              :aria-label="t('tools.colorOverlay.hexLabel')"
              :class="
                cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  hexError && 'border-destructive focus-visible:ring-destructive',
                )
              "
              @input="onHexUpdate(($event.target as HTMLInputElement).value)"
            />
          </div>
          <p v-if="hexError" class="mb-3 text-xs text-destructive">
            {{ t('tools.colorOverlay.invalidHex') }}
          </p>
          <div v-else class="mb-3"></div>

          <Label class="mb-1.5 block">{{ t('tools.colorOverlay.quickLabel') }}</Label>
          <div class="mb-4 grid grid-cols-2 gap-2">
            <Button
              v-for="key in QUICK_KEYS"
              :key="key"
              variant="outline"
              size="sm"
              @click="applyQuick(key)"
            >
              {{ t(`tools.colorOverlay.quick.${key}`) }}
            </Button>
          </div>

          <Label class="mb-1.5 block">{{ t('tools.colorOverlay.blendLabel') }}</Label>
          <Select
            :model-value="blend"
            :options="blendOptions"
            class="mb-4"
            @update:model-value="
              (value) => {
                blend = value as BlendMode;
              }
            "
          />

          <div class="flex items-center justify-between">
            <Label>{{ t('tools.colorOverlay.opacityLabel') }}</Label>
            <span class="text-xs tabular-nums text-muted-foreground"> {{ opacity }}% </span>
          </div>
          <Slider v-model="opacity" :min="0" :max="100" :step="1" class="mt-2" />
        </Card>

        <Card class="p-4">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-sm font-semibold">
              {{ t('tools.colorOverlay.levelsTitle') }}
            </h3>
            <Button variant="ghost" size="sm" @click="resetLevels">
              {{ t('common.reset') }}
            </Button>
          </div>

          <div class="space-y-4">
            <div>
              <div class="flex items-center justify-between">
                <Label>{{ t('tools.colorOverlay.brightnessLabel') }}</Label>
                <span class="text-xs tabular-nums text-muted-foreground"> {{ brightness }}% </span>
              </div>
              <Slider v-model="brightness" :min="0" :max="200" :step="1" class="mt-2" />
            </div>

            <div>
              <div class="flex items-center justify-between">
                <Label>{{ t('tools.colorOverlay.contrastLabel') }}</Label>
                <span class="text-xs tabular-nums text-muted-foreground"> {{ contrast }}% </span>
              </div>
              <Slider v-model="contrast" :min="0" :max="200" :step="1" class="mt-2" />
            </div>

            <div>
              <div class="flex items-center justify-between">
                <Label>{{ t('tools.colorOverlay.gammaLabel') }}</Label>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {{ (gamma / 100).toFixed(2) }}
                </span>
              </div>
              <Slider v-model="gamma" :min="20" :max="300" :step="1" class="mt-2" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
