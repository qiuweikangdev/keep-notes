import { describe, expect, it } from "vitest";
import type { ExternalOpenApp } from "@shared/types";

import {
  resolveEffectiveExternalOpenApp,
  resolveExternalOpenTargetPath,
} from "./external-open-options";

const apps: ExternalOpenApp[] = [
  { id: "vscode", label: "VS Code", kind: "editor", available: true },
  { id: "terminal", label: "Terminal", kind: "terminal", available: true },
  {
    id: "file-manager",
    label: "Finder",
    kind: "file-manager",
    available: true,
  },
];

describe("external open options", () => {
  it("uses selected path before workspace root", () => {
    expect(resolveExternalOpenTargetPath("/workspace/a.md", "/workspace")).toBe(
      "/workspace/a.md",
    );
  });

  it("falls back to workspace root when no path is selected", () => {
    expect(resolveExternalOpenTargetPath(null, "/workspace")).toBe(
      "/workspace",
    );
  });

  it("uses the saved default when it is available", () => {
    expect(resolveEffectiveExternalOpenApp(apps, "terminal")?.id).toBe(
      "terminal",
    );
  });

  it("falls back to the first editor before file manager", () => {
    const appsWithFileManagerFirst: ExternalOpenApp[] = [
      {
        id: "file-manager",
        label: "Finder",
        kind: "file-manager",
        available: true,
      },
      { id: "vscode", label: "VS Code", kind: "editor", available: true },
    ];

    expect(
      resolveEffectiveExternalOpenApp(appsWithFileManagerFirst, "cursor")?.id,
    ).toBe("vscode");
  });
});
