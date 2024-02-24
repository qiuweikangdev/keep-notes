import type { Ref } from 'vue'
import { ref, watch, watchEffect } from 'vue'
import {
  Editor,
  defaultValueCtx,
  editorStateCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx,
} from '@milkdown/core'
import type { Ctx } from '@milkdown/ctx'
import { clipboard } from '@milkdown/plugin-clipboard'
import { cursor } from '@milkdown/plugin-cursor'
import { history } from '@milkdown/plugin-history'
import { indent } from '@milkdown/plugin-indent'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { block } from '@milkdown/plugin-block'
import { prism, prismConfig } from '@milkdown/plugin-prism'
import { trailing } from '@milkdown/plugin-trailing'
import { upload } from '@milkdown/plugin-upload'
import { codeBlockSchema, commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { useEditor } from '@milkdown/vue'
import { nord } from '@milkdown/theme-nord'
import { $view } from '@milkdown/utils'
import { emoji } from '@milkdown/plugin-emoji'
import {
  useNodeViewFactory,
  usePluginViewFactory,
  useWidgetViewFactory,
} from '@prosemirror-adapter/vue'
import { slashFactory } from '@milkdown/plugin-slash'
import { refractor } from 'refractor/lib/common'
import CodeBlock from '@renderer/components/md-editor/CodeBlock.vue'
import Slash from '@renderer/components/md-editor/Slash.vue'
import Block from '@renderer/components/md-editor/Block.vue'
import {
  tableSelectorPlugin,
  tableTooltipCtx,
  useTableTooltip,
} from '@renderer/components/md-editor/table-widget/plugins'

export function usePlayground(
  defaultValue: Ref<string>,
  onChange?: (markdown: string) => void,
) {
  const nodeViewFactory = useNodeViewFactory()
  const pluginViewFactory = usePluginViewFactory()
  const widgetViewFactory = useWidgetViewFactory()
  const tableTooltip = useTableTooltip()

  const tooltipSlash = slashFactory('Commands')

  const ctxRef = ref<Ctx>()
  const size = ref(0)

  const editorInfo = useEditor((root) => {
    return Editor.make()
      .enableInspector()
      .config((ctx) => {
        ctxRef.value = ctx
        ctx.update(editorViewOptionsCtx, prev => ({
          ...prev,
          attributes: {
            class: 'mx-auto px-2 py-4 box-border',
          },
        }))
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, defaultValue.value)
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          size.value = ctx.get(editorStateCtx).doc.textContent.length || 0
          onChange?.(markdown)
        })
        ctx.update(prismConfig.key, prev => ({
          ...prev,
          configureRefractor: () => refractor,
        }))
        ctx.set(block.key, {
          view: pluginViewFactory({
            component: Block,
          }),
        })
        // 自定义斜杠命令
        ctx.set(tooltipSlash.key, {
          view: pluginViewFactory({
            component: Slash,
          }),
        })
        // 自定义
        tableTooltip.config(ctx)
      })
      .config(nord)
      .use(block)
      .use(tooltipSlash)
      .use(commonmark)
      .use(listener)
      .use(clipboard)
      .use(history)
      .use(cursor)
      .use(prism)
      .use(indent)
      .use(upload)
      .use(trailing)
      .use(emoji)
      .use(gfm)
      .use(tableTooltipCtx)
      .use(tableTooltip.plugins)
      .use(tableSelectorPlugin(widgetViewFactory))
      .use(
        $view(codeBlockSchema.node, () =>
          nodeViewFactory({
            // 自定义代码块
            component: CodeBlock,
          })),
      )
  })

  const { get } = editorInfo

  const autoFocus = () => {
    ctxRef.value?.get(editorViewCtx).dom.focus()
  }

  watchEffect(() => {
    requestAnimationFrame(() => {
      const effect = async () => {
        const editor = get()
        if (!editor)
          return
        await editor.create()
        autoFocus()
      }

      effect().catch((e) => {
        console.error(e)
      })
    })
  })

  watch(defaultValue, () => {
    onChange?.(defaultValue.value)
  })

  return {
    editorInfo,
    autoFocus,
    size,
  }
}
