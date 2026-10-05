<script setup lang="ts">
import { Heart } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { ToolDef } from '@/lib/tool-registry';
import { useFavoritesStore } from '@/stores/favorites';

interface Props {
  tool: ToolDef;
}

const props = defineProps<Props>();

const { t } = useI18n();
const router = useRouter();
const favorites = useFavoritesStore();

function onOpen(): void {
  void router.push(props.tool.path);
}

function onToggleFavorite(event: Event): void {
  event.stopPropagation();
  favorites.toggle(props.tool.slug);
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="group relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    @click="onOpen"
    @keydown.enter="onOpen"
    @keydown.space.prevent="onOpen"
  >
    <div class="flex items-start justify-between gap-2">
      <div
        class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
      >
        <component :is="props.tool.icon" class="h-5 w-5" />
      </div>
      <button
        type="button"
        :aria-label="
          favorites.isFavorite(props.tool.slug)
            ? t('shell.home.removeFavorite')
            : t('shell.home.addFavorite')
        "
        class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
        :class="{ '!opacity-100 text-amber-500': favorites.isFavorite(props.tool.slug) }"
        @click="onToggleFavorite"
      >
        <Heart
          class="h-4 w-4"
          :fill="favorites.isFavorite(props.tool.slug) ? 'currentColor' : 'none'"
        />
      </button>
    </div>
    <div class="min-w-0">
      <h3 class="truncate text-sm font-semibold">{{ t(props.tool.titleKey) }}</h3>
      <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {{ t(props.tool.descKey) }}
      </p>
    </div>
  </div>
</template>
