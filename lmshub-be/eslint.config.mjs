// Konfigurasi datar (ESLint 9). Sengaja ketat pada hal yang benar-benar
// menandakan cacat, dan longgar pada gaya — pemformatan bukan urusan linter
// di proyek ini.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'migrations/**', 'uploads/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Argumen berawalan _ memang sengaja tidak dipakai (mis. `next` di Express).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `any` dipakai di beberapa batas integrasi; jadikan peringatan, bukan galat.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Wizard pemasangan berjalan di peramban, bukan di Node.
    files: ['assets/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly', document: 'readonly', location: 'readonly',
        fetch: 'readonly', console: 'readonly', setTimeout: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    // Skrip CLI memang mencetak ke stdout — itu keluarannya, bukan sisa debug.
    files: ['src/scripts/**/*.ts', 'scripts/**/*.{ts,cjs,js}'],
    rules: { 'no-console': 'off' },
  },
);
