<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue';
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';

interface Props {
  title: string;
  description: string;
  icon: Component;
}

const props = defineProps<Props>();

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <div class="mb-6 flex items-start justify-between gap-4">
    <div class="flex items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        :aria-label="t('common.back')"
        @click="router.push('/')"
      >
        <ArrowLeft />
      </Button>
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
      >
        <component :is="props.icon" class="h-5 w-5" />
      </div>
      <div class="min-w-0">
        <h1 class="truncate text-xl font-semibold">{{ props.title }}</h1>
        <p class="truncate text-sm text-muted-foreground">{{ props.description }}</p>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <slot />
    </div>
  </div>
</template>
