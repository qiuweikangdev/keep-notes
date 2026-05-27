# Keep Notes: Vue to React Migration Plan

## 1. Current Project Analysis

### Current Tech Stack
- **Electron**: 28.x
- **Vue**: 3.5.x with Composition API
- **State Management**: Pinia with persistence
- **Routing**: Vue Router 4.x
- **UI Framework**: Ant Design Vue 4.x
- **Styling**: Tailwind CSS 3.x + Less
- **Build Tool**: electron-vite
- **Markdown Editor**: Milkdown (Vue version)

### Core Business Features
1. **File Tree Management**
   - Directory browsing and selection
   - File/folder CRUD operations
   - Drag and drop support
   - Context menu actions

2. **Markdown Editor**
   - Milkdown-based rich text editing
   - Real-time content saving
   - Word count
   - Outline generation

3. **Git Integration**
   - Clone/pull repositories
   - Commit and push changes
   - GitHub configuration

4. **Theme System**
   - Light/Dark mode switching
   - Animated theme transitions
   - Custom color configuration

5. **Window Management**
   - Frameless window with custom controls
   - Minimize/maximize/close actions
   - Panel resizing with splitpanes

### Current Issues
1. **IPC Communication**: Scattered string-based channel names
2. **State Management**: Mixed concerns in stores
3. **Component Structure**: Large components with multiple responsibilities
4. **Type Safety**: Incomplete TypeScript coverage
5. **Security**: Some Node.js APIs exposed to renderer

---

## 2. New Project Structure

```
keep-notes/
├── src/
│   ├── main/                      # Electron Main Process
│   │   ├── index.ts               # App entry point
│   │   ├── window.ts              # Window creation and management
│   │   ├── ipc/                   # IPC handlers
│   │   │   ├── index.ts           # IPC registration
│   │   │   ├── file.ipc.ts        # File operations
│   │   │   ├── tree.ipc.ts        # Tree operations
│   │   │   └── git.ipc.ts         # Git operations
│   │   ├── menu/                  # Application menu
│   │   │   └── index.ts
│   │   ├── tray/                  # System tray
│   │   │   └── index.ts
│   │   ├── updater/               # Auto updater
│   │   │   └── index.ts
│   │   ├── shortcuts/             # Global shortcuts
│   │   │   └── index.ts
│   │   └── utils/                 # Main process utilities
│   │       ├── file.ts            # File system operations
│   │       ├── tree.ts            # Tree data operations
│   │       └── git.ts             # Git operations
│   │
│   ├── preload/                   # Preload Scripts
│   │   ├── index.ts               # Main preload entry
│   │   └── api/                   # API modules
│   │       ├── window.api.ts      # Window control APIs
│   │       ├── file.api.ts        # File operation APIs
│   │       ├── tree.api.ts        # Tree operation APIs
│   │       └── git.api.ts         # Git operation APIs
│   │
│   ├── renderer/                  # React Renderer Process
│   │   ├── index.html             # HTML entry
│   │   ├── src/
│   │   │   ├── app/               # App shell
│   │   │   │   ├── App.tsx        # Root component
│   │   │   │   ├── providers.tsx  # Context providers
│   │   │   │   └── layout.tsx     # Main layout
│   │   │   │
│   │   │   ├── pages/             # Route pages
│   │   │   │   └── home/          # Home page
│   │   │   │       ├── index.tsx
│   │   │   │       └── components/
│   │   │   │
│   │   │   ├── features/          # Feature modules
│   │   │   │   ├── editor/        # Markdown editor
│   │   │   │   │   ├── components/
│   │   │   │   │   ├── hooks/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── file-tree/     # File tree
│   │   │   │   │   ├── components/
│   │   │   │   │   ├── hooks/
│   │   │   │   │   └── index.ts
│   │   │   │   ├── settings/      # Settings
│   │   │   │   │   ├── components/
│   │   │   │   │   └── index.ts
│   │   │   │   └── git-sync/      # Git sync
│   │   │   │       ├── components/
│   │   │   │       ├── hooks/
│   │   │   │       └── index.ts
│   │   │   │
│   │   │   ├── components/        # Shared components
│   │   │   │   ├── ui/            # UI primitives (Radix-based)
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   ├── dialog.tsx
│   │   │   │   │   ├── dropdown.tsx
│   │   │   │   │   ├── tabs.tsx
│   │   │   │   │   ├── tooltip.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   └── layout/        # Layout components
│   │   │   │       ├── title-bar.tsx
│   │   │   │       └── status-bar.tsx
│   │   │   │
│   │   │   ├── hooks/             # Shared hooks
│   │   │   │   ├── use-electron.ts
│   │   │   │   ├── use-theme.ts
│   │   │   │   └── use-panel.ts
│   │   │   │
│   │   │   ├── store/             # Zustand stores
│   │   │   │   ├── tree.store.ts
│   │   │   │   ├── editor.store.ts
│   │   │   │   ├── user.store.ts
│   │   │   │   └── ui.store.ts
│   │   │   │
│   │   │   ├── lib/               # Utilities
│   │   │   │   ├── electron.ts    # Electron API wrapper
│   │   │   │   ├── utils.ts       # General utilities
│   │   │   │   └── cn.ts          # className utility
│   │   │   │
│   │   │   ├── styles/            # Global styles
│   │   │   │   ├── globals.css    # Global CSS
│   │   │   │   └── editor.css     # Editor styles
│   │   │   │
│   │   │   └── types/             # TypeScript types
│   │   │       ├── electron.d.ts  # Electron API types
│   │   │       ├── tree.ts        # Tree types
│   │   │       └── index.ts       # Shared types
│   │   │
│   │   └── index.tsx              # Renderer entry
│   │
│   └── shared/                    # Shared between processes
│       ├── types/                 # Shared types
│       │   ├── api.ts             # API response types
│       │   ├── ipc.ts             # IPC channel types
│       │   └── index.ts
│       └── constants/             # Shared constants
│           ├── ipc-channels.ts    # IPC channel names
│           └── index.ts
│
├── resources/                     # App resources
├── scripts/                       # Build scripts
├── electron-builder.yml           # Builder config
├── electron.vite.config.ts        # Vite config
├── tailwind.config.js             # Tailwind config
├── tsconfig.json                  # TypeScript config
├── package.json
└── pnpm-lock.yaml
```

