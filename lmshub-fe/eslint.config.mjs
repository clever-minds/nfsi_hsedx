// Konfigurasi datar (ESLint 9) untuk Vue 3 + TypeScript. Aturan pemformatan
// sengaja tidak dinyalakan — yang dikejar di sini cacat, bukan gaya.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
  {
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', console: 'readonly', navigator: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', fetch: 'readonly', FormData: 'readonly', Blob: 'readonly', URL: 'readonly', File: 'readonly', FileReader: 'readonly', Image: 'readonly', HTMLElement: 'readonly', MouseEvent: 'readonly', KeyboardEvent: 'readonly', Event: 'readonly', AbortController: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Nama komponen satu kata dipakai konsisten di proyek ini (Icon, DataTable).
      'vue/multi-word-component-names': 'off',
      // Pemformatan template diserahkan ke editor, bukan linter.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
    },
  },
);
