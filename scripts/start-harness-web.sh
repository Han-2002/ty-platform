#!/usr/bin/env bash
#
# 启动 deepseek-harness 集成的推演控制台（默认 8080）。
#
# 这套前端 = deepseek-harness 的 Web 界面 + ui-wargame 推演控制台插件。
# 依赖与构建产物都不入库，所以首次运行会自动补齐：
#   1) pnpm install（node_modules 未入库）
#   2) pnpm run build:lib:client（lib/ 构建产物未入库）
#   3) 启动 Web 服务并打印带 token 的访问地址
#
# 用法：
#   ./scripts/start-harness-web.sh          # 端口 8080
#   PORT=8081 ./scripts/start-harness-web.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HARNESS="$ROOT/deepseek-harness"
PORT="${PORT:-8080}"

if [ ! -d "$HARNESS" ]; then
  echo "找不到 deepseek-harness 目录：$HARNESS" >&2
  exit 1
fi

cd "$HARNESS"

if [ ! -d node_modules ]; then
  echo "[1/3] 安装 deepseek-harness 依赖（首次较久，286 个 workspace 包）..."
  DSH_LEFTHOOK_ALLOW_HOOKS_PATH_OVERRIDE=1 pnpm install
else
  echo "[1/3] 依赖已存在，跳过安装。"
fi

if [ ! -f packages/client/ui-wargame/lib/client.js ]; then
  echo "[2/3] 构建客户端插件产物（含 ui-wargame 的 lib/client.js）..."
  pnpm run build:lib:client
else
  echo "[2/3] 客户端插件产物已存在，跳过构建。"
fi

echo "[3/3] 启动 Web 服务，端口 $PORT ..."
echo "      启动后请用终端打印的【带 token 的完整 URL】访问。"
exec node --import tsx/esm apps/cli/src/bin.ts web --no-open --port "$PORT"
