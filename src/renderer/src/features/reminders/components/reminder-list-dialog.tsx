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
  const hasNestedLayer =
    isEditorOpen || isContextMenuOpen || deleteTarget !== null;

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

  const preventDialogDismissFromNestedLayer = useCallback(
    (event: { target: EventTarget | null; preventDefault: () => void }) => {
      if (hasNestedLayer || isReminderNestedPortalTarget(event.target)) {
        event.preventDefault();
      }
    },
    [hasNestedLayer],
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
          // 编辑器是列表之上的子任务，子层关闭时不能连带关闭父列表。
          if (!open && !hasNestedLayer) closeList();
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="z-40"
          overlayStyle={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
          className={`top-[12vh] z-50 max-w-[520px] translate-y-0 gap-0 overflow-hidden rounded-xl p-0 shadow-[0_4px_8px_rgba(0,0,0,0.16)] sm:rounded-xl ${
            isEditorOpen ? "pointer-events-none" : ""
          }`}
          data-editor-open={isEditorOpen ? "true" : undefined}
          data-reminder-list-dialog="true"
          inert={isEditorOpen}
          onEscapeKeyDown={(event) => {
            if (hasNestedLayer) {
              event.preventDefault();
            }
          }}
          onFocusOutside={preventDialogDismissFromNestedLayer}
          onInteractOutside={preventDialogDismissFromNestedLayer}
          onPointerDownOutside={preventDialogDismissFromNestedLayer}
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
          <Tabs.Root
            value={tab}
            onValueChange={(value) => setTab(value as ReminderListTab)}
          >
            <div
              className="border-b border-[var(--border-color)]"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--bg-secondary) 24%, var(--bg-primary))",
              }}
            >
              <div className="flex h-11 items-center gap-2.5 px-3.5">
                <Search
                  aria-hidden="true"
                  className="h-[18px] w-[18px] shrink-0 text-[var(--text-muted)]"
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
              <Tabs.List
                aria-label="提醒事项筛选"
                className="flex items-center gap-1 px-2.5 pb-2"
              >
                {tabs.map((item) => (
                  <Tabs.Trigger
                    key={item.value}
                    value={item.value}
                    className="h-7 w-auto rounded-md px-2.5 text-xs font-medium text-[var(--text-secondary)] outline-none hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] data-[state=active]:bg-[var(--active-bg)] data-[state=active]:text-[var(--text-primary)]"
                  >
                    {item.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </div>

            {tabs.map((item) => (
              <Tabs.Content
                key={item.value}
                value={item.value}
                className="max-h-[320px] overflow-y-auto p-2 outline-none"
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
                  <div className="flex items-center gap-3 px-3 py-4">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--bg-secondary) 70%, var(--bg-primary))",
                        color: "var(--text-muted)",
                      }}
                    >
                      <Bell aria-hidden="true" className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex items-center justify-center">
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">
                        没有提醒事项
                      </p>
                    </div>
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
