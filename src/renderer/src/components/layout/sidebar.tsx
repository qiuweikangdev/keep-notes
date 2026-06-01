import { FileTree } from "@/features/file-tree";

export function Sidebar() {
  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <FileTree />
    </div>
  );
}
