import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

if (process.platform !== "darwin") {
  process.exit(0);
}

const require = createRequire(import.meta.url);
const entitlementsPath = path.resolve("build/entitlements.mac.plist");

function runCodesign(args, stdio = "ignore") {
  return spawnSync("codesign", args, { stdio });
}

let electronPath;

try {
  electronPath = require("electron");
} catch (error) {
  console.error("Failed to resolve Electron binary for dev signing.");
  console.error(error);
  process.exit(1);
}

const appPath = path.resolve(path.dirname(electronPath), "..", "..");

if (!existsSync(appPath)) {
  console.error(`Electron app not found: ${appPath}`);
  process.exit(1);
}

// macOS 开发环境下 Electron 下载包可能缺少可验证签名，启动前补一次本地 ad-hoc 签名。
const verifyResult = runCodesign(["--verify", "--deep", "--strict", appPath]);

if (verifyResult.status === 0) {
  process.exit(0);
}

const signArgs = ["--force", "--deep", "--sign", "-"];

if (existsSync(entitlementsPath)) {
  signArgs.push("--entitlements", entitlementsPath);
}

signArgs.push(appPath);

const signResult = runCodesign(signArgs, "inherit");

if (signResult.status !== 0) {
  process.exit(signResult.status ?? 1);
}
