<script setup lang="ts">
import { Download, Loader2, RefreshCw, Scaling } from '@lucide/vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolPageHeader from '@/components/layout/ToolPageHeader.vue';
import ImageDropzone from '@/components/tools/ImageDropzone.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Slider from '@/components/ui/Slider.vue';
import { downloadBlob, fileBaseName } from '@/lib/download';
import { canvasToBlob, getContext, loadImage } from '@/lib/image';

const MIN_PERCENT = 1;
const MAX_PERCENT = 400;
/** Guard against browser canvas size limits (width or height). */
const MAX_DIM = 8192;
const STEP_BUTTONS = [-10, -1, 1, 10] as const;

const { t } = useI18n();

const sourceImage = ref<HTMLImageElement | null>(null);
const sourceUrl = ref('');
const sourceName = ref('');

const dims = ref({ w: 0, h: 0 });
const targetWidth = computed(() => dims.value.w);
const targetHeight = computed(() => dims.value.h);

const exporting = ref(false);
const errorMessage = ref('');

const replaceInputRef = ref<HTMLInputElement | null>(null);

const naturalWidth = computed(() => sourceImage.value?.naturalWidth ?? 0);
const naturalHeight = computed(() => sourceImage.value?.naturalHeight ?? 0);

/** Largest percent that keeps both axes within MAX_DIM (also capped by MAX_PERCENT). */
const maxPercent = computed(() => {
  const longest = Math.max(naturalWidth.value, naturalHeight.value);
  if (longest === 0) return MAX_PERCENT;
  return Math.max(MIN_PERCENT, Math.min(MAX_PERCENT, Math.floor((MAX_DIM / longest) * 100)));
});

const percent = computed<number>({
  get() {
    const nw = naturalWidth.value;
    if (nw === 0) return 100;
    return (targetWidth.value / nw) * 100;
  },
  set(value: number) {
    setPercent(value);
  },
});

/** Output format follows the source extension; PNG stays PNG. */
function outputFormat(): { mime: string; ext: string } {
  const type = sourceName.value.toLowerCase();
  if (type.endsWith('.jpg') || type.endsWith('.jpeg')) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (type.endsWith('.webp')) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return { mime: 'image/png', ext: 'png' };
}

/** Derive both axes from the current aspect ratio, honoring both limits. */
function applySize(width: number, height: number): void {
  const w = Math.min(Math.max(1, Math.round(width)), MAX_DIM);
  const h = Math.min(Math.max(1, Math.round(height)), MAX_DIM);
  dims.value = { w, h };
}

function setPercent(value: number): void {
  const nw = naturalWidth.value;
  const nh = naturalHeight.value;
  if (nw === 0 || nh === 0) return;
  const p = Math.min(Math.max(value, MIN_PERCENT), maxPercent.value);
  applySize((nw * p) / 100, (nh * p) / 100);
}

function setWidth(value: number): void {
  const nw = naturalWidth.value;
  const nh = naturalHeight.value;
  if (nw === 0 || nh === 0) return;
  const w = Math.min(Math.max(1, Math.round(value)), MAX_DIM);
  applySize(w, (w * nh) / nw);
}

function setHeight(value: number): void {
  const nw = naturalWidth.value;
  const nh = naturalHeight.value;
  if (nw === 0 || nh === 0) return;
  const h = Math.min(Math.max(1, Math.round(value)), MAX_DIM);
  applySize((h * nw) / nh, h);
}

function onWidthInput(value: string): void {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) setWidth(parsed);
}

function onHeightInput(value: string): void {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) setHeight(parsed);
}

/** Re-assign a fresh object so the inputs resync after invalid typing. */
function syncSizeInputs(): void {
  dims.value = { ...dims.value };
}

function resetState(): void {
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
  }
  sourceImage.value = null;
  sourceUrl.value = '';
  sourceName.value = '';
  dims.value = { w: 0, h: 0 };
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
    applySize(img.naturalWidth, img.naturalHeight);
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

async function download(): Promise<void> {
  const img = sourceImage.value;
  if (!img || exporting.value) return;
  exporting.value = true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth.value;
    canvas.height = targetHeight.value;
    const ctx = getContext(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { mime, ext } = outputFormat();
    const blob = await canvasToBlob(canvas, mime);
    downloadBlob(blob, `${fileBaseName(sourceName.value)}-scaled.${ext}`);
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
      :title="t('tools.scale.title')"
      :description="t('tools.scale.desc')"
      :icon="Scaling"
    >
      <Button variant="outline" :disabled="!sourceUrl" @click="setPercent(100)">
        <RefreshCw />
        {{ t('common.reset') }}
      </Button>
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
          <img
            :src="sourceUrl"
            :alt="sourceName"
            class="max-h-[520px] w-full max-w-full rounded-md object-contain shadow-sm"
          />
        </Card>
        <div class="flex items-center justify-between gap-3">
          <p class="min-w-0 truncate text-xs text-muted-foreground">
            {{ t('tools.scale.original', { width: naturalWidth, height: naturalHeight }) }}
          </p>
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
        <Card class="space-y-4 p-4">
          <div>
            <div class="flex items-center justify-between">
              <Label>{{ t('tools.scale.scaleLabel') }}</Label>
              <span class="text-xs tabular-nums text-muted-foreground">
                {{ t('tools.scale.percentValue', { value: Math.round(percent) }) }}
              </span>
            </div>
            <Slider
              :model-value="Math.round(percent)"
              :min="MIN_PERCENT"
              :max="maxPercent"
              :step="1"
              class="mt-2.5"
              @update:model-value="setPercent"
            />
          </div>

          <div>
            <Label class="mb-1.5 block">{{ t('tools.scale.quickLabel') }}</Label>
            <div class="grid grid-cols-4 gap-2">
              <Button
                v-for="step in STEP_BUTTONS"
                :key="step"
                variant="outline"
                size="sm"
                :disabled="step < 0 ? percent <= MIN_PERCENT : percent >= maxPercent"
                @click="setPercent(percent + step)"
              >
                {{ step > 0 ? `+${step}%` : `${step}%` }}
              </Button>
            </div>
          </div>
        </Card>

        <Card class="space-y-3 p-4">
          <Label>{{ t('tools.scale.sizeTitle') }}</Label>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <Label class="mb-1.5 block text-xs text-muted-foreground">
                {{ t('tools.scale.widthLabel') }}
              </Label>
              <Input
                :model-value="String(targetWidth)"
                type="number"
                min="1"
                :max="MAX_DIM"
                @update:model-value="onWidthInput"
                @blur="syncSizeInputs"
              />
            </div>
            <div>
              <Label class="mb-1.5 block text-xs text-muted-foreground">
                {{ t('tools.scale.heightLabel') }}
              </Label>
              <Input
                :model-value="String(targetHeight)"
                type="number"
                min="1"
                :max="MAX_DIM"
                @update:model-value="onHeightInput"
                @blur="syncSizeInputs"
              />
            </div>
          </div>
          <p class="text-xs tabular-nums text-muted-foreground">
            {{ t('tools.scale.output', { width: targetWidth, height: targetHeight }) }}
          </p>
        </Card>

        <p class="text-xs leading-relaxed text-muted-foreground">
          {{ t('tools.scale.hint') }}
        </p>
      </div>
    </div>
  </div>
</template>
