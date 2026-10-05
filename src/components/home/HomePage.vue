<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolCard from '@/components/home/ToolCard.vue';
import { categories, tools, type ToolDef } from '@/lib/tool-registry';
import { useFavoritesStore } from '@/stores/favorites';
import { useUiStore } from '@/stores/ui';

const { t } = useI18n();
const ui = useUiStore();
const favorites = useFavoritesStore();

const searchActive = computed(() => ui.searchQuery.trim() !== '');

const filteredTools = computed(() => {
  const query = ui.searchQuery.trim().toLowerCase();
  if (!query) return tools;
  return tools.filter((tool) => matches(tool, query));
});

const favoriteTools = computed(() => tools.filter((tool) => favorites.isFavorite(tool.slug)));

const showFavorites = computed(
  () => ui.searchQuery.trim() === '' && favoriteTools.value.length > 0,
);

const categoryGroups = computed(() => {
  const query = ui.searchQuery.trim().toLowerCase();
  return categories
    .map((category) => ({
      category,
      tools: tools.filter(
        (tool) => tool.category === category.id && (query === '' || matches(tool, query)),
      ),
    }))
    .filter((group) => group.tools.length > 0);
});

function matches(tool: ToolDef, query: string): boolean {
  const haystack = [tool.slug, t(tool.titleKey), t(tool.descKey)].join(' ').toLowerCase();
  return haystack.includes(query);
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-6 py-8">
    <!-- Promo card -->
    <section
      class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-emerald-600 to-teal-500 p-8 text-primary-foreground shadow-lg"
    >
      <div class="relative z-10 max-w-2xl">
        <h2 class="text-2xl font-bold tracking-tight">
          {{ t('shell.home.promoTitle') }}
        </h2>
        <p class="mt-2 text-sm leading-relaxed opacity-90">
          {{ t('shell.home.promoDesc') }}
        </p>
      </div>
      <div
        class="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl"
      />
      <div
        class="pointer-events-none absolute -bottom-16 right-16 h-40 w-40 rounded-full bg-white/10 blur-2xl"
      />
    </section>

    <!-- Favorites -->
    <section v-if="showFavorites" class="mt-8">
      <h2 class="mb-3 text-lg font-semibold">{{ t('shell.categories.favorites') }}</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <ToolCard v-for="tool in favoriteTools" :key="`fav-${tool.slug}`" :tool="tool" />
      </div>
    </section>

    <!-- Search: flat results -->
    <section v-if="searchActive" class="mt-8">
      <h2 class="mb-3 text-lg font-semibold">{{ t('shell.home.allTools') }}</h2>
      <div
        v-if="filteredTools.length > 0"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <ToolCard v-for="tool in filteredTools" :key="tool.slug" :tool="tool" />
      </div>
      <p
        v-else
        class="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"
      >
        {{ t('shell.home.noResults') }}
      </p>
    </section>

    <!-- Browse: one section per category -->
    <template v-else>
      <section v-for="group in categoryGroups" :key="group.category.id" class="mt-8">
        <h2 class="mb-3 text-lg font-semibold">{{ t(group.category.labelKey) }}</h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <ToolCard v-for="tool in group.tools" :key="tool.slug" :tool="tool" />
        </div>
      </section>
    </template>
  </div>
</template>
