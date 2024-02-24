import type { Ctx } from '@milkdown/ctx'
import { usePluginViewFactory } from '@prosemirror-adapter/vue'
import type { TooltipProvider } from '@milkdown/plugin-tooltip'
import { tooltipFactory } from '@milkdown/plugin-tooltip'
import { $ctx } from '@milkdown/utils'
import TableTooltip from '../table-tooltip.vue'

export const tableTooltip = tooltipFactory('TableTooltip')

export const tableTooltipCtx = $ctx<TooltipProvider | null, 'tableTooltip'>(
  null,
  'tableTooltip',
)

export function useTableTooltip() {
  const pluginViewFactory = usePluginViewFactory()
  return {
    plugins: tableTooltip,
    config: (ctx: Ctx) => {
      ctx.set(tableTooltip.key, {
        view: pluginViewFactory({
          component: TableTooltip,
        }),
      })
    },
  }
}
