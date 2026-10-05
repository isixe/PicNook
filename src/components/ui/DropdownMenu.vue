<script setup lang="ts">
import { Check, ChevronDown } from '@lucide/vue';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui';
import { cn } from '@/lib/utils';

export interface DropdownOption {
  value: string;
  label: string;
}

interface Props {
  modelValue: string;
  options: ReadonlyArray<DropdownOption>;
  triggerLabel: string;
  ariaLabel?: string;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: '',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function onSelect(value: string): void {
  emit('update:modelValue', value);
}
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      :aria-label="props.ariaLabel"
      :class="
        cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          props.class,
        )
      "
    >
      {{ props.triggerLabel }}
      <ChevronDown class="h-4 w-4 opacity-50" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        :side-offset="6"
        class="z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
      >
        <DropdownMenuItem
          v-for="option in props.options"
          :key="option.value"
          class="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
          @select="onSelect(option.value)"
        >
          <Check v-if="option.value === props.modelValue" class="h-4 w-4" />
          <span v-else class="h-4 w-4 shrink-0" />
          {{ option.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
