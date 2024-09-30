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
        'nord-neutral': {
          DEFAULT: '#494E59',
          dark: '#EFF1F5',
        },
        'nord-neutral-deep': {
          DEFAULT: '#2E3440',
          dark: '#ECEFF4',
        },
        'nord-dim': {
          DEFAULT: '#ABAEB3',
          dark: '#F7F9FB',
        },
        'nord-solid': {
          DEFAULT: '#636C7D',
          dark: '#D8DEE9',
        },
        'nord-primary': '#5E81AC',
        'nord-secondary': '#CFDBE7',
        'nord-secondary-deep': '#81A1C1',
        'nord-secondary-dim': '#F0F4F8',
        'nord-outline': {
          DEFAULT: '#D8DEE9',
          dark: '#434C5E',
        },
        'nord-background': {
          DEFAULT: '#ECEFF4',
          dark: '#2E3440',
        },
        'nord-foreground': {
          DEFAULT: '#FFFFFF',
          dark: '#252932',
        },
      },
      backgroundColor: {
        'color-primary': lightConfig.colorPrimary,
        'color-secondary': lightConfig.colorSecondary,
        'color-secondary-hover': lightConfig.colorSecondaryHover,
        'color-container': lightConfig.colorBgContainer,
        'color-action-bar': lightConfig.colorBgActionBar,
        'color-icon': lightConfig.colorBgIcon,
        'color-scrollbar': lightConfig.scrollbarColor,
        'dark-color-secondary': darkConfig.colorSecondary,
        'dark-color-container': darkConfig.colorBgContainer,
        'dark-color-icon': darkConfig.colorBgIcon,
        'dark-color-hover': darkConfig.colorPrimaryBgHover,
        'dark-color-action-bar': darkConfig.colorBgActionBar,
        'dark-color-scrollbar': darkConfig.scrollbarColor,
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
