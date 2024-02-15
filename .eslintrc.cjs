/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    '@electron-toolkit',
    '@electron-toolkit/eslint-config-ts/eslint-recommended',
    '@vue/eslint-config-typescript/recommended',
    '@vue/eslint-config-prettier'
  ],
  rules: {
    'no-var': 'error',
    'no-multiple-empty-lines': ['error', { max: 1 }],
    'prefer-const': 'off',
    'no-use-before-define': 'off',

    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-empty-function': 'error',
    '@typescript-eslint/prefer-ts-expect-error': 'error',
    '@typescript-eslint/ban-ts-comment': 'error',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',

    'vue/script-setup-uses-vars': 'error',
    'vue/v-slot-style': 'error',
    'vue/no-mutating-props': 'error',
    'vue/custom-event-name-casing': 'error',
    'vue/html-closing-bracket-newline': 'error',
    'vue/attribute-hyphenation': 'error',
    'vue/attributes-order': 'off',
    'vue/no-v-html': 'off',
    'vue/require-default-prop': 'off',
    'vue/multi-word-component-names': 'off',
    'vue/no-setup-props-destructure': 'off',
    'vue/component-name-in-template-casing': [
      'error',
      'kebab-case',
      {
        registeredComponentsOnly: false,
        ignores: []
      }
    ]
  }
}
