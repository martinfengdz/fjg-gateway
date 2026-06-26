#!/usr/bin/env python3
"""
冯家军统一API网关 v4.0 - FJG Unified API Gateway
多Provider智能路由 + 中文管理后台 + 可编辑配置 + 日用量/月K线 + BOT识别 + 密码保护
"""

import json, os, sys, time, threading, random, hashlib
import urllib.request, urllib.error, ssl
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse, parse_qs

_CTX = ssl._create_unverified_context()
VERSION = "4.0.0"
STATE_DIR = os.environ.get("FJG_STATE_DIR", "/data")
STATE_FILE = os.path.join(STATE_DIR, "gateway_state.json")
PROJECTS_DIR = os.environ.get("FJG_PROJECTS_DIR", "/projects")

# 管理密码（默认123456，可改）
ADMIN_PASSWORD = os.environ.get("FJG_ADMIN_PASSWORD", "123456")
SESSION_SECRET = os.environ.get("FJG_SESSION_SECRET", secrets.token_hex(32))
SESSION_COOKIE = "fjg_session"

DEFAULT_PROVIDERS = {
    "provider-1": {
        "provider": "example", "model": "example-model",
        "base_url": "https://api.example.com/v1",
        "api_key": "${API_KEY_1}",
        "priority": 0, "free": True, "rpm": 100, "timeout": 60,
        "tag": "P0 免费层",
    },
}

def _build_pool():
    pf = os.environ.get("PROVIDERS_FILE", "")
    if pf and os.path.isfile(pf):
        try:
            with open(pf) as f:
                raw = f.read().strip()
                p = json.loads(raw)
                if isinstance(p, dict) and len(p) > 0:
                    print(f"[配置] 从 {pf} 加载 {len(p)} 个Provider")
                    return p
        except Exception as e:
            print(f"[配置] 读取 {pf} 失败: {e}")
    raw = os.environ.get("PROVIDERS")
    if raw:
        try:
            p = json.loads(raw)
            if isinstance(p, dict) and len(p) > 0:
                return p
        except Exception:
            pass
    return DEFAULT_PROVIDERS

KEY_POOL = _build_pool()

class PoolManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._usage = {}
        self._health = {k: True for k in KEY_POOL}
        self._report = {"requests": 0, "tokens": 0, "failures": 0, "fallbacks": 0}
        # 新增：日用量 { "YYYY-MM-DD": {"requests": N, "tokens": N, "bots": {"bot_name": N}} }
        self._daily = {}
        # 新增：月K线 { "YYYY-MM": {"open": N, "high": N, "low": N, "close": N, "requests": N} }
        self._monthly = {}
        self._load()
    
    def _load(self):
        if not os.path.exists(STATE_FILE): return
        try:
            with open(STATE_FILE) as f:
                d = json.load(f)
            self._usage = d.get("usage", {})
            self._health = {k: d.get("health", {}).get(k, True) for k in KEY_POOL}
            self._report = d.get("report", self._report)
            self._daily = d.get("daily", {})
            self._monthly = d.get("monthly", {})
        except Exception as e:
            print(f"[状态] 加载失败: {e}")
    
    def _save(self):
        try:
            os.makedirs(STATE_DIR, exist_ok=True)
            with open(STATE_FILE, "w") as f:
                json.dump({"usage": self._usage, "health": self._health,
                    "report": self._report,
                    "daily": self._daily,
                    "monthly": self._monthly,
                    "updated_at": datetime.now(timezone.utc).isoformat()},
                    f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[状态] 保存失败: {e}")
    
    def _get_today(self):
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    def _get_month(self):
        return datetime.now(timezone.utc).strftime("%Y-%m")
    
    def record(self, name, tokens=0, ok=True, bot_name="anonymous"):
        with self._lock:
            now = datetime.now(timezone.utc)
            today = now.strftime("%Y-%m-%d")
            month = now.strftime("%Y-%m")
            
            # 总体报告
            self._report["requests"] += 1
            
            # Provider级别统计
            u = self._usage.setdefault(name, {"requests": 0, "tokens": 0, "failures": 0})
            if ok:
                self._report["tokens"] += tokens
                self._health[name] = True
                u["requests"] += 1
                u["tokens"] += tokens
                u["last_success"] = now.isoformat()
            else:
                self._report["failures"] += 1
                self._report["fallbacks"] += 1
                self._health[name] = False
                u["failures"] += 1
                u["last_fail"] = now.isoformat()
            
            # 日用量
            day_data = self._daily.setdefault(today, {"requests": 0, "tokens": 0, "bots": {}})
            day_data["requests"] += 1
            day_data["tokens"] += tokens
            bot_stats = day_data["bots"].setdefault(bot_name, {"requests": 0, "tokens": 0})
            bot_stats["requests"] += 1
            bot_stats["tokens"] += tokens
            
            # 月K线（简单实现：每日收盘值=当日tokens，月初/月末/最高/最低）
            month_data = self._monthly.setdefault(month, {
                "open": 0, "high": 0, "low": float('inf'), "close": 0, "requests": 0
            })
            month_data["requests"] += 1
            month_data["close"] = day_data["tokens"]
            if month_data["high"] < day_data["tokens"]:
                month_data["high"] = day_data["tokens"]
            if month_data["low"] > day_data["tokens"]:
                month_data["low"] = day_data["tokens"]
            if month_data["open"] == 0:
                month_data["open"] = day_data["tokens"]
            
            self._save()
    
    def candidates(self, hint=None):
        with self._lock:
            cs = []
            for n, c in KEY_POOL.items():
                if not self._health.get(n, True): continue
                m = hint or "auto"
                if m == "auto":
                    cs.append((c["priority"], n, c))
                elif m == c["model"] or m in c["model"] or c["model"] in m:
                    cs.append((c["priority"], n, c))
            if not cs:
                for n, c in KEY_POOL.items():
                    if self._health.get(n, True):
                        cs.append((c["priority"], n, c))
            random.shuffle([x for x in cs if x and x[0] == 0])
            cs.sort(key=lambda x: (x[0], random.random()))
            return [(n, c) for _, n, c in cs]
    
    def pool(self): return KEY_POOL
    def health(self): return dict(self._health)
    def usage(self): return dict(self._usage)
    def report(self): return dict(self._report)
    def daily(self): return dict(self._daily)
    def monthly(self): return dict(self._monthly)
    
    def reset_health(self):
        with self._lock:
            for k in KEY_POOL: self._health[k] = True
            self._save()
    
    def reset_usage(self):
        with self._lock:
            self._usage = {}
            self._report = {"requests": 0, "tokens": 0, "failures": 0, "fallbacks": 0}
            self._daily = {}
            self._monthly = {}
            self._save()
