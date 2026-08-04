import js from '@eslint/js';
import globals from 'globals';

/**
 * Flat config (ESLint 10).
 *
 * KNOWN GAP — TypeScript files are NOT linted right now.
 *
 * This project is on TypeScript 7 (the current stable release; 6.x only ever
 * shipped as a beta). typescript-eslint hard-refuses to load against TS 7 —
 * it throws "typescript-eslint does not support TS 7.0" at startup, not merely
 * a peer-dependency warning. Support is tracked upstream at
 * https://github.com/typescript-eslint/typescript-eslint/issues/10940.
 *
 * Until that lands, type and correctness checking for src/ and tests/ comes
 * from `npm run typecheck` — tsc in strict mode with noUncheckedIndexedAccess,
 * exactOptionalPropertyTypes, noUnusedLocals and noUnusedParameters, which
 * already subsumes most of what the recommended rule set would flag.
 * Formatting is handled by Prettier.
 *
 * TODO: add `...tseslint.configs.recommendedTypeChecked` over src/**\/*.{ts,tsx}
 * as soon as typescript-eslint supports TS >= 7.1.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.vite/**', 'coverage/**', 'release/**'],
  },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
    },
  },

  {
    // Build tooling: Node-only, and printing to stdout is the whole point.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
    },
  },
];
