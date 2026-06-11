# Diff对话框拖拽和调整大小优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化diff文件比对弹窗的拖拽体验，解决拖拽时的视觉反馈问题和resize时的冲突闪动问题。

**Architecture:** 使用React Context管理drag和resize状态，通过CSS变量协调状态，使用防抖机制避免快速切换。继续使用dnd-kit库，但优化其配置并移除视觉反馈。

**Tech Stack:** React, TypeScript, dnd-kit/core, CSS变量

---

## 文件结构

```
src/renderer/src/
├── components/
│   └── drag-resize-provider.tsx (新增)
├── hooks/
│   └── use-resizable-dialog.ts (修改)
├── pages/
│   └── home/
│       └── home-page.tsx (修改)
└── features/
    └── diff/
        └── components/
            └── diff-panel.tsx (可能修改)
```

## 任务分解

### Task 1: 创建DragResizeProvider

**Files:**
- Create: `src/renderer/src/components/drag-resize-provider.tsx`

- [ ] **Step 1: 创建DragResizeProvider上下文和类型定义**

```typescript
import { createContext, useContext, useCallback, useRef, useState, useEffect, type ReactNode } from "react";

interface DragResizeState {
  isDragging: boolean;
  isResizing: boolean;
}

interface DragResizeContextType extends DragResizeState {
  startDrag: () => void;
  endDrag: () => void;
  startResize: () => void;
  endResize: () => void;
  isIdle: boolean;
}

const DragResizeContext = createContext<DragResizeContextType | null>(null);

export function useDragResize() {
  const context = useContext(DragResizeContext);
  if (!context) {
    throw new Error("useDragResize must be used within a DragResizeProvider");
  }
  return context;
}
```

- [ ] **Step 2: 实现DragResizeProvider组件**

```typescript
interface DragResizeProviderProps {
  children: ReactNode;
  debounceMs?: number;
}

export function DragResizeProvider({ children, debounceMs = 100 }: DragResizeProviderProps) {
  const [state, setState] = useState<DragResizeState>({
    isDragging: false,
    isResizing: false,
  });
  
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const debouncedSetState = useCallback((newState: Partial<DragResizeState>) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, ...newState }));
    }, debounceMs);
  }, [debounceMs]);
  
  const startDrag = useCallback(() => {
    debouncedSetState({ isDragging: true });
  }, [debouncedSetState]);
  
  const endDrag = useCallback(() => {
    debouncedSetState({ isDragging: false });
  }, [debouncedSetState]);
  
  const startResize = useCallback(() => {
    debouncedSetState({ isResizing: true });
  }, [debouncedSetState]);
  
  const endResize = useCallback(() => {
    debouncedSetState({ isResizing: false });
  }, [debouncedSetState]);
  
  const isIdle = !state.isDragging && !state.isResizing;
  
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
  
  return (
    <DragResizeContext.Provider
      value={{
        ...state,
        startDrag,
        endDrag,
        startResize,
        endResize,
        isIdle,
      }}
    >
      {children}
    </DragResizeContext.Provider>
  );
}
```

- [ ] **Step 3: 验证DragResizeProvider功能**

```typescript
// 创建一个简单的测试组件来验证Provider
function TestComponent() {
  const { isDragging, isResizing, isIdle, startDrag, endDrag, startResize, endResize } = useDragResize();
  
  return (
    <div>
      <p>Dragging: {isDragging.toString()}</p>
      <p>Resizing: {isResizing.toString()}</p>
      <p>Idle: {isIdle.toString()}</p>
      <button onClick={startDrag}>Start Drag</button>
      <button onClick={endDrag}>End Drag</button>
      <button onClick={startResize}>Start Resize</button>
      <button onClick={endResize}>End Resize</button>
    </div>
  );
}
```

- [ ] **Step 4: 提交代码**

```bash
git add src/renderer/src/components/drag-resize-provider.tsx
git commit -m "feat: add DragResizeProvider for drag-resize state management"
```

### Task 2: 修改useResizableDialog Hook

**Files:**
- Modify: `src/renderer/src/hooks/use-resizable-dialog.ts`

- [ ] **Step 1: 导入DragResizeProvider**

```typescript
import { useDragResize } from "@/components/drag-resize-provider";
```

- [ ] **Step 2: 修改useResizableDialog函数**

```typescript
export function useResizableDialog(): ResizableDialogResult {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<ResizeSession | null>(null);
  const handlersRef = useRef<ResizableDialogResult["resizeHandleProps"]>(
    {} as never,
  );
  
  const { startResize, endResize } = useDragResize();

  const getHandlers = (direction: ResizeDirection) => {
    if (handlersRef.current[direction]) {
      return handlersRef.current[direction];
    }

    const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
      if (event.button !== 0 || !contentRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      sessionRef.current = {
        pointerId: event.pointerId,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startRect: captureGeometry(contentRef.current),
      };
      startResize();
    };

    const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (!contentRef.current) return;
      const next = computeNext(
        session.direction,
        session.startRect,
        event.clientX - session.startX,
        event.clientY - session.startY,
      );
      applyGeometry(contentRef.current, next);
    };

    const finish: PointerEventHandler<HTMLElement> = (event) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      sessionRef.current = null;
      endResize();
    };

    const handlers = {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    };
    handlersRef.current[direction] = handlers;
    return handlers;
  };

  // ... 其余代码保持不变
}
```

- [ ] **Step 3: 验证useResizableDialog修改**

运行类型检查：
```bash
pnpm typecheck
```

