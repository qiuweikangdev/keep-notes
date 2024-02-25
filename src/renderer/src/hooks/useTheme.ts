import { computed, onMounted, ref } from 'vue'
import { theme as antdTheme } from 'ant-design-vue'
import type { ThemeConfig } from 'ant-design-vue/es/config-provider/context'
import { themeConfigType } from '@renderer/config/theme'

export type ThemeName = 'light' | 'dark'

const theme = ref<ThemeName>(
  (localStorage.getItem('theme') as ThemeName) || 'light',
)

export default function useTheme() {
  const changeHtml = (t) => {
    const html = document.querySelector('html')
    if (html) {
      html.className = t
    }
  }

  const changeTheme = (t: ThemeName) => {
    theme.value = t
    localStorage.setItem('theme', t)
    changeHtml(t)
  }

  const getAlgorithm = (themes: ThemeName[] = []) =>
    themes.map((theme) => {
      if (theme === 'dark') {
        return antdTheme.darkAlgorithm
      }
      return antdTheme.defaultAlgorithm
    })

  const themeConfig = computed(() => {
    return {
      algorithm: getAlgorithm([theme.value]),
      token: {
        // motionDurationSlow: '0',
        // motionDurationMid: '0',
        colorBgContainer: themeConfigType[theme.value].colorBgContainer,
        colorPrimary: themeConfigType[theme.value].colorPrimary,
        colorTextLightSolid: themeConfigType[theme.value].colorText,
        colorPrimaryHover: themeConfigType[theme.value].colorPrimaryHover,
        colorPrimaryActive: themeConfigType[theme.value].colorPrimaryActive,
      },
      components: {
        Tooltip: {
          colorTextLightSolid: themeConfigType[theme.value].tooltipColorText,
        },
      },
    } as ThemeConfig
  })

  const { token } = antdTheme.useToken()

  const themeClass = computed(() => {
    return ['bg-white', 'dark:bg-[#23272E]', 'transition-all', 'duration-250']
  })

  onMounted(() => {
    changeHtml(localStorage.getItem('theme'))
  })

  return {
    theme,
    changeTheme,
    themeConfig,
    themeClass,
    token,
  }
}
