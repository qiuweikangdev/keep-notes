import { computed, nextTick, onMounted, ref } from 'vue'
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

  const setTheme = (t) => {
    localStorage.setItem('theme', t)
    theme.value = t
    changeHtml(t)
  }

  // eslint-disable-next-line ts/no-unsafe-function-type
  const animateTheme = (e: MouseEvent, themeCallback: Function) => {
    const x = e.clientX
    const y = e.clientY
    const endRadius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y),
    )

    const transition = document.startViewTransition(async () => {
      themeCallback?.()
      await nextTick()
    })

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]
      document.documentElement.animate(
        {
          clipPath: theme.value === 'dark' ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 400,
          easing: 'ease-out',
          pseudoElement:
            theme.value === 'dark'
              ? '::view-transition-old(root)'
              : '::view-transition-new(root)',
        },
      )
    })
  }

  const changeTheme = (e: MouseEvent, t: ThemeName) => {
    animateTheme(e, () => setTheme(t))
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
        Tree: {
          motionUnit: 0,
          motionDurationSlow: '0s',
          motionDurationFast: '0s',
          motionDurationMid: '0s',
        },
        Menu: {
          colorItemBgSelected:
            themeConfigType[theme.value].menuColorItemBgSelected,
          colorItemTextSelected:
            themeConfigType[theme.value].menuColorItemTextSelected,
          colorItemTextHover:
            themeConfigType[theme.value].menuColorItemTextSelected,
          colorItemText: themeConfigType[theme.value].menuColorItemTextSelected,
        },
        Radio: {
          colorPrimary: themeConfigType[theme.value].radioColorPrimary,
        },
        Tabs: {
          colorPrimary: themeConfigType[theme.value].tabsColorPrimary,
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
