import {
  linkTooltipAPI,
  linkTooltipState,
} from '@milkdown/components/link-tooltip'
import { editorViewCtx } from '@milkdown/core'
import { linkSchema } from '@milkdown/preset-commonmark'
import { useInstance } from '@milkdown/vue'

export function useLink() {
  const [_, get] = useInstance()

  const addLink = () => {
    get?.()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { selection, doc } = view.state
      if (selection.empty)
        return

      if (ctx.get(linkTooltipState.key).mode === 'edit')
        return

      const has = doc.rangeHasMark(
        selection.from,
        selection.to,
        linkSchema.type(ctx),
      )
      if (has)
        return
      ctx.get(linkTooltipAPI.key).addLink(selection.from, selection.to)
    })
  }
  return { addLink }
}
