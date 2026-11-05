import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Money must stay in integers (PRD NFR-04): no float parsing in the rules,
// payload, coordinator or money code.
const noFloatMoney = {
  'no-restricted-globals': [
    'error',
    { name: 'parseFloat', message: 'Money is integer-only (NFR-04). Use bigint.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Number', property: 'parseFloat', message: 'Money is integer-only (NFR-04).' },
    { object: 'Math', property: 'round', message: 'Use floored bigint division (PRD §9.1).' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "CallExpression[callee.name='Number']",
      message: 'Do not convert money with Number(). Use bigint (NFR-04).',
    },
  ],
};

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'docs/planning/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node }, ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: [
      'packages/guard/src/rules/**/*.ts',
      'packages/shared/src/payload.ts',
      'packages/shared/src/money.ts',
      'packages/shared/src/pricing.ts',
      'packages/agents/src/coordinator.ts',
    ],
    rules: noFloatMoney,
  },
);
