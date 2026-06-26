import type { ExternalOpenApp, ExternalOpenAppId } from "@shared/types";

export function resolveExternalOpenTargetPath(
  selectedPath: string | null | undefined,
  rootPath: string | null | undefined,
): string | null {
  return selectedPath || rootPath || null;
}

export function resolveEffectiveExternalOpenApp(
  apps: ExternalOpenApp[],
  preferredAppId: ExternalOpenAppId,
): ExternalOpenApp | null {
  const availableApps = apps.filter((app) => app.available);
  return (
    availableApps.find((app) => app.id === preferredAppId) ??
    availableApps.find((app) => app.kind === "editor") ??
    availableApps.find((app) => app.id === "file-manager") ??
    availableApps[0] ??
    null
  );
}
