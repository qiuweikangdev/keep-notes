#!/bin/bash

# 开发模式启动脚本
# 实现签名应用 + 热更新的混合开发模式

set -e

APP_NAME="Keep Notes"

# 检测 Mac 架构
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  APP_PATH="dist/mac-arm64/${APP_NAME}.app"
else
  APP_PATH="dist/mac/${APP_NAME}.app"
fi

VITE_PORT=5173

# 检查应用是否存在
if [ ! -d "$APP_PATH" ]; then
  echo "📱 应用不存在，先进行构建和签名..."
  ./scripts/sign-app.sh
fi

# 检查签名
echo "🔍 检查应用签名..."
if ! codesign --verify --deep --strict "$APP_PATH" 2>/dev/null; then
  echo "⚠️  应用签名无效，重新签名..."
  ./scripts/sign-app.sh
fi

# 启动 Vite 开发服务器（后台运行）
echo "🚀 启动 Vite 开发服务器 (端口: $VITE_PORT)..."
pnpm exec electron-vite dev --port $VITE_PORT &
VITE_PID=$!

# 等待 Vite 服务器启动
echo "⏳ 等待 Vite 服务器启动..."
sleep 3

# 启动签名应用
echo "📱 启动签名应用..."
open "$APP_PATH"

echo ""
echo "✅ 开发环境已启动！"
echo "   - Vite 服务器: http://localhost:$VITE_PORT"
echo "   - 应用已通过 open 命令启动"
echo ""
echo "💡 提示:"
echo "   - 修改代码后，应用会自动热更新"
echo "   - 按 Ctrl+C 停止开发服务器"
echo ""

# 捕获 Ctrl+C 信号
trap "echo ''; echo '🛑 停止开发服务器...'; kill $VITE_PID 2>/dev/null; exit 0" INT TERM

# 等待 Vite 进程
wait $VITE_PID
