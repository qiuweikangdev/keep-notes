import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
  type UIEvent,
} from "react";

import { resolveTheme } from "@/config/themes";
import { useEditorStore } from "@/store/editor.store";
import { useUIStore } from "@/store/ui.store";
import { richPaneViewStateRegistry } from "@/features/editor/lib/editor-runtime";
import {
  resolveRichPreviewAnchor,
  type RichPreviewAnchor,
} from "@/features/editor/lib/rich-preview-anchor";
import type { RichPaneKey } from "@/features/editor/lib/rich-pane-view-state";
import type { RichPreviewCache } from "@/features/editor/lib/rich-preview-cache";

interface VirtualRichPreviewProps {
  paneKey: RichPaneKey;
  cache: RichPreviewCache;
  onActivate: (anchor: RichPreviewAnchor | null) => void;
}

interface VirtualRichPreviewBlockProps {
  cache: RichPreviewCache;
  id: string;
  index: number;
  measureElement: (element: HTMLDivElement | null) => void;
  start: number;
}

interface CaretPositionResult {
  offset: number;
  offsetNode: Node;
}

interface CaretDocument extends Document {
  caretPositionFromPoint?: (x: number, y: number) => CaretPositionResult | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

const estimateBlockSize = () => 36;

function usePreviewBlock(cache: RichPreviewCache, id: string) {
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribeBlock(id, listener),
    [cache, id],
  );
  const getSnapshot = useCallback(
    () => cache.getBlockSnapshot(id),
    [cache, id],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const VirtualRichPreviewBlock = memo(function VirtualRichPreviewBlock({
  cache,
  id,
  index,
  measureElement,
  start,
}: VirtualRichPreviewBlockProps) {
  const block = usePreviewBlock(cache, id);
  if (!block) return null;

  return (
    <div
      className="rich-virtual-preview__block"
      data-block-id={id}
      data-index={index}
      data-rich-preview-block=""
      ref={measureElement}
      style={{
        left: 0,
        position: "absolute",
        top: 0,
        transform: `translateY(${start}px)`,
      }}
      // HTML 来自路径级 BlockNote 实例的 blocksToFullHTML，预览层只消费可信缓存。
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
});

function toNode(target: EventTarget | null): Node | null {
  if (!target || typeof target !== "object" || !("nodeType" in target)) {
    return null;
  }
  return target as Node;
}

function resolvePointerAnchor(
  event: PointerEvent<HTMLDivElement>,
): RichPreviewAnchor | null {
  const preview = event.currentTarget;
  const ownerDocument = preview.ownerDocument as CaretDocument;
  const eventTarget = toNode(event.nativeEvent.target) ?? toNode(event.target);

  if (
    eventTarget?.nodeType === Node.ELEMENT_NODE &&
    (eventTarget as Element).closest("img")
  ) {
    return resolveRichPreviewAnchor(eventTarget, 0);
  }

  const caretPosition = ownerDocument.caretPositionFromPoint?.(
    event.clientX,
    event.clientY,
  );
  if (caretPosition && preview.contains(caretPosition.offsetNode)) {
    return resolveRichPreviewAnchor(
      caretPosition.offsetNode,
      caretPosition.offset,
    );
  }

  const caretRange = ownerDocument.caretRangeFromPoint?.(
    event.clientX,
    event.clientY,
  );
  if (caretRange && preview.contains(caretRange.startContainer)) {
    return resolveRichPreviewAnchor(
      caretRange.startContainer,
      caretRange.startOffset,
    );
  }

  return eventTarget ? resolveRichPreviewAnchor(eventTarget, 0) : null;
}

export function VirtualRichPreview({
  paneKey,
  cache,
  onActivate,
}: VirtualRichPreviewProps) {
  const appearance = useEditorStore((state) => state.appearance);
  const theme = useUIStore((state) => state.theme);
  const scrollRef = useRef<HTMLDivElement>(null);
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(listener),
    [cache],
  );
  const getSnapshot = useCallback(() => cache.getSnapshot(), [cache]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: snapshot.order.length,
    getScrollElement,
    estimateSize: estimateBlockSize,
    overscan: 8,
  });
  const previewStyle = useMemo(
    () =>
      ({
        "--editor-font-size": `${appearance.fontSize}px`,
        "--editor-line-height": appearance.lineHeight,
        "--editor-padding": `${appearance.padding}px`,
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontSize: `${appearance.fontSize}px`,
        lineHeight: appearance.lineHeight,
        opacity: appearance.opacity / 100,
      }) as CSSProperties,
    [
      appearance.fontSize,
      appearance.lineHeight,
      appearance.opacity,
      appearance.padding,
    ],
  );

  useLayoutEffect(() => {
    const preview = scrollRef.current;
    if (!preview) return;
    preview.scrollTop = richPaneViewStateRegistry.read(paneKey).scrollTop;
  }, [paneKey]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      richPaneViewStateRegistry.patch(paneKey, {
        scrollTop: event.currentTarget.scrollTop,
      });
    },
    [paneKey],
  );
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      onActivate(resolvePointerAnchor(event));
    },
    [onActivate],
  );

  return (
    <div
      aria-label="富文本预览"
      aria-multiline="true"
      aria-readonly="true"
      className="rich-virtual-preview bn-root"
      data-color-scheme={resolveTheme(theme)}
      data-testid="virtual-rich-preview"
      onPointerDown={handlePointerDown}
      onScroll={handleScroll}
      ref={scrollRef}
      role="textbox"
      style={previewStyle}
      tabIndex={0}
    >
      <div className="bn-editor">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const id = snapshot.order[virtualItem.index];
            return id ? (
              <VirtualRichPreviewBlock
                cache={cache}
                id={id}
                index={virtualItem.index}
                key={virtualItem.key}
                measureElement={virtualizer.measureElement}
                start={virtualItem.start}
              />
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
