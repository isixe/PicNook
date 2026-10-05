<script setup lang="ts">
import { Download, Loader2, Package, Palette, RefreshCw } from '@lucide/vue';
import JSZip from 'jszip';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolPageHeader from '@/components/layout/ToolPageHeader.vue';
import ImageDropzone from '@/components/tools/ImageDropzone.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Label from '@/components/ui/Label.vue';
import Slider from '@/components/ui/Slider.vue';
import { downloadBlob, fileBaseName } from '@/lib/download';
import {
  applyDuotone,
  canvasToBlob,
  createScaledCanvas,
  drawPlain,
  drawWithFilter,
  loadImage,
  nextFrame,
} from '@/lib/image';

interface PresetDef {
  key: string;
  filter?: string;
  duotone?: { dark: readonly [number, number, number]; light: readonly [number, number, number] };
  /** i18n key when the label is not `presets.<key>` (parameterized labels). */
  labelKey?: string;
  labelParams?: Record<string, string | number>;
}

interface VariantEntry {
  key: string;
  dataUrl: string;
}

const CURATED_PRESETS: PresetDef[] = [
  { key: 'original' },
  { key: 'grayscale', filter: 'grayscale(1)' },
  {
    key: 'duotoneBlue',
    duotone: { dark: [10, 25, 80], light: [130, 205, 255] },
  },
  {
    key: 'duotoneGreen',
    duotone: { dark: [5, 45, 25], light: [150, 255, 180] },
  },
  {
    key: 'duotoneSunset',
    duotone: { dark: [65, 12, 45], light: [255, 195, 120] },
  },
  {
    key: 'duotonePurple',
    duotone: { dark: [35, 10, 65], light: [215, 165, 255] },
  },
  { key: 'sepia', filter: 'sepia(1)' },
  { key: 'hueRotate', filter: 'hue-rotate(180deg)' },
  { key: 'warm', filter: 'sepia(0.35) saturate(1.6) hue-rotate(-15deg)' },
  { key: 'cool', filter: 'saturate(1.25) hue-rotate(15deg) brightness(1.05)' },
  { key: 'contrast', filter: 'contrast(1.5) saturate(1.1)' },
  { key: 'invert', filter: 'invert(1)' },
];

const EXTRA_PRESETS: PresetDef[] = [
  { key: 'vivid', filter: 'saturate(1.8) contrast(1.1)' },
  { key: 'muted', filter: 'saturate(0.5) brightness(1.05)' },
  { key: 'soft', filter: 'contrast(0.9) brightness(1.05)' },
  { key: 'noir', filter: 'grayscale(1) contrast(1.4) brightness(0.95)' },
];

/** Slider upper bound for the number of generated variants. */
const MAX_VARIANTS = 50;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/**
 * Curated presets first, then hue-rotate steps, hue-shifted duotones and
 * finally extra filter combos — truncated to `count` (max MAX_VARIANTS).
 */
function buildPresets(count: number): PresetDef[] {
  const list: PresetDef[] = [...CURATED_PRESETS];
  // Hue rotations every 15° (skip 180° — already covered by `hueRotate`).
  for (let deg = 15; list.length < count && deg < 360; deg += 15) {
    if (deg === 180) continue;
    list.push({
      key: `hue${deg}`,
      filter: `hue-rotate(${deg}deg)`,
      labelKey: 'tools.colorVariants.presets.hueDeg',
      labelParams: { deg },
    });
  }
  // Duotones sampled around the hue circle (offset to reduce curated overlap).
  for (let deg = 15; list.length < count && deg < 360; deg += 30) {
    list.push({
      key: `duotoneH${deg}`,
      duotone: {
        dark: hslToRgb(deg, 0.6, 0.14),
        light: hslToRgb((deg + 40) % 360, 0.7, 0.86),
      },
      labelKey: 'tools.colorVariants.presets.duotoneHue',
      labelParams: { deg },
    });
  }
  for (const extra of EXTRA_PRESETS) {
    if (list.length >= count) break;
    list.push(extra);
  }
  return list.slice(0, count);
}

