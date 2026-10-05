<script setup lang="ts">
import { Info, Loader2, Plus, ShieldCheck, Trash2, X } from '@lucide/vue';
import exifr from 'exifr';
import JSZip from 'jszip';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolPageHeader from '@/components/layout/ToolPageHeader.vue';
import ImageDropzone from '@/components/tools/ImageDropzone.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Label from '@/components/ui/Label.vue';
import { downloadBlob, fileBaseName } from '@/lib/download';
import { canvasToBlob, drawPlain, loadImage, nextFrame } from '@/lib/image';

type MetaStatus = 'parsing' | 'done' | 'none' | 'error';

interface InfoEntry {
  id: number;
  file: File;
  url: string;
  width: number | null;
  height: number | null;
  meta: Record<string, unknown> | null;
  metaStatus: MetaStatus;
  privacyKeys: string[];
}

/** Tag patterns considered privacy-relevant (shown highlighted, worth clearing). */
const PRIVACY_PATTERNS: RegExp[] = [
  /^GPS/i,
  /Date/i,
  /^Make$/i,
  /^Model$/i,
  /^Software$/i,
  /^Artist$/i,
  /^Copyright$/i,
  /^HostComputer$/i,
  /^Owner/i,
  /^CameraOwner/i,
  /Serial/i,
  /^LensMake$/i,
  /^LensModel$/i,
  /^UserComment$/i,
  /^ImageUniqueID$/i,
  /^xmp:/i,
];

function isPrivacyKey(key: string): boolean {
  return PRIVACY_PATTERNS.some((pattern) => pattern.test(key));
}

const { t, te } = useI18n();

const entries = ref<InfoEntry[]>([]);
const selectedId = ref<number | null>(null);
const busy = ref(false);
const progress = ref({ current: 0, total: 0 });
const statusMessage = ref('');
const errorMessage = ref('');

const addInputRef = ref<HTMLInputElement | null>(null);

let nextId = 1;
const seenKeys = new Set<string>();

const selectedEntry = computed<InfoEntry | null>(
  () => entries.value.find((entry) => entry.id === selectedId.value) ?? null,
);

const selectedMetaEntries = computed<[string, unknown][]>(() => {
  const meta = selectedEntry.value?.meta;
  if (!meta) return [];
  return Object.entries(meta);
});

const selectedPrivacyEntries = computed<[string, unknown][]>(() => {
  const entry = selectedEntry.value;
  if (!entry?.meta) return [];
  return entry.privacyKeys.map((key) => [key, entry.meta?.[key]] as [string, unknown]);
});

function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function entryBadge(entry: InfoEntry): { key: string; class: string } {
  if (entry.metaStatus === 'parsing') {
    return { key: 'tools.imageInfo.metaParsing', class: 'bg-muted text-muted-foreground' };
  }
  if (entry.metaStatus === 'error') {
    return { key: 'tools.imageInfo.metaError', class: 'bg-destructive/10 text-destructive' };
  }
  if (entry.privacyKeys.length > 0) {
    return { key: 'tools.imageInfo.badgePrivacy', class: 'bg-destructive/10 text-destructive' };
  }
  if (entry.metaStatus === 'done') {
    return { key: 'tools.imageInfo.badgeMeta', class: 'bg-primary/10 text-primary' };
  }
  return { key: 'tools.imageInfo.badgeNone', class: 'bg-muted text-muted-foreground' };
}

async function hydrate(entry: InfoEntry): Promise<void> {
  try {
    const img = await loadImage(entry.url);
    entry.width = img.naturalWidth;
    entry.height = img.naturalHeight;
  } catch {
    // Unsupported container (e.g. HEIC in Chrome) — dimensions stay unknown.
  }
  try {
    // `true` = parse every segment (TIFF/EXIF/GPS/XMP/IPTC…).
    const parsed = await exifr.parse(entry.file, true);
    const meta = parsed as Record<string, unknown> | undefined;
    if (meta && Object.keys(meta).length > 0) {
      entry.meta = meta;
      entry.metaStatus = 'done';
      entry.privacyKeys = Object.keys(meta)
        .filter(isPrivacyKey)
        .sort((a, b) => a.localeCompare(b));
    } else {
      entry.meta = null;
      entry.metaStatus = 'none';
      entry.privacyKeys = [];
    }
  } catch {
    entry.meta = null;
    entry.metaStatus = 'error';
    entry.privacyKeys = [];
  }
}

