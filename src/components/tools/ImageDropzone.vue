<script setup lang="ts">
import { UploadCloud } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { cn } from '@/lib/utils';

interface Props {
  disabled?: boolean;
  /** Accept & emit multiple image files at once via the `files` event. */
  multiple?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  multiple: false,
});

const emit = defineEmits<{ file: [file: File]; files: [files: File[]] }>();

const { t } = useI18n();

const inputRef = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const errorMessage = ref('');

function openPicker(): void {
  if (props.disabled) return;
  inputRef.value?.click();
}

function acceptFiles(input: FileList | File[] | null | undefined): void {
  if (!input || input.length === 0) return;
  const images = Array.from(input).filter((file) => file.type.startsWith('image/'));
  if (images.length === 0) {
    errorMessage.value = t('common.invalidType');
    return;
  }
  errorMessage.value = '';
  if (props.multiple) {
    emit('files', images);
  } else {
    emit('file', images[0]);
  }
}

function onChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  acceptFiles(target.files);
  target.value = '';
}

function onDragOver(): void {
  if (props.disabled) return;
  dragOver.value = true;
}

function onDragLeave(): void {
  dragOver.value = false;
}

function onDrop(event: DragEvent): void {
  dragOver.value = false;
  if (props.disabled) return;
  acceptFiles(event.dataTransfer?.files);
}
</script>

<template>
  <div
    :class="
      cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 px-6 py-14 text-center transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        dragOver && 'border-primary bg-primary/10',
        props.disabled && 'pointer-events-none opacity-50',
      )
    "
    role="button"
    tabindex="0"
    @click="openPicker"
    @keydown.enter="openPicker"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <UploadCloud class="h-10 w-10 text-muted-foreground" />
    <p class="mt-3 text-sm font-medium">{{ t('common.uploadTitle') }}</p>
    <p class="mt-1 text-xs text-muted-foreground">{{ t('common.dropHint') }}</p>
    <p class="mt-1 text-xs text-muted-foreground">{{ t('common.dropSub') }}</p>
    <p v-if="errorMessage" class="mt-3 text-xs font-medium text-destructive">
      {{ errorMessage }}
    </p>
    <input
      ref="inputRef"
      type="file"
      accept="image/*"
      :multiple="props.multiple"
      class="hidden"
      @click.stop
      @change="onChange"
    />
  </div>
</template>
