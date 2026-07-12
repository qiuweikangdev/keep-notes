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

// 大文档块平均高度显著高于单行文本；更接近真实值可减少首轮测量与快速滚动时的挂载量。
const estimateBlockSize = () => 64;
const SYSTEM_COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
// 所有被动窗格共享一个只读系统主题源，避免重复执行全局主题副作用。
const systemColorSchemeListeners = new Set<() => void>();
let systemColorSchemeMedia: MediaQueryList | null = null;
let observedSystemColorSchemeMedia: MediaQueryList | null = null;

function getSystemColorSchemeMedia(): MediaQueryList | null {
  if (systemColorSchemeMedia) return systemColorSchemeMedia;
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return null;
  }
  systemColorSchemeMedia = window.matchMedia(SYSTEM_COLOR_SCHEME_QUERY);
  return systemColorSchemeMedia;
}

function publishSystemColorScheme(): void {
  for (const listener of Array.from(systemColorSchemeListeners)) listener();
}

function subscribeSystemColorScheme(listener: () => void): () => void {
  systemColorSchemeListeners.add(listener);
  if (systemColorSchemeListeners.size === 1) {
    const media = getSystemColorSchemeMedia();
    if (media) {
      media.addEventListener("change", publishSystemColorScheme);
      observedSystemColorSchemeMedia = media;
    }
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    systemColorSchemeListeners.delete(listener);
    if (systemColorSchemeListeners.size > 0) return;

    // 最后一个窗格卸载时按原始对象和处理器解绑，保证 HMR/重挂载身份安全。
    observedSystemColorSchemeMedia?.removeEventListener(
      "change",
      publishSystemColorScheme,
    );
    observedSystemColorSchemeMedia = null;
    systemColorSchemeMedia = null;
  };
}

function getSystemColorSchemeSnapshot(): boolean {
  return getSystemColorSchemeMedia()?.matches ?? false;
}

function subscribeStaticColorScheme(): () => void {
  return () => {};
}

function getLightColorSchemeSnapshot(): false {
  return false;
}

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

function getPointerBlock(
  target: Node | null,
  preview: HTMLElement,
): HTMLElement | null {
  if (!target) return null;
  const element =
    target.nodeType === Node.ELEMENT_NODE
      ? (target as Element)
      : target.parentElement;
  const block = element?.closest<HTMLElement>("[data-block-id]") ?? null;
  return block && preview.contains(block) ? block : null;
}

function resolvePointerAnchor(
  event: PointerEvent<HTMLDivElement>,
): RichPreviewAnchor | null {
  const preview = event.currentTarget;
  const ownerDocument = preview.ownerDocument as CaretDocument;
  const eventTarget = toNode(event.nativeEvent.target) ?? toNode(event.target);
  const pointerBlock = getPointerBlock(eventTarget, preview);

  if (!pointerBlock) return null;

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
  if (
    caretPosition &&
    getPointerBlock(caretPosition.offsetNode, preview) === pointerBlock
  ) {
    return resolveRichPreviewAnchor(
      caretPosition.offsetNode,
      caretPosition.offset,
    );
  }

  const caretRange = ownerDocument.caretRangeFromPoint?.(
    event.clientX,
    event.clientY,
  );
  if (
    caretRange &&
    getPointerBlock(caretRange.startContainer, preview) === pointerBlock
  ) {
    return resolveRichPreviewAnchor(
      caretRange.startContainer,
      caretRange.startOffset,
    );
  }

  return resolveRichPreviewAnchor(pointerBlock, 0);
}

export function VirtualRichPreview({
  paneKey,
  cache,
  onActivate,
}: VirtualRichPreviewProps) {
  const appearance = useEditorStore((state) => state.appearance);
  const theme = useUIStore((state) => state.theme);
  const observesSystemColorScheme = theme === "system";
  const systemIsDark = useSyncExternalStore(
    observesSystemColorScheme
      ? subscribeSystemColorScheme
      : subscribeStaticColorScheme,
    observesSystemColorScheme
      ? getSystemColorSchemeSnapshot
      : getLightColorSchemeSnapshot,
    getLightColorSchemeSnapshot,
  );
  const colorScheme =
    theme === "system"
      ? systemIsDark
        ? "dark"
        : "light"
      : theme === "light"
        ? "light"
        : "dark";
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredScrollRef = useRef<{
    paneKey: RichPaneKey;
    scrollTop: number;
  } | null>(null);
  const subscribe = useCallback(
    (listener: () => void) => cache.subscribe(listener),
    [cache],
  );
  const getSnapshot = useCallback(() => cache.getSnapshot(), [cache]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const getItemKey = useCallback(
    (index: number) => snapshot.order[index] ?? index,
    [snapshot.order],
  );
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: snapshot.order.length,
    getScrollElement,
    getItemKey,
    estimateSize: estimateBlockSize,
    overscan: 4,
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
        height: "100%",
        lineHeight: appearance.lineHeight,
        minHeight: 0,
        opacity: appearance.opacity / 100,
        width: "100%",
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
    const scrollTop = richPaneViewStateRegistry.read(paneKey).scrollTop;
    restoredScrollRef.current = { paneKey, scrollTop };
    preview.scrollTop = scrollTop;
  }, [paneKey]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const scrollTop = event.currentTarget.scrollTop;
      const restoredScroll = restoredScrollRef.current;
      if (
        restoredScroll?.paneKey === paneKey &&
        restoredScroll.scrollTop === scrollTop
      ) {
        restoredScrollRef.current = null;
        return;
      }
      restoredScrollRef.current = null;
      if (richPaneViewStateRegistry.read(paneKey).scrollTop === scrollTop) {
        return;
      }
      richPaneViewStateRegistry.patch(paneKey, {
        scrollTop,
      });
    },
    [paneKey],
  );
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button > 0) return;
      // 阻止浏览器随后把焦点放回即将隐藏的预览层，避免真实编辑器先聚焦再失焦并重复整树布局。
      event.preventDefault();
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
      data-color-scheme={colorScheme}
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
