import { Crepe } from '@milkdown/crepe'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { throttle } from 'lodash-es'
import type { Ref } from 'vue'
import { ref, watchEffect } from 'vue'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { editorStateCtx } from '@milkdown/kit/core'

export function useCrepe(
  divRef: Ref<HTMLDivElement>,
  content: Ref<string>,
  onChange?: (markdown: string) => void,
) {
  const crepeRef = ref<Crepe>()
  const loading = ref(false)
  const total = ref(0)

  watchEffect(() => {
    const crepe = new Crepe({
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

  return {
    crepeRef,
    total,
  }
}
