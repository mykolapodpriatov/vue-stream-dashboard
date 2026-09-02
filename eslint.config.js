import js from '@eslint/js';
import { globalIgnores } from 'eslint/config';
import { vueTsConfigs, withVueTs } from '@vue/eslint-config-typescript';
import prettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import pluginVueA11y from 'eslint-plugin-vuejs-accessibility';

export default withVueTs(
  { rootDir: import.meta.dirname },

  globalIgnores(['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**']),

  js.configs.recommended,
  pluginVue.configs['flat/recommended'],
  // Template-level accessibility: labels, alt text, click handlers on
  // non-interactive elements. The mechanical third of the problem, caught at
  // lint time instead of in a Playwright run twenty minutes later.
  pluginVueA11y.configs['flat/recommended'],

  // Type-aware linting for `.ts` **and** `.vue`. `@vue/eslint-config-typescript`
  // owns the parser plumbing that makes this hold up for SFCs; the rules worth
  // having — no-floating-promises, no-unnecessary-condition, no-unsafe-* — all
  // need a type checker behind them.
  vueTsConfigs.strictTypeChecked,
  vueTsConfigs.stylisticTypeChecked,

  {
    files: ['**/*.{ts,vue}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      // Vue's own style guide: PascalCase in SFC templates so a component is
      // visually distinct from an HTML element.
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/block-lang': ['error', { script: { lang: 'ts' } }],
      'vue/define-macros-order': ['error', { order: ['defineProps', 'defineEmits'] }],
      'vue/no-unused-refs': 'error',
      'vue/prefer-true-attribute-shorthand': 'error',
      // Under `exactOptionalPropertyTypes`, an optional prop with no default is
      // the honest model of "the caller may not pass this": its type is
      // `T | undefined` and `withDefaults` cannot set it to `undefined`. The
      // rule predates that flag and would force a sentinel default instead.
      'vue/require-default-prop': 'off',
      // The plugin's default demands a `for`/`id` pair *and* nesting. Either
      // one associates a label with its control; requiring both only produces
      // ids nothing else references.
      'vuejs-accessibility/label-has-for': [
        'error',
        { required: { some: ['nesting', 'id'] } },
      ],
    },
  },

  {
    files: ['e2e/**/*.ts', 'bench/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      // `page.evaluate` results are typed by what the callback returns, but
      // the DOM reads inside it are untyped by nature.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Tests build rejected promises and empty stubs on purpose.
      '@typescript-eslint/no-empty-function': 'off',
    },
  },

  prettier,
);
