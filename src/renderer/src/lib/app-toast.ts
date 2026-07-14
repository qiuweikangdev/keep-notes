export const APP_TOAST_EVENT = "keep-notes:app-toast";

export type AppToastVariant = "info" | "error";

export interface AppToastDetail {
  message: string;
  variant: AppToastVariant;
}

export function showAppToast(
  message: string,
  variant: AppToastVariant = "error",
) {
  window.dispatchEvent(
    new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, {
      detail: { message, variant },
    }),
  );
}

export function isAppToastDetail(detail: unknown): detail is AppToastDetail {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "message" in detail &&
    typeof (detail as AppToastDetail).message === "string" &&
    (detail as AppToastDetail).message.length > 0 &&
    "variant" in detail &&
    ["info", "error"].includes((detail as AppToastDetail).variant)
  );
}
