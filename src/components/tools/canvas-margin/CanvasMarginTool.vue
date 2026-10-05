<script setup lang="ts">
import { Download, Frame, Loader2, RefreshCw } from '@lucide/vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolPageHeader from '@/components/layout/ToolPageHeader.vue';
import ImageDropzone from '@/components/tools/ImageDropzone.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Label from '@/components/ui/Label.vue';
import Slider from '@/components/ui/Slider.vue';
import { downloadBlob, fileBaseName } from '@/lib/download';
import { canvasToBlob, getContext, loadImage } from '@/lib/image';

/** Checkerboard shown behind a transparent preview. */
const CHECKERBOARD = 'conic-gradient(#d4d4d8 0 25%, #fafafa 0 50%, #d4d4d8 0 75%, #fafafa 0)';

const MIN_SCALE = 10;
const MAX_SCALE = 100;
const MAX_MARGIN = 500;

const { t } = useI18n();

const sourceImage = ref<HTMLImageElement | null>(null);
const sourceUrl = ref('');
const sourceName = ref('');

const scale = ref(MAX_SCALE);
const margin = ref(0);
const radius = ref(0);
const bgColor = ref('#ffffff');
const transparent = ref(false);

const exporting = ref(false);
const errorMessage = ref('');

const replaceInputRef = ref<HTMLInputElement | null>(null);

const naturalWidth = computed(() => sourceImage.value?.naturalWidth ?? 0);
const naturalHeight = computed(() => sourceImage.value?.naturalHeight ?? 0);

const scaledWidth = computed(() =>
  Math.max(1, Math.round((naturalWidth.value * scale.value) / 100)),
);
const scaledHeight = computed(() =>
  Math.max(1, Math.round((naturalHeight.value * scale.value) / 100)),
);
const canvasWidth = computed(() => scaledWidth.value + margin.value * 2);
const canvasHeight = computed(() => scaledHeight.value + margin.value * 2);
const maxRadius = computed(() => Math.floor(Math.min(scaledWidth.value, scaledHeight.value) / 2));
const effectiveRadius = computed(() => Math.min(radius.value, maxRadius.value));

const wrapperStyle = computed(() => ({
  aspectRatio: `${canvasWidth.value} / ${canvasHeight.value}`,
  backgroundColor: transparent.value ? 'transparent' : bgColor.value,
  backgroundImage: transparent.value ? CHECKERBOARD : 'none',
  backgroundSize: transparent.value ? '16px 16px' : undefined,
}));

const previewImageStyle = computed(() => ({
  // Percentage of the wrapper (canvas) box; height stays auto so the image
  // keeps its natural aspect and shrinks on both axes with the scale slider.
  width: `${(scaledWidth.value / canvasWidth.value) * 100}%`,
  // % radius resolves against the image's own box, not the canvas box.
  borderRadius: effectiveRadius.value
    ? `${(effectiveRadius.value / scaledWidth.value) * 100}% / ${
        (effectiveRadius.value / scaledHeight.value) * 100
      }%`
    : '0',
}));

function resetState(): void {
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
  }
  sourceImage.value = null;
  sourceUrl.value = '';
  sourceName.value = '';
  errorMessage.value = '';
}

async function onFile(file: File): Promise<void> {
  resetState();
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    sourceImage.value = img;
    sourceUrl.value = url;
    sourceName.value = file.name;
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
  errorMessage.value = '';
  void onFile(file);
}

function setQuickColor(color: string): void {
  bgColor.value = color;
  transparent.value = false;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function outputFormat(): { mime: string; ext: string } {
  if (transparent.value) return { mime: 'image/png', ext: 'png' };
  const type = sourceImage.value ? sourceName.value.toLowerCase() : '';
  if (type.endsWith('.jpg') || type.endsWith('.jpeg')) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (type.endsWith('.webp')) return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/png', ext: 'png' };
}

async function download(): Promise<void> {
  const img = sourceImage.value;
  if (!img || exporting.value) return;
  exporting.value = true;
  try {
    const width = canvasWidth.value;
    const height = canvasHeight.value;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = getContext(canvas);
    if (!transparent.value) {
      ctx.fillStyle = bgColor.value;
      ctx.fillRect(0, 0, width, height);
    }
    const sw = scaledWidth.value;
    const sh = scaledHeight.value;
    const x = margin.value;
    const y = margin.value;
    const r = effectiveRadius.value;
    if (r > 0) {
      ctx.save();
      roundedRectPath(ctx, x, y, sw, sh, r);
      ctx.clip();
      ctx.drawImage(img, x, y, sw, sh);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, y, sw, sh);
    }
    const { mime, ext } = outputFormat();
    const blob = await canvasToBlob(canvas, mime);
    downloadBlob(blob, `${fileBaseName(sourceName.value)}-canvas.${ext}`);
  } finally {
    exporting.value = false;
  }
}

