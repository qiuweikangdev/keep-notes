# Radix UI 统一导入重构完成

## 重构内容

已将所有 Radix UI 组件的导入方式统一，通过 `@/lib/radix.ts` 文件集中管理。

---

## 新增文件

### `src/renderer/src/lib/radix.ts`

统一导出所有 Radix UI 组件：

```typescript
// Context Menu
export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  // ...
} from '@radix-ui/react-context-menu'

// Dialog
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  // ...
} from '@radix-ui/react-dialog'

// Dropdown Menu
export {
  DropdownMenu,
  DropdownMenuTrigger,
  // ...
} from '@radix-ui/react-dropdown-menu'

// Label
export { Label } from '@radix-ui/react-label'

// Slot
export { Slot } from '@radix-ui/react-slot'

// Tabs
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@radix-ui/react-tabs'

// Tooltip
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@radix-ui/react-tooltip'
```

---

## 更新的文件

### UI 组件

所有 UI 组件现在使用统一的导入方式：

**Before:**
```tsx
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
```

**After:**
```tsx
import {
  ContextMenu as ContextMenuPrimitive,
  ContextMenuTrigger as ContextMenuTriggerPrimitive,
  // ...
} from '@/lib/radix'
```

### 更新的组件文件

1. `components/ui/button.tsx` - 使用 `Slot` 从 `@/lib/radix`
2. `components/ui/context-menu.tsx` - 使用统一导入
3. `components/ui/dialog.tsx` - 使用统一导入
4. `components/ui/label.tsx` - 使用统一导入
5. `components/ui/tabs.tsx` - 使用统一导入
6. `components/ui/tooltip.tsx` - 使用统一导入

---

## 依赖包

```json
{
  "@radix-ui/react-context-menu": "^2.2.0",
  "@radix-ui/react-dialog": "^1.1.0",
  "@radix-ui/react-dropdown-menu": "^2.1.0",
  "@radix-ui/react-label": "^2.1.0",
  "@radix-ui/react-slot": "^1.1.0",
  "@radix-ui/react-tabs": "^1.1.0",
  "@radix-ui/react-tooltip": "^1.1.0"
}
```

---

## 优势

1. **统一管理**：所有 Radix UI 组件从一个文件导入
2. **易于维护**：修改导入路径只需改一个文件
3. **类型安全**：完整的 TypeScript 类型支持
4. **代码清晰**：组件文件更专注于业务逻辑

---

## 使用方式

```tsx
// 在组件中使用
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
```

所有组件内部已经通过 `@/lib/radix` 统一导入 Radix UI 原语。
