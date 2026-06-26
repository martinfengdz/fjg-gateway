#!/usr/bin/env bash
# FJG Gateway 一键启动脚本
# 在容器窗口执行: bash /home/agent/fjg-gateway/start.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/src"
export PROVIDERS_FILE="$DIR/src/providers.json"
export FJG_STATE_DIR="$DIR/data"
export PORT=8088
echo "=============================="
echo " FJG Gateway"
echo " 端口: 8088"
echo " Key : $DIR/src/providers.json"
echo "=============================="
echo ""
exec python3 gateway.py
