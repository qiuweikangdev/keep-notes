#!/bin/bash

# macOS ad-hoc 签名脚本
# 用于开发环境，让应用获得原生应用身份

set -e

APP_NAME="Keep Notes"

# 检测 Mac 架构
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  APP_PATH="dist/mac-arm64/${APP_NAME}.app"
else
  APP_PATH="dist/mac/${APP_NAME}.app"
fi

ENTITLEMENTS_PATH="build/entitlements.mac.plist"

echo "🔧 开始构建并打包应用..."
pnpm run build:mac

if [ ! -d "$APP_PATH" ]; then
  echo "❌ 错误: 找不到应用路径 $APP_PATH"
  echo "请先运行 pnpm run build:mac 构建应用"
  exit 1
fi

echo "🔑 正在进行 ad-hoc 签名..."

# 移除现有签名
codesign --remove-signature "$APP_PATH" 2>/dev/null || true

# 使用 ad-hoc 签名
codesign --force --deep --sign - \
  --entitlements "$ENTITLEMENTS_PATH" \
  "$APP_PATH"

# 验证签名
echo "✅ 验证签名..."
codesign --verify --deep --strict "$APP_PATH"

echo "🎉 签名完成！"
echo "📱 应用路径: $APP_PATH"
echo ""
echo "使用以下命令启动应用:"
echo "  open '$APP_PATH'"
