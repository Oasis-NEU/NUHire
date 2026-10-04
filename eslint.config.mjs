// One ESLint config for the whole repo (INFRA-5). CI's lint job runs it on the
// files a PR changes and blocks the PR on any error. To check a file before
// pushing: npx eslint path/to/file.tsx
//
// Deliberately not here: no-explicit-any and no-console. The review bot
// already blocks a *new* `any` or `console.log` on the lines a PR touches,
// while ignoring the ones already in the tree. Turning them on here would fail
// every PR over code it did not write.
//
// frontend's build script is `next build --no-lint`: Next.js would otherwise
// find this config, lint every file during the build, and fail the build over
// older files' problems. Linting is CI's lint job, on the files a PR changes.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/*.d.ts',
      'frontend/public/**',
      'docs/archive/**',
      // Cloud-sync conflict copies, e.g. "page 2.tsx". Same exclusion as
      // frontend/tsconfig.json.
      '**/* [0-9].*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // `_next` has to stay on Express error handlers, which Express tells
      // apart by their four arguments; `_` marks a value skipped on purpose.
      // An unused `catch (error)` is fine.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // passport-keycloak-oauth2-oidc ships no type definitions, so an import
      // of it cannot typecheck. Every other module must use import.
      '@typescript-eslint/no-require-imports': [
        'error',
        { allow: ['^passport-keycloak-oauth2-oidc$'] },
      ],
    },
  },
  {
    files: ['api/**/*.{ts,js}', '.github/**/*.mjs', '*.config.{js,mjs}', 'frontend/*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/**/*.{ts,tsx,js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
    },
  },
  {
    // globToRe uses a literal NUL as a placeholder for `**`, on purpose: no
    // glob can contain one.
    files: ['.github/review-bot/lib/scan.mjs'],
    rules: { 'no-control-regex': 'off' },
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: { globals: globals.node },
  }
);
