#!/bin/bash
set -e

echo "=== FJG Gateway 一键升级 ==="

# 1. 拉取最新代码
cd "$(dirname "$0")"
git remote -v 2>/dev/null | grep -q origin || {
    echo "请先配置 remote: git remote add origin https://github.com/martinfengdz/fjg-gateway.git"
    exit 1
}
git pull --rebase

# 2. 检查配置
[ -f src/providers.json ] || { echo "providers.json 缺失"; exit 1; }
python3 -c "import json; json.load(open('src/providers.json'))" 2>/dev/null || { echo "providers.json 格式错误"; exit 1; }

# 3. 重启
pkill -f 'python3 src/gateway.py' 2>/dev/null || true
sleep 1
nohup python3 src/gateway.py > data/gateway.log 2>&1 &
sleep 2

# 4. 验证
if curl -s http://localhost:8088/health > /dev/null 2>&1; then
    echo "✅ 升级成功: http://localhost:8088/"
else
    echo "❌ 启动失败，查看日志: tail -50 data/gateway.log"
fi