---

## 3. IPC Communication Refactoring

### Current Issues
- String-based channel names scattered across files
- No type safety for IPC calls
- Mixed `ipcMain.handle` and `ipcMain.on` patterns

### New IPC Architecture

#### IPC Channel Constants (`src/shared/constants/ipc-channels.ts`)
```typescript
export const IPC_CHANNELS = {
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
  },
  FILE: {
    READ: 'file:read',
    WRITE: 'file:write',
    OPEN_DIALOG: 'file:open-dialog',
    GET_SELECTED_PATH: 'file:get-selected-path',
  },
  TREE: {
    GENERATE: 'tree:generate',
    CREATE_FILE: 'tree:create-file',
    CREATE_FOLDER: 'tree:create-folder',
    RENAME: 'tree:rename',
    DELETE: 'tree:delete',
    MOVE: 'tree:move',
  },
  GIT: {
    DOWNLOAD: 'git:download',
    UPLOAD: 'git:upload',
  },
} as const
```

#### IPC Type Definitions (`src/shared/types/ipc.ts`)
```typescript
import { IPC_CHANNELS } from '../constants/ipc-channels'

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS][keyof typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]]

export interface IpcRequestMap {
  [IPC_CHANNELS.FILE.READ]: { path: string }
  [IPC_CHANNELS.FILE.WRITE]: { path: string; content: string }
  // ... other mappings
}

export interface IpcResponseMap {
  [IPC_CHANNELS.FILE.READ]: string
  [IPC_CHANNELS.FILE.WRITE]: void
  // ... other mappings
}
```

