import panelConfig from '@renderer/config/panel'
import type { Ref } from 'vue'
import { nextTick, ref } from 'vue'
import type * as CSS from 'csstype'

export type PanelConfig = {
  panelHeight: Ref<number>
  panelSize: Ref<number>
}

export default function useHome() {
  const panelSize = ref<number>(panelConfig.leftPanelSize)
  const leftPanelSizeRef = ref()
  const leftWidth = ref<number>(0)
  const leftPanelStyle = ref<CSS.Properties>({})
  const rightPanelStyle = ref<CSS.Properties>({})
  const panelHeight = ref<number>(window.innerHeight - 40)
  const settingsModalVisible = ref(false)

  let preLeftPanelSize = 0

  function handleToggleCollapse(collapsed) {
    if (collapsed) {
      preLeftPanelSize = panelSize.value
      panelSize.value = 0
    }
    else {
      panelSize.value
        = preLeftPanelSize <= 10 ? panelConfig.leftPanelSize : preLeftPanelSize
    }
    leftPanelStyle.value = { transition: 'width .2s ease-out' }
    rightPanelStyle.value = { transition: 'width .2s ease-out' }
  }

  function handlePanelResize(value: { size: number }[]) {
    const [minValue] = value
    leftPanelStyle.value = { width: `${minValue.size}%` }
    rightPanelStyle.value = {}
    panelSize.value = minValue.size
    getPanelWidth()
  }

  async function getPanelWidth() {
    await nextTick()
    leftPanelStyle.value = {
      width: `${leftPanelSizeRef.value.$el.style.width}`,
    }
    leftWidth.value = leftPanelSizeRef.value.$el.clientWidth
  }

  function handleWinResize() {
    if (leftPanelSizeRef.value?.$el) {
      const leftWidth = leftPanelSizeRef.value.$el.clientWidth
      rightPanelStyle.value = {
        width: `${window.innerWidth - leftWidth}px`,
      }
      leftPanelStyle.value.width = `${leftWidth}px`
    }
    panelHeight.value = window.innerHeight - 40
  }

  function handleSettings() {
    settingsModalVisible.value = true
  }

  return {
    panelSize,
    leftPanelSizeRef,
    leftWidth,
    leftPanelStyle,
    rightPanelStyle,
    panelHeight,
    settingsModalVisible,
    handleToggleCollapse,
    handlePanelResize,
    handleWinResize,
    handleSettings,
    getPanelWidth,
  }
}
