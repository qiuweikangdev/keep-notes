import { Crepe } from '@milkdown/crepe'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { throttle } from 'lodash-es'
import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { editorStateCtx, editorViewCtx, parserCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { Slice } from '@milkdown/kit/prose/model'
import { outline } from '@milkdown/kit/utils'

const crepeRef = ref<Crepe>()
const loading = ref(false)
const total = ref(0)
const outlines = ref<{ text: string, level: number, id: string }[]>([])
let crepe: Crepe

export function useCrepe(
  divRef?: Ref<HTMLDivElement>,
  content?: Ref<string>,
  onChange?: (markdown: string) => void,
) {
  onMounted(() => {
    crepe = new Crepe({
      root: divRef?.value,
      defaultValue: content?.value,
      featureConfigs: {},
    })

    crepe.editor
      .config((ctx) => {
        ctx
          .get(listenerCtx)
          .markdownUpdated(
            throttle((_, markdown) => {
              total.value = ctx.get(editorStateCtx).doc.textContent.length || 0
              onChange?.(markdown)
            }, 200),
          )
          .mounted((ctx) => {
            outlines.value = outline()(ctx)
          })
          .markdownUpdated((ctx) => {
            const view = ctx.get(editorViewCtx)
            if (view.state?.doc) {
              outlines.value = outline()(ctx)
            }
          })
      })
      .use(listener)

    crepe.create().then(() => {
      crepeRef.value = crepe
      loading.value = false
    })
  })

  const updateContent = (content) => {
    crepe.editor.action((ctx: Ctx) => {
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

  watchEffect(() => {
    if (content?.value) {
      updateContent(content.value)
    }
  })

  onBeforeUnmount(() => {
    crepeRef.value?.destroy()
  })

  return {
    crepeRef,
    total,
    outlines,
  }
}
