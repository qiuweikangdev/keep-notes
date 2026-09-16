import { FileTree } from "@/features/file-tree";

interface SidebarProps {
  collapsed?: boolean;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  return (
    <div
      data-collapsed={collapsed}
      className="file-tree-sidebar flex h-full flex-col overflow-hidden"
      style={{
        backgroundColor:
          "var(--sidebar-surface-background, var(--sidebar-background, var(--bg-secondary)))",
        borderRight: "var(--sidebar-border, 1px solid var(--border-color))",
      }}
    >
      <div className="file-tree-sidebar__content h-full">
        <FileTree />
      </div>
    </div>
  );
}
