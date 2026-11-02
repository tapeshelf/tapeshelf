// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

// Attributes whose values are never user-visible text.
const NON_TEXT_ATTRIBUTES = [
  'routerLink',
  'tone',
  'class',
  'type',
  'href',
  'src',
  'viewBox',
  'd',
  'fill',
  'rx',
  'width',
  'height',
  'aria-hidden',
  'aria-labelledby',
  'autocomplete',
  'name',
  'id',
  'for',
  'role',
  'target',
  'rel',
  'inputmode',
  'enterkeyhint',
  'lang',
  'dir',
  'track',
  // component inputs and non-text HTML/SVG attributes
  'kind',
  'variant',
  'size',
  'appInput',
  'rows',
  'cols',
  'step',
  'min',
  'max',
  'maxlength',
  'minlength',
  'pattern',
  'accept',
  'autocapitalize',
  'spellcheck',
  'tabindex',
  'draggable',
  'loading',
  'decoding',
  'preload',
  'playsinline',
  'crossorigin',
  'aria-live',
  'aria-atomic',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'cx',
  'cy',
  'r',
  'x',
  'y',
  'points',
  'transform',
  'formControlName',
  'formGroupName',
  'routerLinkActive',
  'multiple',
  'value',
  'aria-valuemin',
  'aria-valuemax',
  'aria-valuenow',
  'aria-pressed',
  'aria-haspopup',
  'aria-expanded',
  'data-testid',
  'preload',
  'playsinline',
  'aria-multiselectable',
  'cdkDragLockAxis',
  'cdkMenuTriggerData',
  // brush strokes, animations and SVG scaling
  'seed',
  'animate.enter',
  'animate.leave',
  'preserveAspectRatio',
  'focusable',
  'strokeWidth',
  'vector-effect',
  // SVG arrowhead markers
  'markerUnits',
  'orient',
  'overflow',
  'marker-end',
];

const templateRules = {
  // All user-visible text must go through Transloco: bare text and literal title/placeholder/aria-* are errors.
  '@angular-eslint/template/i18n': [
    'error',
    {
      checkId: false,
      checkText: true,
      checkAttributes: true,
      ignoreAttributes: NON_TEXT_ATTRIBUTES,
      ignoreTags: ['code', 'pre', 'kbd'],
      // Allow bound text made only of interpolations, numbers and punctuation (e.g. "{{ count }} / {{ total }}").
      boundTextAllowedPattern: '^[\\s\\d\\W]*$',
    },
  ],
  '@angular-eslint/template/prefer-control-flow': 'error',
  '@angular-eslint/template/prefer-self-closing-tags': 'warn',
  // app-select is a form control too (shared/ui/select); the rule cannot see its inner button.
  '@angular-eslint/template/label-has-associated-control': [
    'error',
    { controlComponents: ['app-select'] },
  ],
};

module.exports = defineConfig([
  {
    // Generated API client (ng-openapi-gen) is not ours to lint.
    ignores: ['**/src/app/api/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/prefer-signals': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: templateRules,
  },
  {
    // Inline templates extracted by the processor get the same rules.
    files: ['**/*.ts/*.html'],
    rules: templateRules,
  },
  {
    // Test hosts may carry literal text (inline templates are extracted as *.spec.ts/*.html).
    files: ['**/*.spec.ts', '**/*.spec.ts/*.html'],
    rules: { '@angular-eslint/template/i18n': 'off' },
  },
  {
    // The host page is not an Angular template; its text is static and non-localized by design.
    files: ['**/src/index.html'],
    rules: { '@angular-eslint/template/i18n': 'off' },
  },
  {
    // The field wrapper associates its label with the projected control; the rule cannot see through ng-content.
    files: ['**/shared/ui/field/**'],
    rules: { '@angular-eslint/template/label-has-associated-control': 'off' },
  },
  {
    // App-wide code is in the first download: importing values through the api barrel would put every
    // API function there (esbuild splits chunks by imports, not by use). Import api/api, api/fn/…
    files: ['**/src/app/core/**/*.ts', '**/src/app/layout/**/*.ts', '**/src/app/shared/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./)+api$',
              allowTypeImports: true,
              message:
                'Import from api/api, api/fn/… or api/models/… (the barrel bloats the first download).',
            },
          ],
        },
      ],
    },
  },
]);
