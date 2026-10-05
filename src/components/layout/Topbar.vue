<script setup lang="ts">
import { Home, Menu, Search } from '@lucide/vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute } from 'vue-router';
import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import { SUPPORTED_LOCALES, persistLocale, type AppLocale } from '@/i18n';
import { useUiStore } from '@/stores/ui';

const { t, locale } = useI18n();
const ui = useUiStore();
const route = useRoute();

const searchInput = ref<HTMLInputElement | null>(null);

const languageOptions = SUPPORTED_LOCALES.map((item) => ({
  value: item.value,
  label: item.label,
}));

function currentLanguageLabel(): string {
  const match = SUPPORTED_LOCALES.find((item) => item.value === locale.value);
  return match?.label ?? locale.value;
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.value?.focus();
    searchInput.value?.select();
  }
}

watch(
  () => route.fullPath,
  () => {
    ui.setSearch('');
  },
);

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
    <button
      type="button"
      :aria-label="t('shell.search.placeholder')"
      class="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      @click="ui.toggleSidebar()"
    >
      <Menu class="h-5 w-5" />
    </button>

    <RouterLink
      to="/"
      class="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      :aria-label="t('shell.home.allTools')"
    >
      <Home class="h-5 w-5" />
    </RouterLink>

    <div class="relative mx-auto w-full max-w-xl">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref="searchInput"
        v-model="ui.searchQuery"
        type="search"
        :placeholder="t('shell.search.placeholder')"
        class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-16 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <kbd
        class="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 select-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block"
      >
        {{ t('shell.search.shortcut') }}
      </kbd>
    </div>

    <DropdownMenu
      :model-value="locale.toString()"
      :options="languageOptions"
      :trigger-label="currentLanguageLabel()"
      :aria-label="t('shell.language.label')"
      @update:model-value="(value) => persistLocale(value as AppLocale)"
    />
  </header>
</template>
