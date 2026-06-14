# 侧边栏大纲功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现侧边栏头部切换功能，支持在"文件"和"大纲"视图之间切换，并实现大纲导航功能

**Architecture:** 修改侧边栏头部布局，添加视图切换按钮；新建大纲面板组件，从 BlockNote 编辑器提取标题结构；实现点击标题跳转到编辑器对应位置

**Tech Stack:** React, Zustand, BlockNote, Tailwind CSS, Lucide React Icons

---

## 文件结构

```
src/renderer/src/
  ├── store/editor.store.ts                    # 修改：添加 sidebarView 状态
  ├── features/file-tree/components/
  │   ├── file-tree.tsx                        # 修改：头部布局
  │   ├── outline-panel.tsx                    # 新建：大纲面板
  │   └── outline-heading-item.tsx             # 新建：大纲标题项
  └── features/editor/components/
      └── blocknote-editor.tsx                 # 修改：暴露 editor 实例
```

---

### Task 1: 修改 Editor Store 添加侧边栏视图状态

**Files:**
- Modify: `src/renderer/src/store/editor.store.ts:18-20, 120-125, 126-132, 166-170`

- [ ] **Step 1: 在 EditorAppearance 接口中添加 sidebarView 类型**

```typescript
// src/renderer/src/store/editor.store.ts:18-20
interface EditorAppearance {
  fontSize: number;
  lineHeight: number;
  opacity: number;
  padding: number;
  showModeSwitcher: boolean;
  sidebarView: "file" | "outline";  // 新增
}
```

- [ ] **Step 2: 在 defaultAppearance 中添加默认值**

```typescript
// src/renderer/src/store/editor.store.ts:126-132
const defaultAppearance: EditorAppearance = {
  fontSize: 16,
  lineHeight: 1.8,
  opacity: 100,
  padding: 0,
  showModeSwitcher: true,
  sidebarView: "file",  // 新增
};
```

- [ ] **Step 3: 在 EditorState 接口中添加 setSidebarView 方法**

```typescript
// src/renderer/src/store/editor.store.ts:120-125
setAppearance: (appearance: Partial<EditorAppearance>) => void;
setSidebarView: (view: "file" | "outline") => void;  // 新增
incrementReloadKey: () => void;
resetEditor: () => void;
resetTab: (groupId: string, tabId: string) => void;
```

- [ ] **Step 4: 在 create 函数中实现 setSidebarView**

```typescript
// src/renderer/src/store/editor.store.ts:166-170
setSidebarView: (view) =>
  set((state) => ({
    appearance: { ...state.appearance, sidebarView: view },
  })),
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/editor.store.ts
git commit -m "feat: add sidebarView state to editor store"
```

---

### Task 2: 创建大纲标题项组件

**Files:**
- Create: `src/renderer/src/features/file-tree/components/outline-heading-item.tsx`

- [ ] **Step 1: 创建 outline-heading-item.tsx**

```typescript
// src/renderer/src/features/file-tree/components/outline-heading-item.tsx
import { useCallback } from "react";

interface OutlineHeadingItemProps {
  id: string;
  text: string;
  level: number;
  onClick: (id: string) => void;
}

export function OutlineHeadingItem({
  id,
  text,
  level,
  onClick,
}: OutlineHeadingItemProps) {
  const handleClick = useCallback(() => {
    onClick(id);
  }, [id, onClick]);

  const indent = (level - 1) * 16;

  return (
    <button
      type="button"
      className="flex w-full items-center py-1 text-left text-[13px] transition-colors hover:bg-[var(--hover-bg)]"
      style={{
        paddingLeft: `${12 + indent}px`,
        paddingRight: "12px",
        color: "var(--text-primary)",
      }}
      onClick={handleClick}
    >
      <span className="truncate">{text}</span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/features/file-tree/components/outline-heading-item.tsx
git commit -m "feat: create outline heading item component"
```

---

### Task 3: 创建大纲面板组件

**Files:**
- Create: `src/renderer/src/features/file-tree/components/outline-panel.tsx`

- [ ] **Step 1: 创建 outline-panel.tsx**

```typescript
// src/renderer/src/features/file-tree/components/outline-panel.tsx
import { useMemo, useCallback } from "react";
import { Search, X } from "lucide-react";
import { OutlineHeadingItem } from "./outline-heading-item";

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface OutlinePanelProps {
  headings: Heading[];
  onHeadingClick: (id: string) => void;
}

export function OutlinePanel({
  headings,
  onHeadingClick,
}: OutlinePanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto py-2">
        {headings.length === 0 ? (
          <div
            className="px-3 py-2 text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            暂无标题
          </div>
        ) : (
          headings.map((heading) => (
            <OutlineHeadingItem
              key={heading.id}
              id={heading.id}
              text={heading.text}
              level={heading.level}
              onClick={onHeadingClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/features/file-tree/components/outline-panel.tsx
git commit -m "feat: create outline panel component"
```

---

### Task 4: 修改侧边栏头部布局

**Files:**
- Modify: `src/renderer/src/features/file-tree/components/file-tree.tsx:1-30, 177-260`

- [ ] **Step 1: 更新导入语句，添加 ListTree 图标**

```typescript
// src/renderer/src/features/file-tree/components/file-tree.tsx:1-30
import {
  ChevronRight,
  FileText,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  ListTree,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  X,
} from "lucide-react";
```

- [ ] **Step 2: 从 editorStore 获取 sidebarView 和 setSidebarView**

