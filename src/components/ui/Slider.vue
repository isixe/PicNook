<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui';
import { cn } from '@/lib/utils';

interface Props {
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
  /** Fires when a drag or keyboard change finishes committing. */
  valueCommit: [value: number];
}>();

function onUpdate(value: unknown): void {
  const list = Array.isArray(value) ? value : [value];
  const first = list[0];
  if (typeof first === 'number') {
    emit('update:modelValue', first);
  }
}

function onValueCommit(value: unknown): void {
  const list = Array.isArray(value) ? value : [value];
  const first = list[0];
  if (typeof first === 'number') {
    emit('valueCommit', first);
  }
}
</script>

<template>
  <SliderRoot
    :model-value="[props.modelValue]"
    :min="props.min"
    :max="props.max"
    :step="props.step"
    :disabled="props.disabled"
    :class="cn('relative flex w-full touch-none select-none items-center', props.class)"
    @update:model-value="onUpdate"
    @value-commit="onValueCommit"
  >
    <SliderTrack class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
      <SliderRange class="absolute h-full bg-primary" />
    </SliderTrack>
    <SliderThumb
      class="block h-4 w-4 cursor-grab rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none"
    />
  </SliderRoot>
</template>
