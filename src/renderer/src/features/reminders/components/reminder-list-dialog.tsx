import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContextMenu } from "@/components/ui/context-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
  const isEditorOpen = useReminderStore((state) => state.isEditorOpen);
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
        modal={!isEditorOpen}
        open={isListOpen}
        onOpenChange={(open) => {
          if (!open) closeList();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="top-[12vh] max-w-[520px] translate-y-0 gap-0 overflow-hidden rounded-xl p-0 shadow-lg sm:rounded-xl"
          onEscapeKeyDown={(event) => {
            if (isContextMenuOpen) {
              event.preventDefault();
            }
          }}
          onFocusOutside={preventDialogDismissFromContextMenu}
          onInteractOutside={preventDialogDismissFromContextMenu}
          onPointerDownOutside={preventDialogDismissFromContextMenu}
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <Dialog.Title className="sr-only">提醒事项</Dialog.Title>
          <Dialog.Description className="sr-only">
            查看、搜索、编辑和完成笔记提醒事项
          </Dialog.Description>
          <div className="flex h-9 items-center gap-2 px-3">
            <Search
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
            />
            <input
              aria-label="搜索提醒事项"
              className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-[var(--text-primary)] shadow-none outline-none ring-0 placeholder:text-[var(--text-muted)] focus:border-0 focus:border-transparent focus:outline-none focus:ring-0"
              placeholder="搜索提醒事项"
              role="searchbox"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              aria-label="新建提醒事项"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] outline-none hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
              title="新建提醒事项"
              type="button"
              onClick={handleCreate}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <Tabs.Root
            value={tab}
            onValueChange={(value) => setTab(value as ReminderListTab)}
          >
            <Tabs.List
              aria-label="提醒事项筛选"
              className="flex items-center gap-1 px-1.5 pb-1"
            >
              {tabs.map((item) => (
                <Tabs.Trigger
                  key={item.value}
                  value={item.value}
                  className="h-6 w-auto rounded-md px-2 text-xs text-[var(--text-secondary)] outline-none hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] data-[state=active]:bg-[var(--active-bg)] data-[state=active]:text-[var(--text-primary)]"
                >
                  {item.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            {tabs.map((item) => (
              <Tabs.Content
                key={item.value}
                value={item.value}
                className="max-h-[320px] overflow-y-auto px-1.5 pb-2 outline-none"
              >
                {visibleReminders.length > 0 ? (
                  <div className="space-y-0.5">
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
                  <div className="px-3 pb-4 pt-2 text-[13px] text-[var(--text-muted)]">
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
  const metadata = `${scheduledAt} · ${getRepeatLabel(reminder)}`;

  return (
    <ContextMenu.Root modal={false} onOpenChange={onContextMenuOpenChange}>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          className={`flex w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-[var(--hover-bg)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] ${
            reminder.fileName ? "h-11" : "h-8"
          }`}
        >
          {reminder.completed ? (
            <CheckCircle2
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
            />
          ) : (
            <Bell
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
            />
          )}
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="max-w-full truncate font-medium">
              {reminder.title}
            </span>
            {reminder.fileName ? (
              <span
                className="mt-0.5 max-w-full truncate text-[10px] leading-none text-[var(--text-muted)]"
                title={reminder.fileName}
              >
                {reminder.fileName}
              </span>
            ) : null}
          </span>
          <span
            className="min-w-[160px] max-w-[280px] shrink-0 truncate text-right text-xs text-[var(--text-muted)]"
            title={metadata}
          >
            {metadata}
          </span>
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