#### Preload API (`src/preload/api/file.api.ts`)
```typescript
import { ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants/ipc-channels'

export const fileApi = {
  readFile: (path: string): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.READ, path)
  },
  
  writeFile: (path: string, content: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.WRITE, path, content)
  },
  
  openDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.OPEN_DIALOG)
  },
}
```

#### Main Process Handler (`src/main/ipc/file.ipc.ts`)
```typescript
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants/ipc-channels'
import { readFile, writeFile } from '../utils/file'

export function registerFileIpc(): void {
  ipcMain.handle(IPC_CHANNELS.FILE.READ, async (_, path: string) => {
    return readFile(path)
  })

  ipcMain.handle(IPC_CHANNELS.FILE.WRITE, async (_, path: string, content: string) => {
    return writeFile(path, content)
  })
}
```

---

## 4. State Management (Zustand)

### Store Design

#### Tree Store (`src/renderer/src/store/tree.store.ts`)
```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TreeNode {
  title: string
  key: string
  children?: TreeNode[]
  content?: string
}

interface TreeState {
  treeData: TreeNode[]
  treeRoot: TreeNode | null
  selectedKey: string | null
  expandedKeys: string[]
  
  setTreeData: (data: TreeNode[]) => void
  setTreeRoot: (root: TreeNode) => void
  setSelectedKey: (key: string | null) => void
  toggleExpandedKey: (key: string) => void
  updateNodeContent: (key: string, content: string) => void
}

export const useTreeStore = create<TreeState>()(
  persist(
    (set, get) => ({
      treeData: [],
      treeRoot: null,
      selectedKey: null,
      expandedKeys: [],
      
      setTreeData: (data) => set({ treeData: data }),
      setTreeRoot: (root) => set({ treeRoot: root }),
      setSelectedKey: (key) => set({ selectedKey: key }),
      toggleExpandedKey: (key) => set((state) => ({
        expandedKeys: state.expandedKeys.includes(key)
          ? state.expandedKeys.filter((k) => k !== key)
          : [...state.expandedKeys, key],
      })),
      updateNodeContent: (key, content) => set((state) => {
        const updateNode = (nodes: TreeNode[]): TreeNode[] =>
          nodes.map((node) => {
            if (node.key === key) return { ...node, content }
            if (node.children) return { ...node, children: updateNode(node.children) }
            return node
          })
        return { treeData: updateNode(state.treeData) }
      }),
    }),
    { name: 'tree-storage' }
  )
)
```

#### Editor Store (`src/renderer/src/store/editor.store.ts`)
```typescript
import { create } from 'zustand'

interface EditorState {
  content: string
  filePath: string | null
  wordCount: number
  
  setContent: (content: string) => void
  setFilePath: (path: string | null) => void
  setWordCount: (count: number) => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  content: '',
  filePath: null,
  wordCount: 0,
  
  setContent: (content) => set({ content }),
  setFilePath: (path) => set({ filePath: path }),
  setWordCount: (count) => set({ wordCount: count }),
}))
```

---

## 5. Component Migration Examples

### Title Bar Component (`src/renderer/src/components/layout/title-bar.tsx`)
```typescript
import { Minus, Square, X, Settings, Sun, Moon } from 'lucide-react'
import { useTheme } from '@/hooks/use-theme'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function TitleBar() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex items-center justify-end h-10 bg-background border-b">
      <div className="flex items-center gap-2 mx-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => window.electronAPI.openSettings()}>
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Theme</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-4 w-px bg-border mx-3" />

      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-none h-10 w-12 hover:bg-muted"
          onClick={() => window.electronAPI.minimizeWindow()}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-none h-10 w-12 hover:bg-muted"
          onClick={() => window.electronAPI.maximizeWindow()}
        >
          <Square className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-none h-10 w-12 hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => window.electronAPI.closeWindow()}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
```

