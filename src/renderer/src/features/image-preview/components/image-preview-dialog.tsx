import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DialogResizeHandles } from "@/components/ui/dialog-resize-handles";
import { useResizableDialog } from "@/hooks/use-resizable-dialog";
import { useImagePreviewStore } from "../store/image-preview.store";
import { ImagePreview } from "./image-preview";
import { useTreeStore } from "@/store/tree.store";

export function ImagePreviewDialog() {
  const filePath = useImagePreviewStore((state) => state.filePath);
  const close = useImagePreviewStore((state) => state.close);
  const rootPath = useTreeStore((state) => state.treeRoot?.key);
  const normalizedPath = filePath?.replaceAll("\\", "/") ?? "";
  const normalizedRoot = rootPath?.replaceAll("\\", "/").replace(/\/+$/u, "");
  const displayPath =
    normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/`)
      ? normalizedPath.slice(normalizedRoot.length + 1)
      : normalizedPath;
  const { contentRef, dragHandleProps, resizeHandleProps } = useResizableDialog(
    {
      isOpen: filePath !== null,
    },
  );

  return (
    <Dialog.Root
      open={filePath !== null}
      onOpenChange={(open) => !open && close()}
    >
      <DialogContent
        ref={contentRef}
        className="image-preview-dialog h-[80vh] w-[88vw] max-w-[1200px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]"
        style={{
          display: "flex",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
        aria-describedby={undefined}
      >
        <div
          {...dragHandleProps}
          className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border-color)] px-4 py-3 pr-12"
        >
          <ImageIcon
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-[var(--accent-color)]"
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <Dialog.Title
              className="truncate text-sm font-medium"
              title={filePath?.split(/[\\/]/u).pop()}
            >
              {filePath?.split(/[\\/]/u).pop()}
            </Dialog.Title>
            <span
              className="truncate text-xs text-[var(--text-muted)]"
              title={displayPath}
            >
              {displayPath}
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {filePath ? (
            <LocalImagePreview key={filePath} filePath={filePath} />
          ) : null}
        </div>
        <DialogResizeHandles resizeHandleProps={resizeHandleProps} />
      </DialogContent>
    </Dialog.Root>
  );
}

function LocalImagePreview({ filePath }: { filePath: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // 图片通过窄 IPC 加载，不将本地文件访问能力交给渲染进程。
    void window.electronAPI.loadImageAsDataUrl(filePath).then(
      (result) => {
        if (cancelled) return;
        setSource(result);
        setIsLoading(false);
      },
      () => {
        if (!cancelled) setIsLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  if (isLoading) {
    return (
      <div
        role="status"
        className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]"
      >
        正在加载图片…
      </div>
    );
  }
  return (
    <ImagePreview
      source={source ?? ""}
      label={filePath.split(/[\\/]/u).pop() ?? "图片"}
      emptyMessage="图片无法加载，请检查文件是否存在或超过 20 MB"
    />
  );
}
