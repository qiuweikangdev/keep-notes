import fs from "node:fs";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const DEFAULT_ELECTRON_MIRROR = "https://cdn.npmmirror.com/binaries/electron/";
const MAX_REDIRECTS = 5;

const electronPackageJsonPath = require.resolve("electron/package.json");
const electronRoot = path.dirname(electronPackageJsonPath);
const electronPackage = JSON.parse(
  await readFile(electronPackageJsonPath, "utf8"),
);

const platform =
  process.env.ELECTRON_INSTALL_PLATFORM ||
  process.env.npm_config_platform ||
  process.platform;
const arch =
  process.env.ELECTRON_INSTALL_ARCH ||
  process.env.npm_config_arch ||
  process.arch;
const platformPath = getPlatformPath(platform);

if (await isElectronInstalled()) {
  process.exit(0);
}

await ensureElectronInstalled();

async function isElectronInstalled() {
  const distPath = path.join(electronRoot, "dist");
  const versionPath = path.join(distPath, "version");
  const pathTxtPath = path.join(electronRoot, "path.txt");
  const executablePath =
    process.env.ELECTRON_OVERRIDE_DIST_PATH ||
    path.join(distPath, platformPath);

  try {
    // 同时校验版本、path.txt 和可执行文件，避免半安装状态误判为可用。
    const installedVersion = (await readFile(versionPath, "utf8")).replace(
      /^v/,
      "",
    );
    const installedPath = await readFile(pathTxtPath, "utf8");

    return (
      installedVersion === electronPackage.version &&
      installedPath === platformPath &&
      fs.existsSync(executablePath)
    );
  } catch {
    return false;
  }
}

async function ensureElectronInstalled() {
  const version = electronPackage.version;
  const zipName = `electron-v${version}-${platform}-${arch}.zip`;
  const mirror = normalizeMirror(
    process.env.ELECTRON_MIRROR ||
      process.env.npm_config_electron_mirror ||
      DEFAULT_ELECTRON_MIRROR,
  );
  const url = new URL(`v${version}/${zipName}`, mirror).toString();
  const zipPath = path.join(os.tmpdir(), zipName);
  const distPath = path.join(electronRoot, "dist");

  console.log(`[ensure-electron] Missing Electron binary, downloading ${url}`);

  try {
    // 下载完成后重新解压 dist，确保修复结果和 Electron 官方 install 脚本一致。
    await downloadFile(url, zipPath);
    await rm(distPath, { recursive: true, force: true });
    await mkdir(distPath, { recursive: true });
    await extractZip(zipPath, distPath);
    await writeFile(path.join(electronRoot, "path.txt"), platformPath);
  } finally {
    await rm(zipPath, { force: true });
  }

  if (!(await isElectronInstalled())) {
    throw new Error("Electron binary repair finished but validation failed.");
  }

  console.log("[ensure-electron] Electron binary is ready.");
}

function getPlatformPath(targetPlatform) {
  switch (targetPlatform) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on ${targetPlatform}`);
  }
}

function normalizeMirror(mirror) {
  return mirror.endsWith("/") ? mirror : `${mirror}/`;
}

async function downloadFile(url, destination, redirectsLeft = MAX_REDIRECTS) {
  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === "https:" ? https : http;

  await mkdir(path.dirname(destination), { recursive: true });

  await new Promise((resolve, reject) => {
    const request = client.get(parsedUrl, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;

      // npmmirror 会跳转到 CDN，这里显式跟随重定向，避免依赖下载器内部行为。
      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new Error(`Too many redirects while downloading ${url}`));
          return;
        }

        const nextUrl = new URL(location, parsedUrl).toString();
        downloadFile(nextUrl, destination, redirectsLeft - 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (status !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${status}: ${url}`));
        return;
      }

      const file = createWriteStream(destination);
      pipeline(response, file).then(resolve).catch(reject);
    });

    request.setTimeout(600000, () => {
      request.destroy(new Error(`Download timed out: ${url}`));
    });
    request.on("error", reject);
  });
}

async function extractZip(zipPath, destination) {
  const { extract } = require("@electron-internal/extract-zip");
  await extract(zipPath, { dir: destination });
}
