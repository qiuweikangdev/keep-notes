import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContextMenu } from "@/components/ui/context-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { useReminderStore } from "@/store/reminder.store";
import type { Reminder } from "@/types";
import {
  filterReminders,
  formatReminderDateTime,
  getRepeatLabel,
  type ReminderListTab,
} from "../lib/reminder-format";

const MENU_CONTENT_CLASS =
  "z-[9999] min-w-[150px] rounded-md border p-1 shadow-lg bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)]";
const MENU_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--hover-bg)]";
const MENU_SEPARATOR_CLASS = "my-1 h-px bg-[var(--border-color)]";

const tabs: Array<{ label: string; value: ReminderListTab }> = [
  { label: "今天", value: "today" },
  { label: "完成", value: "completed" },
  { label: "全部", value: "all" },
];

function isReminderNestedPortalTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    (target.closest("[data-reminder-context-menu]") !== null ||
      target.closest("[data-reminder-editor-dialog]") !== null)
  );
}

export function ReminderListDialog() {
  const reminders = useReminderStore((state) => state.reminders);
  const isListOpen = useReminderStore((state) => state.isListOpen);
  const closeList = useReminderStore((state) => state.closeList);
  const openCreateDialog = useReminderStore((state) => state.openCreateDialog);
  const openEditDialog = useReminderStore((state) => state.openEditDialog);
  const completeReminder = useReminderStore((state) => state.completeReminder);
  const deleteReminder = useReminderStore((state) => state.deleteReminder);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ReminderListTab>("today");
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);

  const visibleReminders = useMemo(
    () => filterReminders(reminders, tab, query),
    [query, reminders, tab],
  );

  const handleEdit = (reminder: Reminder) => {
    openEditDialog(reminder.id);
  };

  const handleCreate = () => {
    openCreateDialog();
  };

  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    setIsContextMenuOpen(open);
  }, []);

  const preventDialogDismissFromContextMenu = useCallback(
    (event: { target: EventTarget | null; preventDefault: () => void }) => {
      if (isReminderNestedPortalTarget(event.target)) {
        event.preventDefault();
      }
    },
    [],
  );

  useEffect(() => {
    if (!isListOpen) return;

    setQuery("");
    setTab("today");
    setDeleteTarget(null);
    setIsContextMenuOpen(false);
  }, [isListOpen]);

  return (
    <>
      <Dialog.Root
        modal={false}
        open={isListOpen}
        onOpenChange={(open) => {
          if (!open) closeList();
        }}
      >
        <DialogContent
          className="max-w-[680px] gap-0 overflow-hidden p-0 shadow-2xl"
          onEscapeKeyDown={(event) => {
            if (isContextMenuOpen) {
              event.preventDefault();
            }
          }}
          onFocusOutside={preventDialogDismissFromContextMenu}
          onInteractOutside={preventDialogDismissFromContextMenu}
          onPointerDownOutside={preventDialogDismissFromContextMenu}
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <Dialog.Title className="sr-only">提醒事项</Dialog.Title>
          <Dialog.Description className="sr-only">
            查看、搜索、编辑和完成笔记提醒事项
          </Dialog.Description>
          <div
            className="border-b px-5 py-4"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="mb-4 flex items-center gap-3">
              <Bell
                className="h-5 w-5"
                style={{ color: "var(--accent-color)" }}
              />
              <h2 className="text-lg font-semibold">提醒事项</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索标题或文件名"
                  className="h-9 pl-9"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="新建提醒事项"
                title="新建提醒事项"
                onClick={handleCreate}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Tabs.Root
            value={tab}
            onValueChange={(value) => setTab(value as ReminderListTab)}
          >
            <Tabs.List
              className="grid grid-cols-3 gap-1 px-5 py-3"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              {tabs.map((item) => (
                <Tabs.Trigger
                  key={item.value}
                  value={item.value}
                  className="h-8 rounded-md text-[13px] data-[state=active]:bg-[var(--bg-primary)]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            {tabs.map((item) => (
              <Tabs.Content
                key={item.value}
                value={item.value}
                className="h-[250px] overflow-auto bg-[var(--bg-primary)] px-3 py-3"
              >
                {visibleReminders.length > 0 ? (
                  <div className="space-y-1">
                    {visibleReminders.map((reminder) => (
                      <ReminderListItem
                        key={reminder.id}
                        reminder={reminder}
                        onEdit={handleEdit}
                        onComplete={(target) =>
                          void completeReminder(target.id)
                        }
                        onDelete={setDeleteTarget}
                        onContextMenuOpenChange={handleContextMenuOpenChange}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-[220px] items-center justify-center text-[13px] text-[var(--text-muted)]">
                    没有提醒事项
                  </div>
                )}
              </Tabs.Content>
            ))}
          </Tabs.Root>
        </DialogContent>
      </Dialog.Root>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="删除提醒事项"
        description={
          deleteTarget
            ? `确定删除“${deleteTarget.title}”吗？此操作不可恢复。`
            : undefined
        }
        confirmText="删除"
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteReminder(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

interface ReminderListItemProps {
  reminder: Reminder;
  onEdit: (reminder: Reminder) => void;
  onComplete: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onContextMenuOpenChange: (open: boolean) => void;
}

function ReminderListItem({
  reminder,
  onEdit,
  onComplete,
  onDelete,
  onContextMenuOpenChange,
}: ReminderListItemProps) {
  const scheduledAt = formatReminderDateTime(reminder.scheduledAt);
  const fileName = reminder.fileName || "无关联文件";

  return (
    <ContextMenu.Root modal={false} onOpenChange={onContextMenuOpenChange}>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          className="grid w-full grid-cols-[minmax(0,1fr)_52px] items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--hover-bg)]"
        >
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium">
              {reminder.title}
            </div>
            <div
              className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] leading-5"
              style={{ color: "var(--text-secondary)" }}
            >
              <span className="min-w-0 max-w-[180px] truncate">{fileName}</span>
              <span className="shrink-0">提醒 {scheduledAt}</span>
            </div>
          </div>
          <div
            className="text-right text-[12px]"
            style={{ color: "var(--text-muted)" }}
          >
            {getRepeatLabel(reminder)}
          </div>
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={MENU_CONTENT_CLASS}
          data-reminder-context-menu="true"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ContextMenu.Item
            className={MENU_ITEM_CLASS}
            onClick={() => onEdit(reminder)}
          >
            <Pencil className="h-4 w-4" /> 修改
          </ContextMenu.Item>
          {!reminder.completed ? (
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => onComplete(reminder)}
            >
              <CheckCircle2 className="h-4 w-4" /> 标记为完成
            </ContextMenu.Item>
          ) : null}
          <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />
          <ContextMenu.Item
            className={MENU_ITEM_CLASS}
            onClick={() => onDelete(reminder)}
          >
            <Trash2 className="h-4 w-4" /> 删除
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