### File Tree Component (`src/renderer/src/features/file-tree/components/file-tree.tsx`)
```typescript
import { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react'
import { useTreeStore } from '@/store/tree.store'
import { cn } from '@/lib/cn'

interface TreeNodeProps {
  node: TreeNode
  level: number
}

function TreeNode({ node, level }: TreeNodeProps) {
  const { selectedKey, expandedKeys, setSelectedKey, toggleExpandedKey } = useTreeStore()
  const isExpanded = expandedKeys.includes(node.key)
  const isSelected = selectedKey === node.key
  const hasChildren = node.children && node.children.length > 0

  const handleClick = useCallback(() => {
    setSelectedKey(node.key)
    if (hasChildren) {
      toggleExpandedKey(node.key)
    }
  }, [node.key, hasChildren, setSelectedKey, toggleExpandedKey])

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent',
          isSelected && 'bg-accent'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )
        ) : (
          <div className="w-4" />
        )}
        
        {node.title.endsWith('.md') ? (
          <File className="h-4 w-4 text-blue-500" />
        ) : isExpanded ? (
          <FolderOpen className="h-4 w-4 text-yellow-500" />
        ) : (
          <Folder className="h-4 w-4 text-yellow-500" />
        )}
        
        <span className="truncate text-sm">{node.title}</span>
      </div>
      
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode key={child.key} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree() {
  const { treeData, treeRoot } = useTreeStore()

  if (!treeRoot) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No folder opened
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-2 font-medium border-b">
        {treeRoot.title}
      </div>
      {treeData.map((node) => (
        <TreeNode key={node.key} node={node} level={0} />
      ))}
    </div>
  )
}
```

---

## 6. Migration Phases

### Phase 1: Project Setup (Week 1)
- [ ] Initialize new React project structure
- [ ] Configure electron-vite with React
- [ ] Set up TypeScript, Tailwind CSS, ESLint
- [ ] Install dependencies (React, Zustand, Radix UI, etc.)
- [ ] Configure build scripts

### Phase 2: Core Infrastructure (Week 2)
- [ ] Implement new IPC architecture with type safety
- [ ] Create preload scripts with contextBridge
- [ ] Set up Zustand stores
- [ ] Create shared types and constants
- [ ] Implement basic window management

### Phase 3: UI Components (Week 3)
- [ ] Create UI primitives (Button, Dialog, Tabs, etc.)
- [ ] Implement TitleBar component
- [ ] Implement StatusBar component
- [ ] Set up theme system with Tailwind
- [ ] Create layout components

### Phase 4: Feature Migration (Week 4-5)
- [ ] Migrate File Tree feature
- [ ] Migrate Markdown Editor (Milkdown React)
- [ ] Migrate Settings modal
- [ ] Migrate Git sync feature
- [ ] Implement keyboard shortcuts

### Phase 5: Polish & Testing (Week 6)
- [ ] Performance optimization
- [ ] Error handling
- [ ] Loading states
- [ ] Accessibility
- [ ] Testing

---

## 7. Risk Mitigation

### High Risk Areas
1. **Milkdown Editor**: May need React-specific version
2. **Splitpanes**: Need React alternative
3. **Ant Design Icons**: Replace with Lucide icons

### Mitigation Strategies
1. Use `@milkdown/react` instead of Vue version
2. Use `react-split` or custom split implementation
3. Replace with Lucide React icons

---

## 8. Dependencies to Add

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "zustand": "^4.5.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "lucide-react": "^0.400.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.4.0",
    "@milkdown/react": "^7.5.0",
    "react-resizable-panels": "^2.1.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

---

## 9. Security Considerations

1. **Context Isolation**: Enabled by default
2. **Node Integration**: Disabled in renderer
3. **Preload Script**: Only exposes whitelisted APIs
4. **IPC Validation**: Validate all inputs in main process
5. **File Access**: Restrict to allowed directories
6. **External URLs**: Use shell.openExternal with validation

---

## 10. Performance Optimizations

1. **Code Splitting**: Route-based lazy loading
2. **Tree Shaking**: Remove unused code
3. **Memoization**: Use React.memo and useMemo
4. **Virtual Scrolling**: For large file trees
5. **Debounced Saves**: For editor content
6. **Lazy Loading**: Heavy components loaded on demand
