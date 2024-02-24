/** @type {import('tailwindcss').Config} */
import { themeConfig } from './src/renderer/src/config/theme'

export default {
  mode: 'jit',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'color-primary': themeConfig.primary,
      },
      backgroundColor: {
        'color-primary': themeConfig.primary,
        'color-bg-container': themeConfig.colorBgContainer,
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