/** Max dimension (px) used for grid thumbnails and preview rendering. */
const PREVIEW_MAX = 1024;

const { t } = useI18n();

const sourceImage = ref<HTMLImageElement | null>(null);
const sourceUrl = ref('');
const sourceName = ref('');
const variants = ref<VariantEntry[]>([]);
const selectedKey = ref('original');
const variantCount = ref(CURATED_PRESETS.length);
const busy = ref(false);
const exporting = ref(false);
const packaging = ref(false);
const progress = ref({ current: 0, total: 0 });
const errorMessage = ref('');

const replaceInputRef = ref<HTMLInputElement | null>(null);

let regenerateQueued = false;

const activePresets = computed<ReadonlyArray<PresetDef>>(() => buildPresets(variantCount.value));

/** All presets up to MAX_VARIANTS — for labels/downloads of not-yet-regenerated thumbnails. */
const allPresets = buildPresets(MAX_VARIANTS);

const selectedVariant = computed<VariantEntry | null>(
  () => variants.value.find((entry) => entry.key === selectedKey.value) ?? null,
);

function presetLabel(key: string): string {
  const preset = allPresets.find((entry) => entry.key === key);
  if (preset?.labelKey) {
    return t(preset.labelKey, preset.labelParams ?? {});
  }
  return t(`tools.colorVariants.presets.${key}`);
}

const selectedLabel = computed(() => (selectedKey.value ? presetLabel(selectedKey.value) : ''));

function buildVariantCanvas(
  img: HTMLImageElement,
  preset: PresetDef,
  maxDimension: number,
): HTMLCanvasElement {
  const canvas = createScaledCanvas(img, maxDimension);
  if (preset.filter) {
    drawWithFilter(canvas, img, preset.filter);
  } else {
    drawPlain(canvas, img);
  }
  if (preset.duotone) {
    applyDuotone(canvas, preset.duotone);
  }
  return canvas;
}

async function generateAll(img: HTMLImageElement): Promise<void> {
  busy.value = true;
  const presets = activePresets.value;
  progress.value = { current: 0, total: presets.length };
  const next: VariantEntry[] = [];
  for (const preset of presets) {
    const canvas = buildVariantCanvas(img, preset, PREVIEW_MAX);
    next.push({ key: preset.key, dataUrl: canvas.toDataURL('image/png') });
    progress.value.current += 1;
    await nextFrame();
  }
  variants.value = next;
  if (!next.some((entry) => entry.key === selectedKey.value)) {
    selectedKey.value = next[0]?.key ?? '';
  }
  busy.value = false;
  if (regenerateQueued) {
    regenerateQueued = false;
    const current = sourceImage.value;
    if (current) void generateAll(current);
  }
}

/** Regenerate only when the slider drag (or keyboard change) is committed. */
function requestVariants(): void {
  const img = sourceImage.value;
  if (!img) return;
  if (busy.value) {
    regenerateQueued = true;
    return;
  }
  void generateAll(img);
}

