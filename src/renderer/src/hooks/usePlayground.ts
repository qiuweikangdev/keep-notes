import type { Ref } from 'vue'
import { ref, watch } from 'vue'
import {
  Editor,
  defaultValueCtx,
  editorStateCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  parserCtx,
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
import {
  configureLinkTooltip,
  linkTooltipPlugin,
} from '@milkdown/components/link-tooltip'
import { Slice } from '@milkdown/prose/model'

export function usePlayground(
  content: Ref<string>,
  onChange?: (markdown: string) => void,
) {
  const nodeViewFactory = useNodeViewFactory()
  const pluginViewFactory = usePluginViewFactory()
  const widgetViewFactory = useWidgetViewFactory()
  const tableTooltip = useTableTooltip()

  const tooltipSlash = slashFactory('Commands')

  const ctxRef = ref<Ctx>()
  const total = ref(0)

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
        ctx.set(defaultValueCtx, content.value)
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          total.value = ctx.get(editorStateCtx).doc.textContent.length || 0
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
        configureLinkTooltip(ctx)
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
      .use(linkTooltipPlugin)
      .use(
        $view(codeBlockSchema.node, () =>
          nodeViewFactory({
            // 自定义代码块
            component: CodeBlock,
          })),
      )
  })

  const autoFocus = () => {
    ctxRef.value?.get(editorViewCtx)?.dom?.focus()
  }

  const updateContent = (content) => {
    editorInfo?.get()?.action((ctx: Ctx) => {
      const view = ctx.get(editorViewCtx)
      const parser = ctx.get(parserCtx)
      const doc = parser(content || '')
      if (!doc)
        return
      const state = view.state
      view.dispatch(
        state.tr.replace(
          0,
          state.doc.content.size,
          new Slice(doc.content, 0, 0),
        ),
      )
    })
  }

  watch(content, (v) => {
    updateContent(v)
  })

  watch([editorInfo], () => {
    requestAnimationFrame(() => {
      const effect = async () => {
        const editor = editorInfo?.get()
        if (editor) {
          await editor.create()
          autoFocus()
        }
      }
      effect().catch((e) => {
        console.error(e)
      })
    })
  })

  return {
    editorInfo,
    updateContent,
    autoFocus,
    total,
  }
}
