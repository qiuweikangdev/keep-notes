import { Ctx } from '@milkdown/ctx'
import { usePluginViewFactory } from '@prosemirror-adapter/vue'
import TableTooltip from '../table-tooltip.vue'
import { TooltipProvider, tooltipFactory } from '@milkdown/plugin-tooltip'
import { $ctx } from '@milkdown/utils'

export const tableTooltip = tooltipFactory('TableTooltip')

export const tableTooltipCtx = $ctx<TooltipProvider | null, 'tableTooltip'>(null, 'tableTooltip')

export const useTableTooltip = () => {
  const pluginViewFactory = usePluginViewFactory()
  return {
    plugins: tableTooltip,
    config: (ctx: Ctx) => {
      ctx.set(tableTooltip.key, {
        view: pluginViewFactory({
          component: TableTooltip
        })
      })
    }
  }
}