onBeforeUnmount(() => {
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
  }
});
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-8">
    <ToolPageHeader
      :title="t('tools.canvasMargin.title')"
      :description="t('tools.canvasMargin.desc')"
      :icon="Frame"
    >
      <Button :disabled="exporting || !sourceUrl" @click="download">
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
      <div class="space-y-3">
        <Card class="flex min-h-[360px] items-center justify-center p-6">
          <div
            class="flex w-full max-w-full items-center justify-center overflow-hidden shadow-sm"
            :style="wrapperStyle"
          >
            <img :src="sourceUrl" :alt="sourceName" class="block" :style="previewImageStyle" />
          </div>
        </Card>
        <div class="flex justify-end">
          <Button variant="ghost" size="sm" @click="openReplacePicker">
            <RefreshCw />
            {{ t('common.replace') }}
          </Button>
        </div>
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
        <Card class="space-y-3 p-4">
          <Label>{{ t('tools.canvasMargin.bgTitle') }}</Label>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="h-8 w-8 rounded-md border-2 shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :class="!transparent && bgColor === '#ffffff' ? 'border-primary' : 'border-border'"
              :title="t('tools.canvasMargin.white')"
              style="background: #ffffff"
              @click="setQuickColor('#ffffff')"
            />
            <button
              type="button"
              class="h-8 w-8 rounded-md border-2 shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :class="!transparent && bgColor === '#000000' ? 'border-primary' : 'border-border'"
              :title="t('tools.canvasMargin.black')"
              style="background: #000000"
              @click="setQuickColor('#000000')"
            />
            <input
              v-model="bgColor"
              type="color"
              class="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
              :title="t('tools.canvasMargin.bgColor')"
              @input="transparent = false"
            />
            <span class="text-xs uppercase tabular-nums text-muted-foreground">
              {{ bgColor }}
            </span>
          </div>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              v-model="transparent"
              type="checkbox"
              class="h-4 w-4 rounded border-border accent-primary"
            />
            {{ t('tools.canvasMargin.transparent') }}
          </label>
        </Card>

        <Card class="space-y-4 p-4">
          <div>
            <div class="flex items-center justify-between">
              <Label>{{ t('tools.canvasMargin.scaleLabel') }}</Label>
              <span class="text-xs tabular-nums text-muted-foreground">
                {{ t('tools.canvasMargin.percentValue', { value: scale }) }}
              </span>
            </div>
            <Slider v-model="scale" :min="MIN_SCALE" :max="MAX_SCALE" :step="1" class="mt-2.5" />
          </div>
          <div>
            <div class="flex items-center justify-between">
              <Label>{{ t('tools.canvasMargin.marginLabel') }}</Label>
              <span class="text-xs tabular-nums text-muted-foreground">
                {{ t('tools.canvasMargin.px', { value: margin }) }}
              </span>
            </div>
            <Slider v-model="margin" :min="0" :max="MAX_MARGIN" :step="1" class="mt-2.5" />
          </div>
          <div>
            <div class="flex items-center justify-between">
              <Label>{{ t('tools.canvasMargin.radiusLabel') }}</Label>
              <span class="text-xs tabular-nums text-muted-foreground">
                {{ t('tools.canvasMargin.px', { value: effectiveRadius }) }}
              </span>
            </div>
            <Slider
              v-model="radius"
              :min="0"
              :max="maxRadius"
              :step="1"
              :disabled="maxRadius === 0"
              class="mt-2.5"
            />
          </div>
          <p class="text-xs tabular-nums text-muted-foreground">
            {{
              t('tools.canvasMargin.output', {
                width: canvasWidth,
                height: canvasHeight,
              })
            }}
          </p>
        </Card>

        <p class="text-xs leading-relaxed text-muted-foreground">
          {{ t('tools.canvasMargin.hint') }}
        </p>
      </div>
    </div>
  </div>
</template>
