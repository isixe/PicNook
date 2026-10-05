import { defineStore } from 'pinia';

const STORAGE_KEY = 'image-toolbox:favorites';

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export const useFavoritesStore = defineStore('favorites', {
  state: () => ({
    favorites: loadFavorites(),
  }),
  getters: {
    isFavorite: (state) => {
      return (slug: string): boolean => state.favorites.includes(slug);
    },
  },
  actions: {
    toggle(slug: string): void {
      const index = this.favorites.indexOf(slug);
      if (index >= 0) {
        this.favorites.splice(index, 1);
      } else {
        this.favorites.push(slug);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.favorites));
      } catch {
        // Best-effort persistence; favorites stay in memory this session.
      }
    },
  },
});
