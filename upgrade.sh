#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "=== FJG Gateway 升级脚本 ==="
git remote -v 2>/dev/null | head -1
git pull --rebase
echo "=== 检查状态 ==="
python3 -c "import json; json.load(open('src/providers.json')); print('providers.json OK')"
echo "=== 重启 ==="
pkill -f 'python3 src/gateway.py' 2>/dev/null || true
sleep 1
PORT=8088 nohup python3 src/gateway.py > data/gateway.log 2>&1 &
echo "✅ 升级完成，访问 http://localhost:8088/"
