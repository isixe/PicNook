import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', '.astro/**', '.playwright-mcp/**', '.omo/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    // SFC scripts are TypeScript and type-checked by vue-tsc; core no-undef only
    // produces false positives there (DOM types, import.meta, etc.).
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
      },
    },
  },
  {
    // shadcn-style primitives (Card, Button, Slider, ...) and layout shells
    // (Sidebar, Topbar) are single-word by design; their optional `class` prop
    // intentionally has no default.
    files: ['src/components/ui/**', 'src/components/layout/**'],
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
    },
  },
  prettier,
);
