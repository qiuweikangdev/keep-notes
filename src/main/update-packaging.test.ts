import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("update packaging config", () => {
  it("uses a stable macOS zip artifact name for updater downloads", () => {
    const config = readFileSync(
      resolve(process.cwd(), "electron-builder.yml"),
      "utf8",
    );

    expect(config).toMatch(
      /mac:\n(?:  .+\n)*  artifactName: \$\{name\}-\$\{version\}-\$\{arch\}-mac\.\$\{ext\}/,
    );
  });
});
