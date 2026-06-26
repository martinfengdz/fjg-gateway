#!/bin/bash
PROJECT_DIR="/home/agent/fjg-gateway"
PORT=8088
PID_FILE="$PROJECT_DIR/data/gateway.pid"

if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        curl -sf http://localhost:$PORT/health > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            exit 0
        fi
        echo "[WATCHDOG] Process $pid exists but health check failed, restarting..."
        kill "$pid" 2>/dev/null
        sleep 2
    fi
fi

cd "$PROJECT_DIR"
PROVIDERS_FILE="$PROJECT_DIR/src/providers.json"
FJG_STATE_DIR="$PROJECT_DIR/data"
PORT=$PORT nohup python3 src/gateway.py > "$PROJECT_DIR/data/gateway.log" 2>&1 &
echo $! > "$PID_FILE"
echo "[WATCHDOG] Gateway restarted with PID $(cat $PID_FILE)"
