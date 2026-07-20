import type { ReactNode } from "react";
import {
  ListTree,
  MoreHorizontal,
  PictureInPicture2,
  Plus,
  X,
} from "lucide-react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

const itemClassName =
  "quick-editor-actions-menu__item flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--hover-bg)]";

interface QuickEditorActionsMenuProps {
  isOutlineOpen: boolean;
  isOutlineDisabled: boolean;
  onToggleOutline: () => void;
  onNewWindow: () => void;
  onReturnToApplication: () => void;
  onCloseWindow: () => void;
}

function ActionItem(props: {
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      className={itemClassName}
      disabled={props.disabled}
      onSelect={props.onSelect}
    >
      {props.icon}
      <span>{props.children}</span>
    </DropdownMenu.Item>
  );
}

export function QuickEditorActionsMenu(props: QuickEditorActionsMenuProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="更多操作"
          className="quick-editor-window__action"
        >
          <MoreHorizontal aria-hidden="true" size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="quick-editor-actions-menu"
        >
          <ActionItem
            disabled={props.isOutlineDisabled}
            icon={<ListTree aria-hidden="true" size={14} />}
            onSelect={props.onToggleOutline}
          >
            {props.isOutlineOpen ? "隐藏大纲" : "显示大纲"}
          </ActionItem>
          <DropdownMenu.Separator className="quick-editor-actions-menu__separator" />
          <ActionItem
            icon={<Plus aria-hidden="true" size={14} />}
            onSelect={props.onNewWindow}
          >
            新建浮动窗口
          </ActionItem>
          <ActionItem
            icon={<PictureInPicture2 aria-hidden="true" size={14} />}
            onSelect={props.onReturnToApplication}
          >
            返回主窗口
          </ActionItem>
          <DropdownMenu.Separator className="quick-editor-actions-menu__separator" />
          <ActionItem
            icon={<X aria-hidden="true" size={14} />}
            onSelect={props.onCloseWindow}
          >
            关闭浮动窗口
          </ActionItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
