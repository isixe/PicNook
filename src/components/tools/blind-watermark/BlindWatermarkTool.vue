<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Fingerprint, Loader2, RefreshCw, ShieldCheck, Upload } from '@lucide/vue';
import ToolPageHeader from '@/components/layout/ToolPageHeader.vue';
import ImageDropzone from '@/components/tools/ImageDropzone.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Slider from '@/components/ui/Slider.vue';
import { downloadBlob, fileBaseName } from '@/lib/download';
import { canvasToBlob, getContext, loadImage, nextFrame } from '@/lib/image';
import { detect, embed, type DetectResult, type LogoData, type RgbaImage } from '@/lib/watermark';
import { logoToBits } from '@/lib/watermark/codec';
import { cn } from '@/lib/utils';

const { t } = useI18n();

const LOGO_SIZE = 24;
const PREVIEW_MAX = 1280;
const modes = ['embed', 'detect'] as const;

const mode = ref<(typeof modes)[number]>('embed');
const canvasRef = ref<HTMLCanvasElement | null>(null);
const replaceInputRef = ref<HTMLInputElement | null>(null);
const logoInputRef = ref<HTMLInputElement | null>(null);
const sourceImage = ref<HTMLImageElement | null>(null);
const sourceUrl = ref('');
const sourceName = ref('');
const errorMessage = ref('');
const busy = ref(false);
const embedDone = ref(false);
const password = ref('');
const text = ref('');
const strength = ref(50);
const logoBits = ref<LogoData | null>(null);
const result = ref<DetectResult | null>(null);
const resultLogoUrl = ref('');
const progressSeconds = ref(0);

let worker: Worker | null = null;
let workerRequestId = 0;
let progressTimer: ReturnType<typeof setInterval> | null = null;
const pendingRequests = new Map<
  number,
  { resolve: (response: WorkerResponse) => void; reject: (error: Error) => void }
>();

type WorkerResponse =
  | { id: number; ok: true; image?: RgbaImage; result?: DetectResult }
  | { id: number; ok: false; message: string };

interface EmbedRequestInput {
  image: RgbaImage;
  password: string;
  strength: number;
  text: string;
  logo?: LogoData;
}

interface DetectRequestInput {
  image: RgbaImage;
  password: string;
}

function startProgress(): void {
  progressSeconds.value = 0;
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    progressSeconds.value += 1;
  }, 1000);
}

function stopProgress(): void {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  progressSeconds.value = 0;
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('./wm.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const entry = pendingRequests.get(response.id);
      if (!entry) return;
      pendingRequests.delete(response.id);
      entry.resolve(response);
    };
    worker.onerror = () => {
      for (const entry of pendingRequests.values()) entry.reject(new Error('worker-error'));
      pendingRequests.clear();
    };
  }
  return worker;
}

function callWorker(
  request: ({ op: 'embed' } & EmbedRequestInput) | ({ op: 'detect' } & DetectRequestInput),
): Promise<WorkerResponse> {
  const instance = getWorker();
  if (!instance) return Promise.reject(new Error('worker-unavailable'));
  const id = (workerRequestId += 1);
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    instance.postMessage({ ...request, id });
  });
}

async function embedInWorker(input: RgbaImage, options: EmbedRequestInput): Promise<RgbaImage> {
  try {
    const response = await callWorker({ op: 'embed', ...options });
    if (response.ok && response.image) return response.image;
    throw new Error(response.ok ? 'missing-image' : response.message);
  } catch {
    return embed(input, options);
  }
}

async function detectInWorker(
  input: RgbaImage,
  options: DetectRequestInput,
): Promise<DetectResult> {
  try {
    const response = await callWorker({ op: 'detect', ...options });
    if (response.ok && response.result) return response.result;
    throw new Error(response.ok ? 'missing-result' : response.message);
  } catch {
    return detect(input, options);
  }
}

const strengthLabel = computed(() => {
  if (strength.value < 34) return t('tools.blindWatermark.strengthLight');
  if (strength.value < 67) return t('tools.blindWatermark.strengthMedium');
  return t('tools.blindWatermark.strengthStrong');
});

