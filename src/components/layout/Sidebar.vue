<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute } from 'vue-router';
import { categories, tools, type ToolDef } from '@/lib/tool-registry';
import { useFavoritesStore } from '@/stores/favorites';
import { useUiStore } from '@/stores/ui';

const { t } = useI18n();
const ui = useUiStore();
const favorites = useFavoritesStore();
const route = useRoute();

const favoriteTools = computed<ToolDef[]>(() =>
  tools.filter((tool) => favorites.isFavorite(tool.slug)),
);

function toolsOfCategory(categoryId: string): ToolDef[] {
  return tools.filter((tool) => tool.category === categoryId);
}
</script>

<template>
  <aside
    class="flex shrink-0 flex-col overflow-hidden border-r bg-card transition-[width,opacity] duration-300 ease-in-out motion-reduce:transition-none"
    :class="ui.sidebarCollapsed ? 'w-0 border-r-0 opacity-0' : 'w-60 opacity-100'"
    :inert="ui.sidebarCollapsed"
    :aria-hidden="ui.sidebarCollapsed ? 'true' : undefined"
  >
    <div class="flex h-full w-60 flex-col">
      <div class="bg-gradient-to-br from-primary to-emerald-500 px-4 py-5 text-primary-foreground">
        <p class="text-lg font-bold tracking-tight">{{ t('shell.brand.title') }}</p>
        <p class="mt-0.5 text-xs opacity-85">{{ t('shell.brand.subtitle') }}</p>
      </div>

      <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <template v-if="favoriteTools.length > 0">
          <p
            class="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {{ t('shell.categories.favorites') }}
          </p>
          <RouterLink
            v-for="tool in favoriteTools"
            :key="`fav-${tool.slug}`"
            :to="tool.path"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/90 transition-colors hover:bg-accent hover:text-accent-foreground"
            :class="{
              'bg-accent font-medium text-accent-foreground': route.path === tool.path,
            }"
          >
            <component :is="tool.icon" class="h-4 w-4 shrink-0 text-amber-500" />
            <span class="truncate">{{ t(tool.titleKey) }}</span>
          </RouterLink>
        </template>

        <template v-for="category in categories" :key="category.id">
          <p
            class="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {{ t(category.labelKey) }}
          </p>
          <RouterLink
            v-for="tool in toolsOfCategory(category.id)"
            :key="tool.slug"
            :to="tool.path"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/90 transition-colors hover:bg-accent hover:text-accent-foreground"
            :class="{
              'bg-accent font-medium text-accent-foreground': route.path === tool.path,
            }"
          >
            <component :is="tool.icon" class="h-4 w-4 shrink-0 text-primary" />
            <span class="truncate">{{ t(tool.titleKey) }}</span>
          </RouterLink>
        </template>
      </nav>
    </div>
  </aside>
</template>