function resetState(): void {
  if (sourceUrl.value) {
    URL.revokeObjectURL(sourceUrl.value);
  }
  sourceImage.value = null;
  sourceUrl.value = '';
  sourceName.value = '';
  variants.value = [];
  selectedKey.value = 'original';
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
    await generateAll(img);
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

async function downloadSelected(): Promise<void> {
  const img = sourceImage.value;
  if (!img) return;
  const preset = allPresets.find((entry) => entry.key === selectedKey.value);
  if (!preset) return;
  exporting.value = true;
  try {
    const blob = await canvasToBlob(buildVariantCanvas(img, preset, Number.POSITIVE_INFINITY));
    downloadBlob(blob, `${fileBaseName(sourceName.value)}-${preset.key}.png`);
  } finally {
    exporting.value = false;
  }
}

async function downloadAll(): Promise<void> {
  const img = sourceImage.value;
  if (!img || variants.value.length === 0) return;
  packaging.value = true;
  try {
    const zip = new JSZip();
    const base = fileBaseName(sourceName.value);
    const folder = zip.folder(base) ?? zip;
    for (const preset of activePresets.value) {
      const blob = await canvasToBlob(buildVariantCanvas(img, preset, Number.POSITIVE_INFINITY));
      folder.file(`${base}-${preset.key}.png`, blob);
      await nextFrame();
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${base}-color-variants.zip`);
  } finally {
    packaging.value = false;
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
      :title="t('tools.colorVariants.title')"
      :description="t('tools.colorVariants.desc')"
      :icon="Palette"
    >
      <Button
        v-if="variants.length > 0"
        variant="outline"
        :disabled="packaging || busy"
        @click="downloadAll"
      >
        <Loader2 v-if="packaging" class="animate-spin" />
        <Package v-else />
        {{ packaging ? t('tools.colorVariants.packaging') : t('tools.colorVariants.downloadAll') }}
      </Button>
    </ToolPageHeader>

    <p v-if="errorMessage" class="mb-4 text-sm font-medium text-destructive">
      {{ errorMessage }}
    </p>

    <ImageDropzone v-if="!sourceUrl" :disabled="busy" @file="onFile" />

    <div v-else class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <!-- Preset grid -->
      <div class="relative">
        <div class="mb-3 flex items-center justify-between gap-3">
          <p class="text-sm text-muted-foreground">
            {{ t('tools.colorVariants.count', { count: variants.length }) }}
          </p>
          <Button variant="ghost" size="sm" :disabled="busy" @click="openReplacePicker">
            <RefreshCw />
            {{ t('common.replace') }}
          </Button>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <button
            v-for="variant in variants"
            :key="variant.key"
            type="button"
            class="group overflow-hidden rounded-lg border bg-card p-1.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            :class="{
              'border-primary ring-2 ring-primary/40': variant.key === selectedKey,
            }"
            @click="selectedKey = variant.key"
          >
            <img
              :src="variant.dataUrl"
              :alt="presetLabel(variant.key)"
              class="aspect-[4/3] w-full rounded-md object-cover"
              loading="lazy"
            />
            <span class="mt-1.5 block truncate px-1 pb-0.5 text-xs font-medium">
              {{ presetLabel(variant.key) }}
            </span>
          </button>
        </div>

        <div
          v-if="busy"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/75 backdrop-blur-sm"
        >
          <Loader2 class="h-6 w-6 animate-spin text-primary" />
          <p class="mt-3 text-sm font-medium">
            {{
              t('tools.colorVariants.generating', {
                current: progress.current,
                total: progress.total,
              })
            }}
          </p>
        </div>

        <input
          ref="replaceInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onReplaceChange"
        />
      </div>

      <!-- Preview panel -->
      <div class="h-fit space-y-4 lg:sticky lg:top-4">
        <Card class="p-4">
          <div class="flex items-center justify-between">
            <Label>{{ t('tools.colorVariants.countTitle') }}</Label>
            <span class="text-xs tabular-nums text-muted-foreground">
              {{ variantCount }}
            </span>
          </div>
          <Slider
            v-model="variantCount"
            :min="1"
            :max="MAX_VARIANTS"
            :step="1"
            :disabled="busy"
            class="mt-2.5"
            @value-commit="requestVariants"
          />
        </Card>
        <Card class="overflow-hidden">
          <div class="flex min-h-[240px] items-center justify-center bg-muted/40 p-3">
            <img
              v-if="selectedVariant"
              :src="selectedVariant.dataUrl"
              :alt="selectedLabel"
              class="max-h-[420px] w-auto rounded object-contain shadow-sm"
            />
          </div>
          <div class="flex items-center justify-between gap-3 border-t p-3">
            <p class="min-w-0 truncate text-sm font-medium">{{ selectedLabel }}</p>
            <Button
              size="sm"
              :disabled="exporting || busy || !selectedVariant"
              @click="downloadSelected"
            >
              <Loader2 v-if="exporting" class="animate-spin" />
              <Download v-else />
              {{ t('common.download') }}
            </Button>
          </div>
        </Card>
        <p class="text-xs leading-relaxed text-muted-foreground">
          {{ t('tools.colorVariants.hint') }}
        </p>
      </div>
    </div>
  </div>
</template>
