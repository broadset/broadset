const js = require('@eslint/js');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const importPlugin = require('eslint-plugin-import-x');
const simpleImportSortPlugin = require('eslint-plugin-simple-import-sort');
const unusedImportsPlugin = require('eslint-plugin-unused-imports');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const jsxA11yPlugin = require('eslint-plugin-jsx-a11y');
const sonarjsPlugin = require('eslint-plugin-sonarjs');
const eslintConfigPrettier = require('eslint-config-prettier');

// Test fixture restriction — tests/CT must use dedicated fixtures, not the demo sample document.
const sampleDocumentRestriction = {
  group: ['**/sampleDocument', '**/sampleDocument.ts', '**/sampleDocument.json'],
  message:
    'Tests and CT must use dedicated test fixtures from src/test-fixtures, not the demo sample document.',
};

// Package boundary map — see project/implementation/architecture.md.
// model    -> nothing
// playback -> model
// renderer -> model, playback
// editor   -> model, playback, renderer
// formats  -> model, playback
// ui       -> editor, formats, model, renderer (peer deps)
// demo     -> anything
const PACKAGE_BOUNDARIES = {
  model: ['playback', 'renderer', 'editor', 'formats', 'ui', 'demo'],
  playback: ['renderer', 'editor', 'formats', 'ui', 'demo'],
  renderer: ['editor', 'formats', 'ui', 'demo'],
  editor: ['formats', 'ui', 'demo'],
  formats: ['renderer', 'editor', 'ui', 'demo'],
  ui: ['playback', 'demo'],
};

function packageBoundaryConfigs() {
  return Object.entries(PACKAGE_BOUNDARIES).map(([pkg, forbidden]) => ({
    files: [`packages/${pkg}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: forbidden.map((p) => `@broadset/${p}`),
              message: `Package "${pkg}" violates the architecture boundary defined in project/implementation/architecture.md.`,
            },
          ],
        },
      ],
    },
  }));
}

// The sample document is production demo content; the restriction message
// explicitly targets tests/CT, so scope the rule to test files only instead of
// blocking the demo app's own imports of its own fixture.
const sampleDocumentRestrictionConfig = {
  files: ['**/*.test.{ts,tsx}', '**/ct/**/*.{ts,tsx}', '**/*.spec.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [sampleDocumentRestriction],
      },
    ],
  },
};

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
      // CI/dev utility scripts (e.g. veraPDF runner) that aren't part
      // of the package's source tree and don't need typechecking.
      '**/scripts/**',
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
        projectService: {
          allowDefaultProject: [
            'vitest.config.ts',
            'vitest.base.ts',
            'test/vitest.setup.ts',
            'packages/*/vitest.config.ts',
          ],
        },
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
      sonarjs: sonarjsPlugin,
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
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': true,
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'never',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-deprecated': 'error',
      // Tier-1 stylistic rules from typescript-eslint stylistic-type-checked.
      // We pull them individually instead of spreading the whole preset to
      // avoid the famously noisy `prefer-readonly-parameter-types` rule.
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/prefer-find': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/non-nullable-type-assertion-style': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      // Circular-dependency detection — uses the existing import-x plugin.
      'import/no-cycle': ['error', { maxDepth: 10, ignoreExternal: true }],
      // SonarJS code-smell detection — recommended preset.
      ...sonarjsPlugin.configs.recommended.rules,
      // Duplicates unused-imports/no-unused-vars (which honours our _prefix convention).
      'sonarjs/no-unused-vars': 'off',
      // Stylistic-only rules; don't earn their keep on this codebase. Real
      // bug-finders (no-dead-store, no-all-duplicated-branches, etc.) remain on.
      'sonarjs/prefer-regexp-exec': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-nested-template-literals': 'off',
      'sonarjs/function-return-type': 'off',
      // ReDoS detector flags too many safe patterns (anchored matches, classes
      // bounded by literals, single-`+` quantifiers). Replaced by the prose
      // guidance in agents/instructions/typescript.instructions.md.
      'sonarjs/slow-regex': 'off',
      // Conflicts with @typescript-eslint/no-non-null-assertion — the
      // non-null-assertion ban is stricter, keep that one.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
    },
  },

  // React + hooks + jsx-a11y for any TSX/JSX file.
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    settings: {
      // Pin to the installed React version. Using 'detect' crashes under
      // ESLint 10 + eslint-plugin-react 7.x (their version resolver calls
      // the removed `context.getFilename()` API).
      react: { version: '19.2' },
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.flatConfigs.recommended.rules,
      // React 17+ JSX runtime — no need to import React in scope.
      'react/react-in-jsx-scope': 'off',
      // TypeScript provides type checking; PropTypes are unused.
      'react/prop-types': 'off',
      // Experimental rule in eslint-plugin-react-hooks 6.x — high
      // false-positive rate on legitimate patterns (effect-based reducers,
      // sync state bridges). Disable until the rule stabilises.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Tests and CT helpers may use unbound methods (Jest matchers, mock helpers)
  // and object-literal type assertions (fixtures frequently construct
  // partial objects cast to a full type to avoid the ergonomic cost of
  // enumerating every required field).
  //
  // jsx-a11y and a few `react-hooks` / `sonarjs` rules are also disabled here
  // because test harnesses are not production UI: CT fixtures routinely attach
  // pointer handlers to plain divs to simulate interaction surfaces, and unit
  // tests declare inline Consumer components inside `it` blocks (idiomatic RTL,
  // flagged by `react-hooks/globals`). Production accessibility is the real
  // component's concern, not the harness's.
  {
    files: [
      '**/src/**/*.test.ts',
      '**/src/**/*.test.tsx',
      '**/ct/**/*.ts',
      '**/ct/**/*.tsx',
      '**/test-helpers.ts',
      '**/test-helpers.tsx',
    ],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      // Test fixtures legitimately use Math.random() for hash suffixes,
      // sample data, and so on; nothing security-sensitive.
      'sonarjs/pseudo-random': 'off',
      // Test harnesses simulate interactive surfaces on static elements; the
      // real components enforce a11y.
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/no-noninteractive-tabindex': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      // Inline Consumer components inside `it` blocks are idiomatic RTL and
      // duplicated setup across nearby test cases is often clearer than the
      // shared factory that would deduplicate it.
      'react-hooks/globals': 'off',
      'sonarjs/no-identical-functions': 'off',
    },
  },

  // Package boundary enforcement (project/implementation/architecture.md).
  ...packageBoundaryConfigs(),
  // The sample document is production demo content, not a test fixture. Only
  // test/CT files are restricted from importing it (message says as much).
  sampleDocumentRestrictionConfig,

  eslintConfigPrettier,
];
