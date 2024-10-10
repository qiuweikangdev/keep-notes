import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  vue: {
    overrides: {
      'vue/block-order': [
        'error',
        {
          order: ['template', 'script', 'style'],
        },
      ],
      'vue/component-name-in-template-casing': [
        'error',
        'kebab-case',
        {
          registeredComponentsOnly: true,
          ignores: [],
        },
      ],
    },
  },
  rules: {
    'curly': 'off',
    'ts/consistent-type-definitions': ['interface' | 'type'],
  },
})
