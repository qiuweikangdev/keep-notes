import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { UntitledCloseAction } from "@shared/types";
import {
  completeUntitledCloseConfirmation,
  subscribeUntitledCloseConfirmation,
  type UntitledCloseConfirmationRequest,
} from "../lib/editor-close-confirmation";

export function UntitledCloseConfirmationDialog() {
  const [request, setRequest] =
    useState<UntitledCloseConfirmationRequest | null>(null);
  const selectedActionRef = useRef<UntitledCloseAction | null>(null);

  useEffect(() => subscribeUntitledCloseConfirmation(setRequest), []);

  const complete = (action: UntitledCloseAction) => {
    selectedActionRef.current = action;
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;

    const action = selectedActionRef.current ?? "cancel";
    selectedActionRef.current = null;
    completeUntitledCloseConfirmation(action);
  };

  const temporaryTitle = request?.temporaryTitle?.trim() || "未命名";

  return (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={handleOpenChange}
      title="保存更改"
      description={`是否保存“${temporaryTitle}”的更改？未保存的内容将会丢失。`}
      variant="warning"
      confirmText="保存"
      secondaryText="不保存"
      onConfirm={() => complete("save")}
      onSecondary={() => complete("discard")}
    />
  );
}
