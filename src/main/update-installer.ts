import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const AD_HOC_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
  </dict>
</plist>
`;

type RunCommand = (command: string, args: string[]) => Promise<void>;

interface PrepareMacUpdatePackageOptions {
  downloadedFiles: string[];
  tempRoot: string;
  makeTempDir?: (prefix: string) => string;
  findAppBundle?: (rootPath: string) => string | null;
  runCommand?: RunCommand;
  writeFile?: (filePath: string, content: string) => void;
}

interface ReplaceAppWithPreparedUpdateOptions {
  updateAppPath: string;
  currentAppPath: string;
  tempRoot: string;
  makeDir?: (dirPath: string) => void;
  removeDir?: (dirPath: string) => void;
  spawnScript?: (scriptPath: string) => void;
  writeFile?: (filePath: string, content: string) => void;
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with code ${code}: ${stderr}`,
        ),
      );
    });
  });
}

export function findFirstAppBundle(rootPath: string): string | null {
  const entries = readdirSync(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return join(rootPath, entry.name);
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const found = findFirstAppBundle(join(rootPath, entry.name));
    if (found) return found;
  }

  return null;
}

async function ensureLocalAdHocSignature(
  appPath: string,
  options: Required<
    Pick<
      PrepareMacUpdatePackageOptions,
      "makeTempDir" | "runCommand" | "writeFile"
    >
  > & {
    tempRoot: string;
  },
): Promise<void> {
  try {
    await options.runCommand("codesign", [
      "--verify",
      "--deep",
      "--strict",
      appPath,
    ]);
    return;
  } catch {
    const signTempDir = options.makeTempDir(
      join(options.tempRoot, "keep-notes-sign-"),
    );
    const entitlementsPath = join(signTempDir, "entitlements.mac.plist");

    // 无 Apple 开发者证书时，使用本机 ad-hoc 签名重建资源封口，避开 ShipIt 的证书要求。
    options.writeFile(entitlementsPath, AD_HOC_ENTITLEMENTS);
    await options.runCommand("codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--entitlements",
      entitlementsPath,
      appPath,
    ]);
    await options.runCommand("codesign", [
      "--verify",
      "--deep",
      "--strict",
      appPath,
    ]);
  }
}

export async function prepareMacUpdatePackage({
  downloadedFiles,
  tempRoot,
  makeTempDir = (prefix) => mkdtempSync(prefix),
  findAppBundle = findFirstAppBundle,
  runCommand: run = runCommand,
  writeFile = writeFileSync,
}: PrepareMacUpdatePackageOptions): Promise<string> {
  const directAppPath = downloadedFiles.find((file) => file.endsWith(".app"));
  if (directAppPath) {
    await ensureLocalAdHocSignature(directAppPath, {
      tempRoot,
      makeTempDir,
      runCommand: run,
      writeFile,
    });
    return directAppPath;
  }

  const zipPath = downloadedFiles.find((file) => file.endsWith(".zip"));
  if (!zipPath) {
    throw new Error("未找到可安装的 macOS 更新包。");
  }

  const extractDir = makeTempDir(join(tempRoot, "keep-notes-update-"));
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  await run("ditto", ["-x", "-k", zipPath, extractDir]);

  const updateAppPath = findAppBundle(extractDir);
  if (!updateAppPath) {
    throw new Error("macOS 更新包中未找到 .app 应用。");
  }

  await ensureLocalAdHocSignature(updateAppPath, {
    tempRoot: extractDir,
    makeTempDir,
    runCommand: run,
    writeFile,
  });

  return updateAppPath;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function spawnDetachedScript(scriptPath: string): void {
  spawn("/bin/sh", [scriptPath], {
    detached: true,
    stdio: "ignore",
    cwd: "/",
  }).unref();
}

export function replaceAppWithPreparedUpdate({
  updateAppPath,
  currentAppPath,
  tempRoot,
  makeDir = (dirPath) => mkdirSync(dirPath, { recursive: true }),
  removeDir = (dirPath) => rmSync(dirPath, { recursive: true, force: true }),
  spawnScript = spawnDetachedScript,
  writeFile = writeFileSync,
}: ReplaceAppWithPreparedUpdateOptions): void {
  const tmpDir = join(tempRoot, "keep-notes-update-install");
  removeDir(tmpDir);
  makeDir(tmpDir);

  const scriptPath = join(tmpDir, "replace.sh");
  const script = `#!/bin/bash
set -e

# 等待旧应用完全退出后再替换 .app，避免 macOS 仍占用可执行文件。
sleep 2

rm -rf ${shellQuote(currentAppPath)}
cp -R ${shellQuote(updateAppPath)} ${shellQuote(currentAppPath)}
open ${shellQuote(currentAppPath)}
rm -rf ${shellQuote(tmpDir)}
`;

  writeFile(scriptPath, script);
  spawnScript(scriptPath);
}
