import { Crepe } from '@milkdown/crepe'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { throttle } from 'lodash-es'
import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { editorStateCtx, editorViewCtx, parserCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { Slice } from '@milkdown/kit/prose/model'

export function useCrepe(
  divRef: Ref<HTMLDivElement>,
  content: Ref<string>,
  onChange?: (markdown: string) => void,
) {
  const crepeRef = ref<Crepe>()
  const loading = ref(false)
  const total = ref(0)

  let crepe: Crepe

  onMounted(() => {
    crepe = new Crepe({
      root: divRef.value,
      defaultValue: content.value,
      featureConfigs: {},
    })

    crepe.editor
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated(
          throttle((_, markdown) => {
            total.value = ctx.get(editorStateCtx).doc.textContent.length || 0
            onChange?.(markdown)
          }, 200),
        )
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

  watch(content, (v) => {
    updateContent(v)
  })

  onBeforeUnmount(() => {
    crepeRef.value?.destroy()
  })

  return {
    crepeRef,
    total,
  }
}