function addFiles(input: FileList | File[]): void {
  const images = Array.from(input).filter((file) => file.type.startsWith('image/'));
  if (images.length === 0) {
    errorMessage.value = t('common.invalidType');
    return;
  }
  errorMessage.value = '';
  for (const file of images) {
    const key = fileKey(file);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const entry: InfoEntry = {
      id: nextId,
      file,
      url: URL.createObjectURL(file),
      width: null,
      height: null,
      meta: null,
      metaStatus: 'parsing',
      privacyKeys: [],
    };
    nextId += 1;
    entries.value.push(entry);
    // Mutate the reactive proxy stored in the array, not the raw object —
    // otherwise hydrate()'s updates never trigger a re-render.
    const stored = entries.value[entries.value.length - 1];
    if (selectedId.value === null) {
      selectedId.value = entry.id;
    }
    void hydrate(stored ?? entry);
  }
}

function removeEntry(entry: InfoEntry): void {
  URL.revokeObjectURL(entry.url);
  seenKeys.delete(fileKey(entry.file));
  const index = entries.value.indexOf(entry);
  entries.value = entries.value.filter((item) => item.id !== entry.id);
  if (selectedId.value === entry.id) {
    selectedId.value = entries.value[Math.min(index, entries.value.length - 1)]?.id ?? null;
  }
}

function clearAll(): void {
  if (busy.value) return;
  for (const entry of entries.value) {
    URL.revokeObjectURL(entry.url);
    seenKeys.delete(fileKey(entry.file));
  }
  entries.value = [];
  selectedId.value = null;
  statusMessage.value = '';
}

function openPicker(): void {
  if (busy.value) return;
  addInputRef.value?.click();
}

function onAddChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (target.files) addFiles(target.files);
  target.value = '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function truncate(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return formatDate(value);
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return '[binary]';
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) =>
        typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item),
      )
      .join(', ');
    return truncate(text);
  }
  if (typeof value === 'object') {
    try {
      return truncate(JSON.stringify(value));
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

/** Localized label for an EXIF tag key; falls back to the raw key. */
function metaLabel(key: string): string {
  const path = `tools.imageInfo.fields.${key}`;
  return te(path) ? t(path) : key;
}

function outputMime(type: string): { mime: string; ext: string } {
  if (type === 'image/jpeg') return { mime: 'image/jpeg', ext: 'jpg' };
  if (type === 'image/webp') return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/png', ext: 'png' };
}

/** Re-draw pixels onto a canvas — the browser emits no metadata for canvas exports. */
async function cleanBlob(entry: InfoEntry): Promise<Blob> {
  const img = await loadImage(entry.url);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  drawPlain(canvas, img);
  const { mime } = outputMime(entry.file.type);
  return canvasToBlob(canvas, mime);
}

async function clearPrivacy(): Promise<void> {
  const batch = [...entries.value];
  if (batch.length === 0 || busy.value) return;
  busy.value = true;
  statusMessage.value = '';
  errorMessage.value = '';
  progress.value = { current: 0, total: batch.length };
  const outputs: { name: string; blob: Blob }[] = [];
  let failed = 0;
  for (let index = 0; index < batch.length; index += 1) {
    const entry = batch[index];
    progress.value.current = index + 1;
    try {
      const blob = await cleanBlob(entry);
      const { ext } = outputMime(entry.file.type);
      const base = fileBaseName(entry.file.name);
      const name =
        batch.length === 1
          ? `${base}-clean.${ext}`
          : `${String(index + 1).padStart(2, '0')}-${base}-clean.${ext}`;
      outputs.push({ name, blob });
    } catch {
      failed += 1;
    }
    await nextFrame();
  }
  if (outputs.length === 1 && batch.length === 1) {
    downloadBlob(outputs[0].blob, outputs[0].name);
  } else if (outputs.length > 0) {
    const zip = new JSZip();
    for (const output of outputs) {
      zip.file(output.name, output.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, 'privacy-clean.zip');
  }
  if (outputs.length === 0) {
    statusMessage.value = t('tools.imageInfo.clearedNone');
  } else if (failed > 0) {
    statusMessage.value = t('tools.imageInfo.clearedPartial', {
      ok: outputs.length,
      fail: failed,
    });
  } else {
    statusMessage.value = t('tools.imageInfo.clearedOk', {
      count: outputs.length,
    });
  }
  busy.value = false;
}

onBeforeUnmount(() => {
  for (const entry of entries.value) {
    URL.revokeObjectURL(entry.url);
  }
});
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-8">
    <ToolPageHeader
      :title="t('tools.imageInfo.title')"
      :description="t('tools.imageInfo.desc')"
      :icon="Info"
    >
      <Button v-if="entries.length > 0" variant="outline" :disabled="busy" @click="openPicker">
        <Plus />
        {{ t('tools.imageInfo.addMore') }}
      </Button>
    </ToolPageHeader>

    <p v-if="errorMessage" class="mb-4 text-sm font-medium text-destructive">
      {{ errorMessage }}
    </p>

    <ImageDropzone v-if="entries.length === 0" multiple :disabled="busy" @files="addFiles" />

    <div v-else class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <!-- File list + metadata -->
      <div class="space-y-4">
        <Card class="p-3">
          <div class="mb-3 flex items-center justify-between gap-3">
            <p class="text-sm text-muted-foreground">
              {{ t('tools.imageInfo.countLabel', { count: entries.length }) }}
            </p>
            <Button variant="ghost" size="sm" :disabled="busy" @click="clearAll">
              <Trash2 />
              {{ t('tools.imageInfo.clearAll') }}
            </Button>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <div
              v-for="entry in entries"
              :key="entry.id"
              role="button"
              tabindex="0"
              class="group relative cursor-pointer overflow-hidden rounded-lg border bg-card p-1.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              :class="{
                'border-primary ring-2 ring-primary/40': entry.id === selectedId,
              }"
              @click="selectedId = entry.id"
              @keydown.enter="selectedId = entry.id"
            >
              <img
                :src="entry.url"
                :alt="entry.file.name"
                class="aspect-[4/3] w-full rounded-md object-cover"
                loading="lazy"
              />
              <span class="mt-1.5 block truncate px-1 text-xs font-medium">
                {{ entry.file.name }}
              </span>
              <span
                class="mt-0.5 ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                :class="entryBadge(entry).class"
              >
                {{ t(entryBadge(entry).key) }}
              </span>
              <button
                type="button"
                class="absolute right-2 top-2 rounded-md border bg-background/80 p-1 opacity-0 shadow-sm transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
                :title="t('tools.imageInfo.remove')"
                :disabled="busy"
                @click.stop="removeEntry(entry)"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </Card>

        <Card v-if="selectedEntry" class="space-y-4 p-4">
          <!-- Privacy info -->
          <section>
            <div class="flex items-center justify-between gap-3">
              <Label>{{ t('tools.imageInfo.privacyTitle') }}</Label>
              <span
                v-if="selectedPrivacyEntries.length > 0"
                class="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive"
              >
                {{ selectedPrivacyEntries.length }}
              </span>
            </div>
            <p
              v-if="selectedEntry.metaStatus === 'parsing'"
              class="mt-2 text-sm text-muted-foreground"
            >
              {{ t('tools.imageInfo.metaParsing') }}
            </p>
            <p
              v-else-if="selectedEntry.metaStatus === 'error'"
              class="mt-2 text-sm text-destructive"
            >
              {{ t('tools.imageInfo.metaError') }}
            </p>
            <p
              v-else-if="selectedEntry.metaStatus === 'none'"
              class="mt-2 text-sm text-muted-foreground"
            >
              {{ t('tools.imageInfo.noMeta') }}
            </p>
            <p
              v-else-if="selectedPrivacyEntries.length === 0"
              class="mt-2 text-sm text-muted-foreground"
            >
              {{ t('tools.imageInfo.noPrivacy') }}
            </p>
            <dl v-else class="mt-2 space-y-1.5">
              <div
                v-for="[key, value] in selectedPrivacyEntries"
                :key="key"
                class="flex items-start justify-between gap-3 text-sm"
              >
                <dt class="shrink-0 font-medium text-destructive/90">
                  {{ metaLabel(key) }}
                </dt>
                <dd class="min-w-0 break-all text-right tabular-nums text-muted-foreground">
                  {{ formatValue(value) }}
                </dd>
              </div>
            </dl>
          </section>

          <!-- Full metadata -->
          <section class="border-t pt-3">
            <Label>{{ t('tools.imageInfo.metaTitle') }}</Label>
            <p
              v-if="selectedEntry.metaStatus === 'parsing'"
              class="mt-2 text-sm text-muted-foreground"
            >
              {{ t('tools.imageInfo.metaParsing') }}
            </p>
            <p
              v-else-if="selectedEntry.metaStatus === 'error'"
              class="mt-2 text-sm text-destructive"
            >
              {{ t('tools.imageInfo.metaError') }}
            </p>
            <p
              v-else-if="selectedMetaEntries.length === 0"
              class="mt-2 text-sm text-muted-foreground"
            >
              {{ t('tools.imageInfo.noMeta') }}
            </p>
            <dl v-else class="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
              <div
                v-for="[key, value] in selectedMetaEntries"
                :key="key"
                class="flex items-start justify-between gap-3 text-sm"
              >
                <dt class="shrink-0 text-muted-foreground">
                  {{ metaLabel(key) }}
                </dt>
                <dd class="min-w-0 break-all text-right tabular-nums">
                  {{ formatValue(value) }}
                </dd>
              </div>
            </dl>
          </section>
        </Card>
      </div>

      <!-- Basic info + actions -->
      <div class="h-fit space-y-4 lg:sticky lg:top-4">
        <Card v-if="selectedEntry" class="space-y-2.5 p-4">
          <Label>{{ t('tools.imageInfo.basicTitle') }}</Label>
          <div class="space-y-1.5 text-sm">
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">
                {{ t('tools.imageInfo.fileName') }}
              </span>
              <span class="min-w-0 truncate text-right font-medium">
                {{ selectedEntry.file.name }}
              </span>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">
                {{ t('tools.imageInfo.fileType') }}
              </span>
              <span class="text-right font-medium">
                {{ selectedEntry.file.type || '—' }}
              </span>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">
                {{ t('tools.imageInfo.fileSize') }}
              </span>
              <span class="text-right font-medium tabular-nums">
                {{ formatSize(selectedEntry.file.size) }}
              </span>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">
                {{ t('tools.imageInfo.dimensions') }}
              </span>
              <span class="text-right font-medium tabular-nums">
                {{
                  selectedEntry.width && selectedEntry.height
                    ? `${selectedEntry.width} × ${selectedEntry.height}`
                    : '—'
                }}
              </span>
            </div>
            <div class="flex justify-between gap-3">
              <span class="text-muted-foreground">
                {{ t('tools.imageInfo.modified') }}
              </span>
              <span class="text-right font-medium">
                {{ formatDate(new Date(selectedEntry.file.lastModified)) }}
              </span>
            </div>
          </div>
        </Card>

        <Card class="space-y-3 p-4">
          <Button class="w-full" :disabled="busy || entries.length === 0" @click="clearPrivacy">
            <Loader2 v-if="busy" class="animate-spin" />
            <ShieldCheck v-else />
            {{
              busy
                ? t('tools.imageInfo.clearing', {
                    done: progress.current,
                    total: progress.total,
                  })
                : t('tools.imageInfo.clearBtn')
            }}
          </Button>
          <p v-if="statusMessage" class="text-sm font-medium text-primary">
            {{ statusMessage }}
          </p>
          <p class="text-xs leading-relaxed text-muted-foreground">
            {{ t('tools.imageInfo.hint') }}
          </p>
        </Card>
      </div>
    </div>

    <input
      ref="addInputRef"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="onAddChange"
    />
  </div>
</template>
