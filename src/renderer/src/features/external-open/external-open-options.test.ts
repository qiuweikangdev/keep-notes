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
  it("uses workspace root as the external open target", () => {
    expect(resolveExternalOpenTargetPath("/workspace")).toBe("/workspace");
  });

  it("returns null when no workspace root is available", () => {
    expect(resolveExternalOpenTargetPath(null)).toBeNull();
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