```typescript
// src/renderer/src/features/file-tree/components/file-tree.tsx:80-90
const appearance = editorStore((s) => s.appearance);
const setSidebarView = editorStore((s) => s.setSidebarView);
const sidebarView = appearance.sidebarView;
```

- [ ] **Step 3: 修改头部布局，替换按钮**

```typescript
// src/renderer/src/features/file-tree/components/file-tree.tsx:177-260
return (
  <ContextMenu.Root>
    <ContextMenu.Trigger asChild>
      <div className="flex h-full flex-col">
        <div
          className="flex h-[42px] flex-shrink-0 items-center gap-1 px-2"
          style={{
            borderBottom: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <button
            type="button"
            className={TOOL_BUTTON_CLASS}
            style={{ color: "var(--text-muted)" }}
            title={sidebarView === "file" ? "切换到大纲" : "切换到文件"}
            onClick={() =>
              setSidebarView(sidebarView === "file" ? "outline" : "file")
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {sidebarView === "file" ? (
              <FolderOpen className="h-3.5 w-3.5" />
            ) : (
              <ListTree className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <span
              className="truncate text-[13px] font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {sidebarView === "file" ? "文件" : "大纲"}
            </span>
          </div>
          <button
            type="button"
            className={TOOL_BUTTON_CLASS}
            style={{ color: "var(--text-muted)" }}
            title={showSearch ? "关闭搜索" : "搜索"}
            onClick={handleToggleSearch}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {showSearch ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-auto py-2">
          {sidebarView === "file" ? (
            // 文件树内容
            showSearch ? (
              <div className="px-2 pb-2">
                <div className="relative">
                  <Search
                    className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                    style={{ color: "var(--text-muted)" }}
                  />
                  {/* 搜索输入框 */}
                </div>
              </div>
            ) : null
          ) : (
            // 大纲内容
            <OutlinePanel
              headings={headings}
              onHeadingClick={handleHeadingClick}
            />
          )}
        </div>
      </div>
    </ContextMenu.Trigger>
  </ContextMenu.Root>
);
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/features/file-tree/components/file-tree.tsx
git commit -m "feat: update sidebar header layout with view toggle"
```

---

### Task 5: 暴露 BlockNote Editor 实例并实现标题提取

**Files:**
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx:50-100, 240-260`

- [ ] **Step 1: 在 BlockNoteEditorInner 中添加标题提取和跳转逻辑**

```typescript
// src/renderer/src/features/editor/components/blocknote-editor.tsx:50-100
const editor = useCreateBlockNote({ initialContent: undefined });

// 提取标题的函数
const extractHeadings = useCallback(() => {
  const headings: Array<{ id: string; text: string; level: number }> = [];

  function walk(blocks: any[]) {
    for (const block of blocks) {
      if (block.type === "heading") {
        const text = (block.content as any[])
          ?.map((ic: any) => (ic.type === "text" ? ic.text : ""))
          .join("") ?? "";
        headings.push({
          id: block.id,
          text,
          level: block.props.level ?? 1,
        });
      }
      if (block.children?.length) {
        walk(block.children);
      }
    }
  }

  walk(editor.document);
  return headings;
}, [editor]);

// 跳转到指定块的函数
const scrollToBlock = useCallback(
  (blockId: string) => {
    const blockElement = editor.domElement?.querySelector(
      `[data-id="${blockId}"]`
    );
    if (blockElement) {
      blockElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  },
  [editor]
);

// 通过全局状态暴露给侧边栏
useEffect(() => {
  (window as any).__outlineHeadings = extractHeadings();
  (window as any).__scrollToBlock = scrollToBlock;
}, [extractHeadings, scrollToBlock, editor.document]);
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/features/editor/components/blocknote-editor.tsx
git commit -m "feat: expose editor headings and scroll functionality"
```

---

### Task 6: 在侧边栏中使用标题数据和跳转功能

**Files:**
- Modify: `src/renderer/src/features/file-tree/components/file-tree.tsx:1-50, 80-100`

- [ ] **Step 1: 添加标题状态和跳转处理函数**

```typescript
// src/renderer/src/features/file-tree/components/file-tree.tsx:1-50
import { useState, useEffect, useCallback } from "react";
```

```typescript
// src/renderer/src/features/file-tree/components/file-tree.tsx:80-100
const [headings, setHeadings] = useState<
  Array<{ id: string; text: string; level: number }>
>([]);

// 定期刷新标题列表
useEffect(() => {
  const refreshHeadings = () => {
    const newHeadings = (window as any).__outlineHeadings?.() ?? [];
    setHeadings(newHeadings);
  };

  refreshHeadings();
  const interval = setInterval(refreshHeadings, 1000);

  return () => clearInterval(interval);
}, []);

const handleHeadingClick = useCallback((id: string) => {
  (window as any).__scrollToBlock?.(id);
}, []);
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/features/file-tree/components/file-tree.tsx
git commit -m "feat: integrate heading data and scroll in sidebar"
```

---

### Task 7: 运行验证命令

- [ ] **Step 1: 运行类型检查**

```bash
pnpm typecheck
```

Expected: 无错误

- [ ] **Step 2: 运行代码检查**

```bash
pnpm lint
```

Expected: 无新增错误

- [ ] **Step 3: 运行构建**

```bash
pnpm build
```

Expected: 构建成功

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: implement sidebar outline navigation feature"
```

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2026-06-14-sidebar-outline-feature.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 我为每个任务分发一个新的子代理，任务之间进行审查，快速迭代

**2. Inline Execution** - 在当前会话中执行任务，批量执行并设置检查点

**请选择执行方式？**
