import eslint from '@eslint/js';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

// Next's shareable flat configs assume they're the only config in the project,
// so their `files` globs aren't scoped to a directory (e.g. `**/*.{ts,tsx}`)
// and would otherwise apply Next/React rules to the backend too. Every entry
// that isn't a bare `ignores` entry has its `files` glob forced to the
// frontend app, while `ignores`-only entries are left as global excludes.
const frontendOnly = (configs) =>
  configs.map((config) =>
    config.files || !config.ignores
      ? { ...config, files: ['apps/frontend/**/*.{js,jsx,ts,tsx}'] }
      : config,
  );

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.next/**', '**/out/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  ...frontendOnly(nextCoreWebVitals),
  ...frontendOnly(nextTypescript),
);
