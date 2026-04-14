const js = require('@eslint/js');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const importPlugin = require('eslint-plugin-import-x');
const simpleImportSortPlugin = require('eslint-plugin-simple-import-sort');
const unusedImportsPlugin = require('eslint-plugin-unused-imports');
const eslintConfigPrettier = require('eslint-config-prettier');

const commonImportRules = {
  'import/first': 'error',
  'import/newline-after-import': ['error', { count: 1 }],
  'import/no-duplicates': 'error',
  'simple-import-sort/imports': 'error',
  'simple-import-sort/exports': 'error',
};

const commonQualityRules = {
  'no-unneeded-ternary': 'error',
  'padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: '*', next: 'block-like' },
    { blankLine: 'always', prev: '*', next: 'return' },
    { blankLine: 'always', prev: '*', next: ['const', 'let', 'var'] },
    { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
    { blankLine: 'always', prev: 'import', next: '*' },
    { blankLine: 'any', prev: 'import', next: 'import' },
    { blankLine: 'always', prev: '*', next: 'export' },
    { blankLine: 'any', prev: 'export', next: 'export' },
  ],
};

module.exports = [
  js.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'playwright/.cache/**',
      '**/playwright/.cache/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['**/*.cjs', '**/test/**/*.js', 'test/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        projectService: true,
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      'simple-import-sort': simpleImportSortPlugin,
      'unused-imports': unusedImportsPlugin,
    },
    rules: {
      ...commonImportRules,
      ...commonQualityRules,
      ...tsPlugin.configs.recommended.rules,
      ...tsPlugin.configs['recommended-type-checked'].rules,
      ...tsPlugin.configs['strict-type-checked'].rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
      'eol-last': ['error', 'always'],
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
          allowTernary: true,
        },
      ],
      '@typescript-eslint/no-empty-object-type': [
        'error',
        {
          allowInterfaces: 'always',
        },
      ],
    },
  },
  {
    files: ['**/src/**/*.test.ts', '**/src/**/*.test.tsx', '**/ct/**/*.ts', '**/ct/**/*.tsx'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/sampleDocument', '**/sampleDocument.ts', '**/sampleDocument.json'],
              message:
                'Tests and CT must use dedicated test fixtures from src/test-fixtures, not the demo sample document.',
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
];
