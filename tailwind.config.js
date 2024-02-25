/** @type {import('tailwindcss').Config} */
import { darkConfig, lightConfig } from './src/renderer/src/config/theme'

export default {
  mode: 'jit',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'selector',
  theme: {
    extend: {
      colors: {
        'color-primary': lightConfig.primary,
      },
      backgroundColor: {
        'color-primary': lightConfig.primary,
        'color-container': lightConfig.colorBgContainer,
        'dark-color-container': darkConfig.colorBgContainer,
        'dark-color-icon': darkConfig.colorBgIcon,
        'dark-color-hover': darkConfig.colorPrimaryBgHover,
      },
      borderColor: {
        'dark-color-border': darkConfig.colorBorder,
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
    require('tailwind-nord'),
  ],
  corePlugins: {
    // preflight: false
  },
}
