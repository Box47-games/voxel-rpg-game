// ESLint 9 flat config (converted from the old eslintConfig in package.json,
// same rules). Lints src/ only; see "lint" in package.json.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['build/**', 'node_modules/**'] },
  {
    files: ['**/*.{js,jsx}'],
    linterOptions: {
      // ESLint 9 started warning about these by default; ESLint 8 didn't
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      // react-hooks 7's "recommended" adds the React Compiler rules, which
      // this codebase doesn't follow yet; keep the two classic hook rules.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // ESLint 9 also reports unused catch parameters; ESLint 8 didn't
      'no-unused-vars': ['warn', { caughtErrors: 'none' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react/no-unknown-property': 'off', // R3F props
    },
  },
  {
    files: [
      'src/**/__tests__/**',
      'src/**/*.test.{js,jsx}',
      'src/__mocks__/**',
      'src/setupTests.js',
      'src/test-utils.js',
      'src/components/3d/testSetup.js',
    ],
    languageOptions: { globals: { ...globals.vitest } },
  },
];
