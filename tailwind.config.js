/** @type {import('tailwindcss').Config} */
import { darkConfig, lightConfig } from './src/renderer/src/config/theme'

export default {
  mode: 'jit',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'selector',
  theme: {
    extend: {
      colors: {
        'color-primary': lightConfig.colorPrimary,
      },
      backgroundColor: {
        'color-primary': lightConfig.colorPrimary,
        'color-secondary': lightConfig.colorSecondary,
        'color-secondary-hover': lightConfig.colorSecondaryHover,
        'color-container': lightConfig.colorBgContainer,
        'dark:color-secondary': darkConfig.colorSecondary,
        'dark-color-container': darkConfig.colorBgContainer,
        'dark-color-icon': darkConfig.colorBgIcon,
        'dark-color-hover': darkConfig.colorPrimaryBgHover,
      },
      borderColor: {
        'dark-color': darkConfig.colorBorder,
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