function renderInto(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  maxDimension: number,
): void {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = getContext(canvas);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
}

let rafId = 0;

function scheduleRender(): void {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (canvasRef.value && sourceImage.value) {
      renderInto(canvasRef.value, sourceImage.value, PREVIEW_MAX);
    }
  });
}

function toRgbaImage(image: HTMLImageElement): RgbaImage {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = getContext(canvas);
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data };
}

function rgbaToCanvas(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = getContext(canvas);
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  );
  return canvas;
}

function logoDataUrl(logo: LogoData): string {
  const scale = 6;
  const canvas = document.createElement('canvas');
  canvas.width = logo.width * scale;
  canvas.height = logo.height * scale;
  const ctx = getContext(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < logo.height; y += 1) {
    for (let x = 0; x < logo.width; x += 1) {
      const index = y * logo.width + x;
      if ((logo.bits[index >> 3] >> (7 - (index & 7))) & 1) {
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
  return canvas.toDataURL('image/png');
}

async function onFile(file: File): Promise<void> {
  if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value);
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    sourceImage.value = image;
    sourceUrl.value = url;
    sourceName.value = file.name;
    errorMessage.value = '';
    result.value = null;
    resultLogoUrl.value = '';
    embedDone.value = false;
    scheduleRender();
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
  if (file) void onFile(file);
}

function openLogoPicker(): void {
  logoInputRef.value?.click();
}

async function onLogoChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    errorMessage.value = t('common.invalidType');
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = LOGO_SIZE;
    canvas.height = LOGO_SIZE;
    const ctx = getContext(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGO_SIZE, LOGO_SIZE);
    ctx.drawImage(image, 0, 0, LOGO_SIZE, LOGO_SIZE);
    const { data } = ctx.getImageData(0, 0, LOGO_SIZE, LOGO_SIZE);
    const pixels = new Uint8Array(LOGO_SIZE * LOGO_SIZE);
    for (let i = 0; i < pixels.length; i += 1) {
      const offset = i * 4;
      const lum = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
      pixels[i] = lum < 128 ? 1 : 0;
    }
    logoBits.value = logoToBits(LOGO_SIZE, LOGO_SIZE, pixels);
    errorMessage.value = '';
  } catch {
    errorMessage.value = t('common.invalidType');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clearLogo(): void {
  logoBits.value = null;
}

async function runEmbed(): Promise<void> {
  errorMessage.value = '';
  embedDone.value = false;
  if (!password.value) {
    errorMessage.value = t('tools.blindWatermark.errorPassword');
    return;
  }
  if (!text.value.trim() && !logoBits.value) {
    errorMessage.value = t('tools.blindWatermark.errorContent');
    return;
  }
  if (!sourceImage.value) return;
  busy.value = true;
  startProgress();
  try {
    await nextFrame();
    const input = toRgbaImage(sourceImage.value);
    const output = await embedInWorker(input, {
      image: input,
      password: password.value,
      strength: strength.value,
      text: text.value,
      logo: logoBits.value ?? undefined,
    });
    const blob = await canvasToBlob(rgbaToCanvas(output), 'image/png');
    downloadBlob(blob, `${fileBaseName(sourceName.value)}-watermarked.png`);
    embedDone.value = true;
  } catch {
    errorMessage.value = t('tools.blindWatermark.workerError');
  } finally {
    stopProgress();
    busy.value = false;
  }
}

async function runDetect(): Promise<void> {
  errorMessage.value = '';
  result.value = null;
  resultLogoUrl.value = '';
  if (!password.value) {
    errorMessage.value = t('tools.blindWatermark.errorPassword');
    return;
  }
  if (!sourceImage.value) return;
  busy.value = true;
  startProgress();
  try {
    await nextFrame();
    const input = toRgbaImage(sourceImage.value);
    const detected = await detectInWorker(input, { image: input, password: password.value });
    result.value = detected;
    if (detected.found && detected.logo) {
      resultLogoUrl.value = logoDataUrl(detected.logo);
    }
  } catch {
    errorMessage.value = t('tools.blindWatermark.workerError');
  } finally {
    stopProgress();
    busy.value = false;
  }
}

watch(sourceUrl, scheduleRender);

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  stopProgress();
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pendingRequests.clear();
  if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value);
});
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-8">
    <ToolPageHeader
      :title="t('tools.blindWatermark.title')"
      :description="t('tools.blindWatermark.desc')"
      :icon="Fingerprint"
    />

    <div class="mb-6 inline-flex rounded-md border bg-muted/40 p-1">
      <button
        v-for="item in modes"
        :key="item"
        type="button"
        :class="
          cn(
            'rounded px-4 py-1.5 text-sm font-medium transition-colors',
            mode === item
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )
        "
        @click="mode = item"
      >
        {{
          t(item === 'embed' ? 'tools.blindWatermark.modeEmbed' : 'tools.blindWatermark.modeDetect')
        }}
      </button>
    </div>

    <p v-if="errorMessage" class="mb-4 text-sm font-medium text-destructive">{{ errorMessage }}</p>

    <ImageDropzone v-if="!sourceUrl" @file="onFile" />

    <div v-else class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card class="overflow-hidden">
        <div class="flex items-center justify-center bg-muted/40 p-4">
          <canvas ref="canvasRef" class="max-h-[70vh] w-auto max-w-full rounded"></canvas>
        </div>
        <div class="flex items-center justify-between gap-3 border-t p-3">
          <span class="truncate text-sm text-muted-foreground">{{ sourceName }}</span>
          <div class="flex items-center gap-2">
            <input
              ref="replaceInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onReplaceChange"
            />
            <Button variant="ghost" size="sm" @click="openReplacePicker">
              <RefreshCw class="size-4" />
              {{ t('common.replace') }}
            </Button>
          </div>
        </div>
      </Card>

      <div class="h-fit space-y-4 lg:sticky lg:top-4">
        <Card class="p-4">
          <h3 class="mb-4 text-sm font-semibold">{{ t('tools.blindWatermark.passwordTitle') }}</h3>
          <Label class="mb-1.5 block">{{ t('tools.blindWatermark.passwordLabel') }}</Label>
          <Input
            v-model="password"
            type="password"
            :placeholder="t('tools.blindWatermark.passwordPlaceholder')"
          />
          <p class="mt-2 text-xs text-muted-foreground">
            {{ t('tools.blindWatermark.passwordHint') }}
          </p>
        </Card>

        <template v-if="mode === 'embed'">
          <Card class="p-4">
            <h3 class="mb-4 text-sm font-semibold">{{ t('tools.blindWatermark.embedTitle') }}</h3>
            <Label class="mb-1.5 block">{{ t('tools.blindWatermark.textLabel') }}</Label>
            <textarea
              v-model="text"
              rows="3"
              :placeholder="t('tools.blindWatermark.textPlaceholder')"
              class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            ></textarea>
            <div class="mt-4">
              <Label class="mb-1.5 block">{{ t('tools.blindWatermark.logoLabel') }}</Label>
              <div class="flex items-center gap-2">
                <input
                  ref="logoInputRef"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="onLogoChange"
                />
                <Button variant="outline" size="sm" @click="openLogoPicker">
                  <Upload class="size-4" />
                  {{
                    logoBits
                      ? t('tools.blindWatermark.logoChange')
                      : t('tools.blindWatermark.logoUpload')
                  }}
                </Button>
                <Button v-if="logoBits" variant="ghost" size="sm" @click="clearLogo">
                  {{ t('tools.blindWatermark.logoRemove') }}
                </Button>
              </div>
              <p class="mt-2 text-xs text-muted-foreground">
                {{ t('tools.blindWatermark.logoHint') }}
              </p>
            </div>
          </Card>

          <Card class="p-4">
            <h3 class="mb-4 text-sm font-semibold">
              {{ t('tools.blindWatermark.strengthTitle') }}
            </h3>
            <div class="mb-2 flex items-center justify-between">
              <Label>{{ t('tools.blindWatermark.strengthLabel') }}</Label>
              <span class="text-xs tabular-nums text-muted-foreground">{{ strengthLabel }}</span>
            </div>
            <Slider v-model="strength" :min="0" :max="100" :step="1" />
            <p class="mt-2 text-xs text-muted-foreground">
              {{ t('tools.blindWatermark.strengthHint') }}
            </p>
          </Card>

          <Button class="w-full" :disabled="busy" @click="runEmbed">
            <Loader2 v-if="busy" class="size-4 animate-spin" />
            <Download v-else class="size-4" />
            {{ busy ? t('tools.blindWatermark.embedding') : t('tools.blindWatermark.embedAction') }}
          </Button>
          <p v-if="busy" class="text-center text-xs tabular-nums text-muted-foreground">
            {{ t('tools.blindWatermark.elapsed', { seconds: progressSeconds }) }}
          </p>
          <p v-if="embedDone" class="text-xs font-medium text-emerald-600">
            {{ t('tools.blindWatermark.embedSuccess') }}
          </p>
        </template>

        <template v-else>
          <Card class="p-4">
            <h3 class="mb-4 text-sm font-semibold">{{ t('tools.blindWatermark.detectTitle') }}</h3>
            <p class="mb-4 text-xs text-muted-foreground">
              {{ t('tools.blindWatermark.detectHint') }}
            </p>
            <Button class="w-full" :disabled="busy" @click="runDetect">
              <Loader2 v-if="busy" class="size-4 animate-spin" />
              <ShieldCheck v-else class="size-4" />
              {{
                busy ? t('tools.blindWatermark.detecting') : t('tools.blindWatermark.detectAction')
              }}
            </Button>
            <p v-if="busy" class="mt-2 text-center text-xs tabular-nums text-muted-foreground">
              {{ t('tools.blindWatermark.elapsed', { seconds: progressSeconds }) }}
            </p>
          </Card>

          <Card v-if="result" class="p-4">
            <h3 class="mb-4 text-sm font-semibold">{{ t('tools.blindWatermark.resultTitle') }}</h3>
            <p
              class="mb-3 text-sm font-semibold"
              :class="result.found ? 'text-emerald-600' : 'text-destructive'"
            >
              {{
                result.found
                  ? t('tools.blindWatermark.resultFound')
                  : t('tools.blindWatermark.resultNotFound')
              }}
            </p>
            <template v-if="result.found">
              <div class="mb-2">
                <span class="text-xs text-muted-foreground">
                  {{ t('tools.blindWatermark.resultText') }}
                </span>
                <p class="text-sm break-words whitespace-pre-wrap">
                  {{ result.text || t('tools.blindWatermark.resultNoText') }}
                </p>
              </div>
              <div v-if="resultLogoUrl" class="mb-2">
                <span class="text-xs text-muted-foreground">
                  {{ t('tools.blindWatermark.resultLogo') }}
                </span>
                <img
                  :src="resultLogoUrl"
                  alt="logo"
                  class="mt-1 size-24 rounded border bg-white p-1 [image-rendering:pixelated]"
                />
              </div>
              <div class="flex gap-4 text-xs text-muted-foreground">
                <span>
                  {{ t('tools.blindWatermark.resultConfidence') }}:
                  {{ result.confidence.toFixed(1) }}
                </span>
                <span>
                  {{ t('tools.blindWatermark.resultScale') }}: {{ result.scale.toFixed(3) }}
                </span>
              </div>
            </template>
            <p v-else class="mt-2 text-xs text-muted-foreground">
              {{ t('tools.blindWatermark.resultRetryHint') }}
            </p>
          </Card>
        </template>

        <p class="text-xs text-muted-foreground">{{ t('tools.blindWatermark.note') }}</p>
      </div>
    </div>
  </div>
</template>