预期：无类型错误

- [ ] **Step 4: 提交代码**

```bash
git add src/renderer/src/hooks/use-resizable-dialog.ts
git commit -m "feat: integrate DragResizeProvider into useResizableDialog"
```

### Task 3: 修改DraggableHeader组件

**Files:**
- Modify: `src/renderer/src/pages/home/home-page.tsx` (DraggableHeader函数)

- [ ] **Step 1: 导入useDragResize**

```typescript
import { useDragResize } from "@/components/drag-resize-provider";
```

- [ ] **Step 2: 修改DraggableHeader组件**

```typescript
function DraggableHeader({
  fileName,
  canDiscard,
  canMove,
  onDiscard,
  onMoveToPanel,
  onDragEnd,
}: DraggableHeaderProps) {
  // 5px 激活阈值：用户点击按钮不会误触 drag，需移动 5px 才激活。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  // 保存 dnd-kit transform 的引用，避免 React render 时引用变化。
  const lastTransformRef = useRef<DialogOffset>({ x: 0, y: 0 });
  
  const { startDrag, endDrag, isResizing } = useDragResize();

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: "diff-dialog-header",
  });

  // 每次 transform 变化时缓存最后一次位移，drag 结束后一次性提交。
  if (transform) {
    lastTransformRef.current = { x: transform.x, y: transform.y };
  }

  const handleDragStart = () => {
    startDrag();
  };

  const handleDragEnd = (_event: DragEndEvent) => {
    const final = lastTransformRef.current;
    if (final.x !== 0 || final.y !== 0) {
      onDragEnd(final);
      lastTransformRef.current = { x: 0, y: 0 };
    }
    endDrag();
  };

  // 拖拽中：把 dnd-kit 的 transform 叠加到 inline transform 之外不能直接合并
  // （dnd-kit 会通过 setNodeRef 设置元素 transform，需要由我们与外层 dialogOffset 配合）。
  // 这里仅渲染 dnd-kit 的实时 transform，落盘到 state 后由外层 dialogOffset 接管。
  const dragStyle: React.CSSProperties | undefined = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        cursor: "default",
      }
    : { cursor: "default" };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="relative z-10 flex flex-shrink-0 select-none items-center justify-between border-b border-[var(--border-color)] px-4 py-3 pr-12"
      style={dragStyle}
    >
      {/* ... 其余代码保持不变 */}
    </div>
  );
}
```

- [ ] **Step 3: 验证DraggableHeader修改**

运行类型检查：
```bash
pnpm typecheck
```

预期：无类型错误

- [ ] **Step 4: 提交代码**

```bash
git add src/renderer/src/pages/home/home-page.tsx
git commit -m "feat: integrate DragResizeProvider into DraggableHeader"
```

### Task 4: 修改HomePage组件

**Files:**
- Modify: `src/renderer/src/pages/home/home-page.tsx` (HomePage函数)

- [ ] **Step 1: 导入DragResizeProvider**

```typescript
import { DragResizeProvider } from "@/components/drag-resize-provider";
```

- [ ] **Step 2: 包装DragResizeProvider**

```typescript
export function HomePage() {
  // ... 现有代码
  
  return (
    <DragResizeProvider>
      <div
        className="flex flex-col h-screen overflow-hidden relative"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          borderRadius: isMac ? "0" : isMaximized ? "0" : "8px",
        }}
      >
        {/* ... 其余代码保持不变 */}
      </div>
    </DragResizeProvider>
  );
}
```

- [ ] **Step 3: 验证HomePage修改**

运行类型检查：
```bash
pnpm typecheck
```

预期：无类型错误

- [ ] **Step 4: 提交代码**

```bash
git add src/renderer/src/pages/home/home-page.tsx
git commit -m "feat: wrap HomePage with DragResizeProvider"
```

### Task 5: 测试和优化

**Files:**
- 测试文件：无（手动测试）

- [ ] **Step 1: 测试拖拽功能**

1. 启动应用：`pnpm dev`
2. 打开diff对话框
3. 在头部区域拖拽对话框
4. 验证：
   - 光标保持默认箭头
   - 无视觉反馈（阴影、透明度变化）
   - 拖拽流畅

- [ ] **Step 2: 测试resize功能**

1. 在对话框边缘调整大小
2. 验证：
   - 不会触发拖拽
   - 无视觉闪烁
   - 调整大小流畅

- [ ] **Step 3: 测试同时操作**

1. 在resize期间开始drag
2. 验证：
   - 两种操作可以同时进行
   - 无状态冲突
   - 无视觉异常

- [ ] **Step 4: 性能优化**

1. 检查是否有不必要的重渲染
2. 优化CSS变量使用
3. 确保防抖机制正常工作

- [ ] **Step 5: 最终提交**

```bash
git add .
git commit -m "feat: complete diff dialog drag-resize optimization"
```

## 验证标准

1. 拖拽时显示箭头光标，无其他视觉反馈
2. resize时不会触发拖拽
3. drag和resize可以同时进行
4. 无视觉闪烁
5. 性能良好，无卡顿

## 风险评估

1. **低风险**：修改现有组件，不涉及新功能
2. **中风险**：需要协调drag和resize事件
3. **低风险**：使用现有的dnd-kit库

## 时间估算

1. 创建DragResizeProvider：2小时
2. 修改useResizableDialog：1小时
3. 修改DraggableHeader：1小时
4. 修改HomePage：1小时
5. 测试和优化：2小时
**总计：7小时**