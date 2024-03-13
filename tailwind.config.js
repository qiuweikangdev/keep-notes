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
        'color-icon': lightConfig.colorIcon,
        'color-primary-hover': lightConfig.colorPrimaryHover,
        'dark-color-icon': darkConfig.colorIcon,
      },
      backgroundColor: {
        'color-primary': lightConfig.colorPrimary,
        'color-secondary': lightConfig.colorSecondary,
        'color-secondary-hover': lightConfig.colorSecondaryHover,
        'color-container': lightConfig.colorBgContainer,
        'color-action-bar': lightConfig.colorBgActionBar,
        'color-icon': lightConfig.colorBgIcon,
        'dark-color-secondary': darkConfig.colorSecondary,
        'dark-color-container': darkConfig.colorBgContainer,
        'dark-color-icon': darkConfig.colorBgIcon,
        'dark-color-hover': darkConfig.colorPrimaryBgHover,
        'dark-color-action-bar': darkConfig.colorBgActionBar,
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
