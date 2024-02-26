import type { FunctionalComponent } from 'vue'
import type { AntdIconProps } from '@ant-design/icons-vue/lib/components/AntdIcon'

type MenuAction = 'maximize' | 'minimize' | 'close'

interface MenuActionOptions {
  icon: FunctionalComponent<AntdIconProps> | string
  tooltip?: string
  command?: MenuAction
  handle?: (e?: MouseEvent) => void
}
