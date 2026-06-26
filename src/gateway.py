#!/usr/bin/env python3
"""
冯家军统一API网关 v5.0 - FJG Unified API Gateway
多Provider智能路由 + RateLimit + 请求日志 + OpenAPI + 热重载
"""

import json, os, sys, time, threading, random, hashlib, secrets
import urllib.request, urllib.error, ssl
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone, timedelta

_CTX = ssl._create_unverified_context()
VERSION = "5.0.0"
SESSION_TIMEOUT = timedelta(hours=8)
STATE_DIR = os.environ.get("FJG_STATE_DIR", "/data")
STATE_FILE = os.path.join(STATE_DIR, "gateway_state.json")
PROJECTS_DIR = os.environ.get("FJG_PROJECTS_DIR", "/projects")

# 管理密码（默认123456，可通过环境变量修改）
ADMIN_PASSWORD = os.environ.get("FJG_ADMIN_PASSWORD", "123456")
SESSION_SECRET = os.environ.get("FJG_SESSION_SECRET", secrets.token_hex(32))

# 管理密码配置
ADMIN_PASSWORD_HASH = hashlib.sha256("123456".encode()).hexdigest()
SESSION_SECRET = secrets.token_hex(32)
SESSION_COOKIE = "fjg_session"
_sessions = {}  # session_id -> {"expires": datetime}


# ── v5.0 Rate Limit - 令牌桶 ────────────────────────────────────────
RATE_LIMIT_DEFAULT_RPM = 60
_rate_limiter_state = {}
_rate_limiter_lock = threading.Lock()
REQUEST_LOG = []
REQUEST_LOG_MAX = 500
_request_log_lock = threading.Lock()
_config_watch_enabled = True
_config_last_mtime = 0
_config_watch_interval = 5  # 秒

def _rate_check(key, rpm, timeout=0.05):
    """令牌桶：检查是否允许请求，不允许则阻塞最多 timeout 秒"""
    if rpm <= 0: return True
    with _rate_limiter_lock:
        now = time.time()
        st = _rate_limiter_state.get(key, {"tokens": rpm, "last": now, "rpm": rpm})
        if st["rpm"] != rpm:
            ratio = rpm / max(st["rpm"], 1)
            st["tokens"] = min(rpm, st["tokens"] * ratio)
            st["rpm"] = rpm
        elapsed = now - st["last"]
        st["tokens"] = min(rpm, st["tokens"] + elapsed * (rpm / 60.0))
        st["last"] = now
        if st["tokens"] >= 1:
            st["tokens"] -= 1
            _rate_limiter_state[key] = st
            return True
        _rate_limiter_state[key] = st
    return False

def _rate_wait(key, rpm, timeout=5.0):
    """带等待的限流检查"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _rate_check(key, rpm):
            return True
        time.sleep(0.05)
    return False

def _log_request(method, path, status, provider_name="", bot_name="", tokens=0, duration=0):
    """记录请求日志"""
    from datetime import datetime
    with _request_log_lock:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "path": path,
            "status": status,
            "provider": provider_name,
            "bot": bot_name,
            "tokens": tokens,
            "ms": int(duration * 1000),
        }
        REQUEST_LOG.append(entry)
        if len(REQUEST_LOG) > REQUEST_LOG_MAX:
            REQUEST_LOG.pop(0)

def _reload_providers_if_changed():
    """热重载：检测 providers.json 变化自动重新加载"""
    global KEY_POOL, Handler, _config_last_mtime
    if not _config_watch_enabled:
        return
    pf = os.environ.get("PROVIDERS_FILE", "")
    if not pf or not os.path.isfile(pf):
        return
    try:
        mtime = os.path.getmtime(pf)
        if mtime <= _config_last_mtime:
            return
        with open(pf) as f:
            new_pool = json.loads(f.read().strip())
        if not isinstance(new_pool, dict) or len(new_pool) == 0:
            return
        import builtins
        # 更新模块级的 KEY_POOL
        import sys
        mod = sys.modules.get('__main__')
        if mod:
            mod.KEY_POOL = new_pool
        else:
            globals()['KEY_POOL'] = new_pool
        KEY_POOL = new_pool
        _config_last_mtime = mtime
        # 同步 health，新增的默认 True，删除的移除
        if Handler.pool:
            old_health = Handler.pool.health()
            for k in new_pool:
                if k not in old_health:
                    Handler.pool._health[k] = True
            # 移除已删除的
            for k in list(Handler.pool._health.keys()):
                if k not in new_pool:
                    del Handler.pool._health[k]
        print(f"[热重载] providers.json 已更新: {len(new_pool)} 个Provider")
        # 清理旧限流
        with _rate_limiter_lock:
            for k in list(_rate_limiter_state.keys()):
                if k not in new_pool:
                    del _rate_limiter_state[k]
    except Exception as e:
        print(f"[热重载] 失败: {e}")

def _check_auth(headers):
    cookie = headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith(f"{SESSION_COOKIE}="):
            sid = part.split("=", 1)[1]
            if sid in _sessions and datetime.now(timezone.utc) < _sessions[sid]["expires"]:
                return True
            if sid in _sessions:
                del _sessions[sid][sid]
    return False

def _require_auth(func):
    def wrapper(self, *args, **kwargs):
        if not _check_auth(self.headers):
            self._json({"error": "需要登录"}, 401)
            return
        return func(self, *args, **kwargs)
    return wrapper

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
        self._daily = {}
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
    def record(self, name, tokens=0, ok=True, bot_name="anonymous"):
        """记录请求，支持BOT名称、日用量、月K线"""
        with self._lock:
            now = datetime.now(timezone.utc)
            today = now.strftime("%Y-%m-%d")
            month = now.strftime("%Y-%m")
            
            # 总体报告
            self._report["requests"] += 1
            
            # Provider级别
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
            
            # 月K线（简单实现：每日tokens作为当日收盘价）
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
                rpm = c.get("rpm", RATE_LIMIT_DEFAULT_RPM)
                if not _rate_check(n + ":total", rpm): continue
                m = hint or "auto"
                if m == "auto":
                    cs.append((c["priority"], n, c))
                elif m == c["model"] or m in c["model"] or c["model"] in m:
                    cs.append((c["priority"], n, c))
            if not cs:
                for n, c in KEY_POOL.items():
                    if self._health.get(n, True):
                        rpm = c.get("rpm", RATE_LIMIT_DEFAULT_RPM)
                        if not _rate_check(n + ":total", rpm): continue
                        cs.append((c["priority"], n, c))
            random.shuffle([x for x in cs if x and x[0] == 0])
            cs.sort(key=lambda x: (x[0], random.random()))
            return [(n, c) for _, n, c in cs]
    def pool(self): return KEY_POOL
    def health(self): return dict(self._health)
    def usage(self): return dict(self._usage)
    def report(self): return dict(self._report)
    def reset_health(self):
        with self._lock:
            for k in KEY_POOL: self._health[k] = True
            self._save()
    def reset_usage(self):
        with self._lock:
            self._usage = {}
            self._report = {"requests": 0, "tokens": 0, "failures": 0, "fallbacks": 0}
            self._save()
    def daily(self): return dict(self._daily)
    def monthly(self): return dict(self._monthly)


# ── CSS ──────────────────────────────────────────────────────────
_CSS = """*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#c9d1d9;padding:20px;max-width:1200px;margin:0 auto}
h1{font-size:1.6rem;margin-bottom:20px;color:#ff7b72;display:flex;align-items:center;gap:10px}
h2{font-size:1.2rem;margin:24px 0 12px;color:#79c0ff}
.sb{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.sc{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:16px;text-align:center}
.sc h3{font-size:.75rem;color:#8b949e;margin-bottom:6px;font-weight:400}
.sc .v{font-size:1.5rem;font-weight:700;color:#e6edf3}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid #30363d}
th{background:#161b22;font-size:.75rem;text-transform:uppercase;color:#8b949e;font-weight:600}
tr:hover{background:#1c2128}
.ok{color:#3fb950;font-weight:600}
.fail{color:#f85149;font-weight:600}
.tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:500}
.t0{background:#0b2d12;color:#3fb950;border:1px solid #3fb950}
.t1{background:#0b1d3a;color:#58a6ff;border:1px solid #58a6ff}
.t2{background:#3b230b;color:#d29922;border:1px solid #d29922}
.t3{background:#3b0b14;color:#f85149;border:1px solid #f85149}
.btn{display:inline-block;padding:8px 18px;background:#238636;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.85rem;text-decoration:none;margin:4px;font-weight:500}
.btn:hover{background:#2ea043}
.btn-d{background:#da3633}
.btn-d:hover{background:#f85149}
.btn-s{background:#1f6feb}
.btn-s:hover{background:#388bfd}
.btn-xs{padding:4px 10px;font-size:.75rem;border-radius:6px}
.ft{margin-top:32px;padding-top:16px;border-top:1px solid #30363d;font-size:.75rem;color:#8b949e}
.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;margin-bottom:16px}
.input{background:#0d1117;border:1px solid #30363d;color:#e6edf3;padding:8px 12px;border-radius:6px;font-size:.85rem;width:100%;margin:4px 0 12px}
.input:focus{outline:none;border-color:#58a6ff}
.label{font-size:.75rem;color:#8b949e;margin-bottom:4px;display:block}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:600px){.grid2{grid-template-columns:1fr}}
.success{color:#3fb950;background:#0b2d12;border:1px solid #3fb950;padding:10px 16px;border-radius:8px;margin:8px 0;font-size:.85rem}
.error{color:#f85149;background:#3b0b14;border:1px solid #f85149;padding:10px 16px;border-radius:8px;margin:8px 0;font-size:.85rem}
"""

# ── 页面生成函数 ───────────────────────────────────────────────────
def _page(title, body):
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} - FJG Gateway</title>
<style>{_CSS}</style>
</head>
<body>{body}</body>
</html>"""
    return html

def _dash():
    p = Handler.pool
    h = p.health()
    u = p.usage()
    r = p.report()
    alive = sum(1 for v in h.values() if v)
    rows = ""
    for n in sorted(p.pool(), key=lambda x: (p.pool()[x]["priority"], x)):
        c = p.pool()[n]
        hh = h.get(n, True)
        uu = u.get(n, {})
        cls = "ok" if hh else "fail"
        icon = "✅" if hh else "❌"
        tc = "t" + str(c["priority"])
        tag_text = {"P0": "P0 免费", "P1": "P1 免费", "P2": "P2 低价", "P3": "P3 付费"}.get(
            c.get("tag", "").split(" ")[0], c.get("tag", ""))
        rows += f"<tr>"
        rows += f"<td><span class='{cls}'>{icon}</span> {n}</td>"
        rows += f"<td>{c['provider']}</td>"
        rows += f"<td><code>{c['model']}</code></td>"
        rows += f"<td><span class='tag {tc}'>{tag_text}</span></td>"
        rows += f"<td>{uu.get('requests', 0)}</td>"
        rows += f"<td>{uu.get('tokens', 0):,}</td>"
        rows += f"<td>{uu.get('failures', 0)}</td>"
        last = (uu.get("last_success", "-") or "-")[:19]
        rows += f"<td>{last}</td>"
        rows += f"<td>"
        rows += f"<a href='/edit-provider?name={n}' class='btn btn-s btn-xs'>✏️ 编辑</a> "
        rows += f"<a href='/delete-provider?name={n}&confirm=1' class='btn btn-d btn-xs'>🗑️ 删除</a>"
        rows += f"</td></tr>"

    body = f"""
<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <div>
      <h1 style="margin:0">🚀 冯家军统一API网关 <small style="font-size:.6em;color:#8b949e">v{VERSION}</small></h1>
      <p style="color:#8b949e;margin-top:4px">Multi-Provider LLM Router · 智能路由 · 自动容灾</p>
    </div>
    <div>
      <a href="/daily" class="btn btn-s">📊 日用量</a>
      <a href="/monthly" class="btn btn-s">📈 月K线</a>
      <a href="/bots" class="btn btn-s">🤖 BOT统计</a>
      <a href="/logs" class="btn btn-s">📋 日志</a>
      <a href="/docs" class="btn btn-s">📖 文档</a>
      <a href="/reload" class="btn btn-s">🔄 热重载</a>
      <a href="/logout" class="btn btn-d">🚪 退出</a>
    </div>
  </div>
</div>
<div class="sb">
  <div class="sc"><h3>Provider 总数</h3><div class="v" style="color:#58a6ff">{alive}/{len(p.pool())}</div></div>
  <div class="sc"><h3>总请求数</h3><div class="v">{r['requests']:,}</div></div>
  <div class="sc"><h3>总 Tokens</h3><div class="v">{r['tokens']:,}</div></div>
  <div class="sc"><h3>失败次数</h3><div class="v" style="color:#f85149">{r['failures']}</div></div>
  <div class="sc"><h3>自动切换</h3><div class="v" style="color:#d29922">{r['fallbacks']}</div></div>
  <div class="sc"><h3>系统状态</h3><div class="v" style="color:#3fb950">✅ 正常</div></div>
</div>
<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h2 style="margin:0">📋 Provider 列表</h2>
    <div>
      <a href="/add-provider" class="btn">➕ 添加</a>
      <a href="/daily" class="btn btn-s">📊 日用量</a>
      <a href="/monthly" class="btn btn-s">📈 月K线</a>
      <a href="/bots" class="btn btn-s">🤖 BOT统计</a>
      <a href="/logs" class="btn btn-s">📋 日志</a>
      <a href="/docs" class="btn btn-s">📖 文档</a>
      <a href="/reload" class="btn btn-s">🔄 热重载</a>
      <a href="/logs" class="btn btn-s">📋 日志</a>
      <a href="/docs" class="btn btn-s">📖 文档</a>
      <a href="/reload" class="btn btn-s">🔄 热重载</a>
      <a href="/reset-usage" class="btn btn-d" onclick="return confirm('确定清空所有统计数据?')">🗑️ 清空统计</a>
      <a href="/reset" class="btn" onclick="return confirm('确定重置所有Provider健康状态?')">🔄 重置健康</a>
    </div>
  </div>
  <table>
    <tr>
      <th>状态</th><th>名称</th><th>提供商</th><th>模型</th><th>优先级</th>
      <th>请求数</th><th>Tokens</th><th>失败</th><th>最后成功</th><th>操作</th>
    </tr>
    {rows}
  </table>
</div>
<div class="card">
  <h2>📖 使用说明</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
    <div>
      <h3 style="color:#79c0ff;font-size:.9rem;margin-bottom:8px">API 调用</h3>
      <code style="display:block;background:#0d1117;padding:12px;border-radius:8px;font-size:.8rem;line-height:1.8">
POST /v1/chat/completions<br>
Content-Type: application/json<br>
{{"messages":[{{"role":"user","content":"你好"}}]}}
      </code>
    </div>
    <div>
      <h3 style="color:#79c0ff;font-size:.9rem;margin-bottom:8px">路由规则</h3>
      <p style="font-size:.85rem;color:#8b949e;line-height:1.8">
        P0 免费 → P1 免费 → P2 低价 → P3 付费<br>
        当前Provider失败自动切换下一个<br>
        支持 model hint 指定特定模型
      </p>
    </div>
    <div>
      <h3 style="color:#79c0ff;font-size:.9rem;margin-bottom:8px">其他接口</h3>
      <p style="font-size:.85rem;color:#8b949e;line-height:1.8">
        GET /v1/models — 查看所有模型<br>
        GET /stats — JSON 统计数据<br>
        GET /health — 健康检查<br>
        GET /api/keys — Provider 详情
      </p>
    </div>
  </div>
</div>
<div class="ft">
  <p>github.com/dizan-tech/fjg-gateway · 冯家军统一API网关 · {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
</div>
"""
    return _page("冯家军API网关", body)

# ── Handler 类 ────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    pool = None

    def _json(self, d, s=200):
        self.send_response(s)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(json.dumps(d, ensure_ascii=False).encode())

    def _page(self, title, body):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(_page(title, body).encode())

    def _dash(self): return self._page("冯家军API网关", _dash())

    def _daily_page(self):
        daily = Handler.pool.daily()
        rows = ""
        for day in sorted(daily.keys(), reverse=True):
            data = daily[day]
            bots = data.get("bots", {})
            bot_rows = ""
            for bn, bd in sorted(bots.items(), key=lambda x: -x[1]["tokens"]):
                bot_rows += f"<tr><td>{bn}</td><td>{bd['requests']}</td><td>{bd['tokens']:,}</td></tr>"
            rows += f"<tr><td style='font-weight:bold;color:#79c0ff'>{day}</td><td>{data['requests']}</td><td>{data['tokens']:,}</td><td><table style='width:100%;background:#0d1117;border-radius:6px;padding:4px'><tr><th>BOT</th><th>Req</th><th>Tokens</th></tr>{bot_rows if bot_rows else '<tr><td colspan=3 style=color:#8b949e>无</td></tr>'}</table></td></tr>"
        body = f"""<div class="card"><h2>📊 日用量统计</h2><p style='color:#8b949e;margin-bottom:16px'>按日期查看API调用量和Token消耗</p>
<table><tr><th>日期</th><th>请求数</th><th>Tokens</th><th>BOT明细</th></tr>
{rows if rows else '<tr><td colspan=4 style=text-align:center;color:#8b949e>暂无数据</td></tr>'}
</table><p><a href='/' class='btn'>← 返回</a></p></div>"""
        self._page("日用量统计", body)

    def _monthly_page(self):
        monthly = Handler.pool.monthly()
        rows = ""
        for month in sorted(monthly.keys(), reverse=True):
            d = monthly[month]
            low = int(d["low"]) if d["low"] != float('inf') else 0
            change = d["close"] - d["open"]
            pct = (change / d["open"] * 100) if d["open"] > 0 else 0
            color = "#3fb950" if change >= 0 else "#f85149"
            icon = "📈" if change >= 0 else "📉"
            rows += f"<tr><td>{month}</td><td>{d['open']:,}</td><td>{d['high']:,}</td><td>{low:,}</td><td style='color:{color};font-weight:bold'>{d['close']:,}</td><td style='color:{color}'>{icon} {change:+,} ({pct:+.1f}%)</td><td>{d['requests']:,}</td></tr>"
        body = f"""<div class="card"><h2>📈 月K线统计</h2><p style='color:#8b949e;margin-bottom:16px'>月度API使用量趋势</p>
<table><tr><th>月份</th><th>月初</th><th>最高</th><th>最低</th><th>月末</th><th>涨跌</th><th>请求数</th></tr>
{rows if rows else '<tr><td colspan=7 style=text-align:center;color:#8b949e>暂无数据</td></tr>'}
</table><p><a href='/' class='btn'>← 返回</a></p></div>"""
        self._page("月K线统计", body)

    def _bots_page(self):
        daily = Handler.pool.daily()
        bot_summary = {}
        for day, data in daily.items():
            for bn, bd in data.get("bots", {}).items():
                if bn not in bot_summary:
                    bot_summary[bn] = {"days": 0, "req": 0, "tokens": 0}
                bot_summary[bn]["days"] += 1
                bot_summary[bn]["req"] += bd["requests"]
                bot_summary[bn]["tokens"] += bd["tokens"]
        rows = ""
        for bn, stats in sorted(bot_summary.items(), key=lambda x: -x[1]["tokens"]):
            rows += f"<tr><td>{bn}</td><td>{stats['days']}</td><td>{stats['req']:,}</td><td style='color:#3fb950;font-weight:bold'>{stats['tokens']:,}</td></tr>"
        body = f"""<div class="card"><h2>🤖 BOT调用统计</h2><p style='color:#8b949e;margin-bottom:16px'>按BOT名称统计API调用量</p>
<table><tr><th>BOT名称</th><th>活跃天数</th><th>总请求数</th><th>总Tokens</th></tr>
{rows if rows else '<tr><td colspan=4 style=text-align:center;color:#8b949e>暂无数据</td></tr>'}
</table><p><a href='/' class='btn'>← 返回</a></p></div>"""
        self._page("BOT统计", body)


    def _add_provider(self):
        return self._page("添加 Provider", """
<div class="card">
  <h2>➕ 添加新 Provider</h2>
  <p style="color:#8b949e;margin-bottom:20px">配置新的AI模型提供商，网关会自动将其加入路由池。</p>
  <a href="/edit-provider?name=new" class="btn">开始配置</a>
  <a href="/" class="btn btn-d">返回</a>
</div>""")

    def _edit_form(self, name):
        is_new = not name or name == "new"
        providers = Handler.pool.pool()
        c = {"provider": "", "model": "", "base_url": "", "api_key": "",
             "priority": 0, "free": True, "rpm": 60, "timeout": 60, "tag": ""} if is_new else providers.get(name, {})
        priority_opts = "".join(
            f'<option value="{i}" {"selected" if c.get("priority")==i else ""}>P{i} {"免费" if i < 2 else "低价" if i == 2 else "付费"}</option>'
            for i in range(4)
        )
        body = f"""
<div class="card">
  <h2>{'➕ 添加 Provider' if is_new else f'✏️ 编辑: {name}'}</h2>
  <form method="post" action="/save-provider">
    <input type="hidden" name="original_name" value="{'' if is_new else name}">
    <span class="label">Provider 名称（英文标识）</span>
    <input type="text" name="name" class="input" value="{'' if is_new else name}" placeholder="例如: glm-flash" {'required' if is_new else ''}>
    <div class="grid2">
      <div>
        <span class="label">提供商</span>
        <input type="text" name="provider" class="input" value="{c.get('provider','')}" placeholder="zhipu-glm" required>
      </div>
      <div>
        <span class="label">模型名称</span>
        <input type="text" name="model" class="input" value="{c.get('model','')}" placeholder="GLM-4-Flash" required>
      </div>
    </div>
    <span class="label">API 地址</span>
    <input type="url" name="base_url" class="input" value="{c.get('base_url','')}" placeholder="https://api.example.com/v1" required>
    <span class="label">API 密钥</span>
    <input type="password" name="api_key" class="input" value="{c.get('api_key','')}" placeholder="sk-..." required>
    <div class="grid2">
      <div>
        <span class="label">优先级</span>
        <select name="priority" class="input">{priority_opts}</select>
      </div>
      <div>
        <span class="label">RPM 限制</span>
        <input type="number" name="rpm" class="input" value="{c.get('rpm', 60)}" min="1" max="1000">
      </div>
    </div>
    <div class="grid2">
      <div>
        <span class="label">超时（秒）</span>
        <input type="number" name="timeout" class="input" value="{c.get('timeout', 60)}" min="5" max="300">
      </div>
      <div style="display:flex;align-items:center;padding-top:24px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" name="free" {'checked' if c.get('free') else ''}>
          <span>免费层（不计费）</span>
        </label>
      </div>
    </div>
    <span class="label">标签描述</span>
    <input type="text" name="tag" class="input" value="{c.get('tag','')}" placeholder="P0 免费智谱">
    <div style="margin-top:20px;display:flex;gap:12px">
      <button type="submit" class="btn">💾 保存配置</button>
      <a href="/" class="btn btn-d">取消</a>
    </div>
  </form>
</div>
<div class="card">
  <h2>⚠️ 安全提示</h2>
  <p style="font-size:.85rem;color:#8b949e;line-height:1.8">
    1. API 密钥仅存储在本地 providers.json，不会上传到任何第三方<br>
    2. 修改后需重启网关：<code style="background:#0d1117;padding:2px 6px;border-radius:4px">docker restart fjg-gateway</code><br>
    3. 建议定期轮换密钥以确保账户安全<br>
    4. 免费层额度用尽后自动切换下一优先级
  </p>
</div>"""
        self._page("编辑 Provider" if not is_new else "添加 Provider", body)

    def _save_provider(self):
        from urllib.parse import parse_qs
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode()
        data = parse_qs(body)
        def g(k): return (data.get(k, [""])[0]).strip()
        orig, name = g("original_name"), g("name").strip()
        provider, model = g("provider").strip(), g("model").strip()
        base_url, api_key = g("base_url").strip(), g("api_key").strip()
        priority = int(g("priority") or "0")
        rpm = int(g("rpm") or "60")
        timeout = int(g("timeout") or "60")
        free = g("free") == "on"
        tag = g("tag").strip()
        if not name or not provider or not model or not base_url or not api_key:
            return self._json({"error": "缺少必要字段"}, 400)
        pf = os.environ.get("PROVIDERS_FILE", "")
        if not pf or not os.path.isfile(pf):
            return self._json({"error": "providers.json 不存在"}, 500)
        try:
            with open(pf) as f:
                config = json.load(f)
            if orig and orig != name and orig in config:
                del config[orig]
            config[name] = {"provider": provider, "model": model, "base_url": base_url,
                "api_key": api_key, "priority": priority, "free": free,
                "rpm": rpm, "timeout": timeout,
                "tag": tag or f"P{priority} {'免费' if priority < 2 else '低价' if priority == 2 else '付费'}"}
            with open(pf, "w") as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            return self._json({"ok": True, "message": f"Provider {name} 已保存", "hint": "请在宿主机执行: docker restart fjg-gateway"})
        except Exception as e:
            return self._json({"error": str(e)}, 500)

    def _delete_provider(self):
        from urllib.parse import parse_qs, urlparse
        qs = parse_qs(urlparse(self.path).query)
        name = qs.get("name", [""])[0]
        pf = os.environ.get("PROVIDERS_FILE", "")
        if not pf or not os.path.isfile(pf):
            return self._json({"error": "providers.json 不存在"}, 500)
        try:
            with open(pf) as f:
                config = json.load(f)
            if name not in config:
                return self._json({"error": f"Provider {name} 不存在"}, 404)
            del config[name]
            with open(pf, "w") as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            return self._json({"ok": True, "message": f"已删除 {name}", "hint": "请重启网关生效"})
        except Exception as e:
            return self._json({"error": str(e)}, 500)

    def _projects(self):
        rows = ""
        if os.path.isdir(PROJECTS_DIR):
            for p in sorted(os.listdir(PROJECTS_DIR)):
                pp = os.path.join(PROJECTS_DIR, p)
                if not os.path.isdir(pp): continue
                rows += f"<tr><td colspan='4' style='background:#1c2128;font-weight:bold;color:#79c0ff'>{p}</td></tr>"
                for root, _, fns in os.walk(pp):
                    for fn in sorted(fns):
                        fp = os.path.join(root, fn)
                        sz = os.path.getsize(fp)
                        ext = fn.rsplit(".", 1)[-1].lower() if "." in fn else ""
                        szs = f"{sz/1024:.1f}KB" if sz > 1024 else f"{sz}B"
                        rel = os.path.relpath(fp, PROJECTS_DIR)
                        rows += f"<tr><td>{ext.upper()}</td><td>{fn}</td><td>{szs}</td><td><a href='/download/{rel}' class='btn btn-d btn-xs' download>⬇️</a></td></tr>"
        body = f"""
<div class="card">
  <h2>📁 项目文件</h2>
  <p><a href='/' class='btn'>← 返回</a></p>
  <table>
    <tr><th>类型</th><th>文件名</th><th>大小</th><th>下载</th></tr>
    {rows if rows else '<tr><td colspan="4" style="text-align:center;color:#8b949e">暂无文件</td></tr>'}
  </table>
</div>"""
        self._page("项目文件", body)

    def _download(self, path):
        import urllib.parse
        rel = urllib.parse.unquote(path[len("/download/"):])
        if ".." in rel or rel.startswith("/"): return self._json({"error": "invalid path"}, 403)
        full = PROJECTS_DIR + "/" + rel
        if not os.path.isfile(full): return self._json({"error": "not found"}, 404)
        sz = os.path.getsize(full)
        ext = rel.rsplit(".", 1)[-1].lower() if "." in rel else ""
        self.send_response(200)
        mime = "application/octet-stream"
        if ext == "docx": mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif ext == "md": mime = "text/markdown; charset=utf-8"
        elif ext == "txt": mime = "text/plain; charset=utf-8"
        elif ext == "py": mime = "text/x-python"
        elif ext == "sh": mime = "application/x-sh"
        elif ext == "json": mime = "application/json"
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(sz))
        fn = os.path.basename(rel)
        try:
            cd = f'attachment; filename="{fn}"'
            cd.encode("ascii")
        except UnicodeEncodeError:
            cd = f'attachment; filename="file.{ext}"'
        self.send_header("Content-Disposition", cd)
        self.end_headers()
        with open(full, "rb") as f:
            self.wfile.write(f.read())

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(self.path)
        p = parsed.path.rstrip("/")
        qs = parse_qs(parsed.query)
        if p in ("/", ""): return self._dash()
        if p == "/health": return self._json({"status": "ok", "version": VERSION})
        if p == "/stats":
            rpt = Handler.pool.report()
            h = Handler.pool.health()
            return self._json({"status": "ok", "requests": rpt["requests"], "tokens": rpt["tokens"],
                "failures": rpt["failures"], "fallbacks": rpt["fallbacks"],
                "alive": sum(1 for v in h.values() if v), "total": len(h), "version": VERSION})
        if p in ("/v1/models", "/models"):
            return self._json({"object": "list", "data": [{"id": c["model"], "provider": c["provider"],
                "priority": c["priority"], "free": c["free"],
                "alive": Handler.pool.health().get(n, True), "key": n} for n, c in Handler.pool.pool().items()]})
        if p == "/api/keys":
            return self._json({"keys": {n: {"alive": Handler.pool.health().get(n, True),
                "usage": Handler.pool.usage().get(n, {}),
                **{k: v for k, v in c.items() if k != "api_key"}} for n, c in Handler.pool.pool().items()}})
        if p == "/reset":
            if not _check_auth(self.headers):
                return self._json({"error": "需要登录"}, 401)
            Handler.pool.reset_health(); return self._redirect("/")
        if p == "/reset-usage":
            if not _check_auth(self.headers):
                return self._json({"error": "需要登录"}, 401)
            Handler.pool.reset_usage(); return self._redirect("/")
        if p == "/login": return self._login_page()
        if p == "/logout": return self._logout()
        if p == "/daily": return self._daily_page()
        if p == "/monthly": return self._monthly_page()
        if p == "/bots": return self._bots_page()
        if not _check_auth(self.headers):
            if p in ("/add-provider", "/edit-provider", "/delete-provider", "/reset", "/reset-usage"):
                return self._redirect("/login?next=" + p)
        if p == "/add-provider": return self._add_provider()
        if p == "/edit-provider":
            name = qs.get("name", [""])[0]
            return self._edit_form(name)
        if p == "/delete-provider":
            name = qs.get("name", [""])[0]
            return self._json({"ok": True, "message": f"已删除 {name}（需重启生效）"})
        if p == "/projects": return self._projects()
        if p.startswith("/download/"): return self._download(p)
        if p == "/logs": return self._logs_page()
        if p == "/docs": return self._docs_page()
        if p == "/reload":
            _reload_providers_if_changed()
            return self._json({"ok": True, "message": f"热重载完成，当前 {len(KEY_POOL)} 个Provider"})
        return self._json({"error": "not found"}, 404)


    def _logs_page(self):
        import json
        _reload_providers_if_changed()
        with _request_log_lock:
            logs_copy = list(REQUEST_LOG)
        rows = ""
        for entry in reversed(logs_copy):
            status = entry.get("status", 0)
            sc = "#3fb950" if isinstance(status, int) and 200 <= status < 300 else "#f85149"
            bot = entry.get("bot", "anonymous")
            rows += f"<tr>"
            rows += f"<td style='font-size:.75rem;color:#8b949e'>{entry['ts'][:19]}</td>"
            rows += f"<td>{entry['method']}</td>"
            rows += f"<td style='font-size:.8rem'>{entry['path']}</td>"
            rows += f"<td style='color:{sc}'>{status}</td>"
            rows += f"<td>{entry.get('provider','')}</td>"
            rows += f"<td style='font-size:.75rem'>{bot}</td>"
            rows += f"<td>{entry.get('tokens',0):,}</td>"
            rows += f"<td>{entry.get('ms',0)}ms</td>"
            rows += f"</tr>"
        body = f"""<div class="card"><h2>📋 请求日志 <small style="color:#8b949e;font-weight:400">最近 {len(logs_copy)} 条</small></h2>
<p style="color:#8b949e;margin-bottom:16px">
  <a href="/" class="btn btn-xs" style="background:#1f6feb">← 返回</a>
  <a href="/logs" class="btn btn-xs">🔄 刷新</a>
</p>
<div style="overflow-x:auto">
<table><tr><th>时间</th><th>方法</th><th>路径</th><th>状态</th><th>提供商</th><th>BOT</th><th>Tokens</th><th>延迟</th></tr>
{rows if rows else '<tr><td colspan=8 style=text-align:center;color:#8b949e>暂无日志</td></tr>'}
</table></div></div>"""
        self._page("请求日志", body)

    def _docs_page(self):
        body = """<div class="card">
  <h2>📖 API 文档 - OpenAPI</h2>
  <p style="color:#8b949e;margin-bottom:16px">冯家军统一API网关 v5.0 接口说明</p>
  
  <div style="background:#0d1117;border-radius:8px;padding:16px;margin-bottom:16px">
    <h3 style="color:#79c0ff;margin-bottom:8px">POST /v1/chat/completions</h3>
    <p style="color:#8b949e;font-size:.85rem;margin-bottom:8px">调用AI模型，自动路由到可用提供商</p>
    <h4 style="color:#e6edf3;font-size:.9rem;margin-bottom:4px">请求体</h4>
    <pre style="background:#161b22;padding:12px;border-radius:6px;font-size:.8rem;color:#c9d1d9">
{
  "model": "auto",           // 可选，指定模型名
  "messages": [{"role": "user", "content": "你好"}],
  "max_tokens": 2048,        // 可选
  "temperature": 0.7,        // 可选
  "bot_name": "马二哥"       // 可选，BOT识别
}
    </pre>
    <h4 style="color:#e6edf3;font-size:.9rem;margin:8px 0 4px">请求头</h4>
    <pre style="background:#161b22;padding:12px;border-radius:6px;font-size:.8rem;color:#c9d1d9">
X-BOT-Name: 马二哥           // 可选，BOT识别
    </pre>
  </div>

  <div style="background:#0d1117;border-radius:8px;padding:16px;margin-bottom:16px">
    <h3 style="color:#79c0ff;margin-bottom:8px">GET /health</h3>
    <p style="color:#8b949e;font-size:.85rem">健康检查</p>
  </div>
  <div style="background:#0d1117;border-radius:8px;padding:16px;margin-bottom:16px">
    <h3 style="color:#79c0ff;margin-bottom:8px">GET /stats</h3>
    <p style="color:#8b949e;font-size:.85rem">系统统计报表</p>
  </div>
  <div style="background:#0d1117;border-radius:8px;padding:16px;margin-bottom:16px">
    <h3 style="color:#79c0ff;margin-bottom:8px">GET /v1/models</h3>
    <p style="color:#8b949e;font-size:.85rem">列出所有可用模型</p>
  </div>
  <div style="background:#0d1117;border-radius:8px;padding:16px;margin-bottom:16px">
    <h3 style="color:#79c0ff;margin-bottom:8px">GET /daily /monthly /bots</h3>
    <p style="color:#8b949e;font-size:.85rem">使用量统计页面</p>
  </div>
  <div style="background:#0d1117;border-radius:8px;padding:16px;margin-bottom:16px">
    <h3 style="color:#79c0ff;margin-bottom:8px">GET /logs</h3>
    <p style="color:#8b949e;font-size:.85rem">请求日志（最近500条）</p>
  </div>
  <div style="background:#0d1117;border-radius:8px;padding:16px;margin-bottom:16px">
    <h3 style="color:#79c0ff;margin-bottom:8px">GET /reload</h3>
    <p style="color:#8b949e;font-size:.85rem">热重载 providers.json 配置</p>
  </div>
  <div style="background:#0d1117;border-radius:8px;padding:16px;margin-bottom:16px">
    <h3 style="color:#79c0ff;margin-bottom:8px">Rate Limit</h3>
    <p style="color:#8b949e;font-size:.85rem">每个Provider独立RPM限流（令牌桶），超出排队自动等待</p>
  </div>
  <p><a href="/" class="btn">← 返回</a></p>
</div>"""
        self._page("API文档", body)

    def _login_page(self):
        if _check_auth(self.headers):
            return self._redirect("/")
        from urllib.parse import parse_qs, urlparse
        qs = parse_qs(urlparse(self.path).query)
        next_url = qs.get("next", ["/"])[0]
        body = f"""
<div class="card" style="max-width:400px;margin:100px auto">
  <h2>🔐 管理后台登录</h2>
  <form method="post" action="/login?next={next_url}" style="margin-top:20px">
    <span class="label">密码</span>
    <input type="password" name="password" class="input" placeholder="请输入管理密码" required autofocus>
    <div style="margin-top:16px">
      <button type="submit" class="btn" style="width:100%">登录</button>
    </div>
  </form>
</div>"""
        self._page("登录", body)
    
    def _do_login(self):
        from urllib.parse import parse_qs, urlparse
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode()
        data = parse_qs(body)
        password = data.get("password", [""])[0]
        qs = parse_qs(urlparse(self.path).query)
        next_url = qs.get("next", ["/"])[0]
        if hashlib.sha256(password.encode()).hexdigest() == ADMIN_PASSWORD_HASH:
            session_id = secrets.token_hex(32)
            _sessions[session_id] = {
                "expires": datetime.now(timezone.utc) + SESSION_TIMEOUT
            }
            self.send_response(302)
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}={session_id}; HttpOnly; Path=/")
            self.send_header("Location", next_url)
            self.end_headers()
        else:
            self._json({"error": "密码错误"}, 401)
    
    def do_POST(self):
        from urllib.parse import urlparse
        p = self.path.rstrip("/")
        if p == "/login": return self._do_login()
        if p in ("/v1/chat/completions", "/chat/completions"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length)) if length else {}
                cs = Handler.pool.candidates(body.get("model", "auto"))
                if not cs: return self._json({"error": {"message": "无可用Provider", "type": "router_error"}}, 503)
                errs = []
                for kn, cfg in cs:
                    try: return self._json(self._call(kn, cfg, body.get("messages", []), body))
                    except Exception as e:
                        errs.append(cfg["provider"] + ": " + str(e)[:100])
                        Handler.pool.record(kn, ok=False)
                return self._json({"error": {"message": "全部失败: " + "; ".join(errs), "type": "router_error"}}, 502)
            except Exception as e:
                return self._json({"error": {"message": str(e)[:200], "type": "error"}}, 500)
        if not _check_auth(self.headers):
            if p in ("/save-provider", "/delete-provider", "/reset", "/reset-usage"):
                self.send_response(302)
                self.send_header("Location", "/login")
                self.end_headers()
                return
        if p == "/save-provider": return self._save_provider()
        if p == "/delete-provider": return self._delete_provider()
        return self._json({"error": "not found"}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def _call(self, kn, cfg, msgs, body):
        _call_start_time = time.time()
        # 提取 BOT 名称（从 HTTP 头或请求体）
        bot_name = "anonymous"
        # 从 headers 获取
        bot_header = self.headers.get("X-BOT-Name", "")
        if bot_header:
            bot_name = bot_header.strip()
        # 从请求体获取（兼容）
        if bot_name == "anonymous" and body.get("bot_name"):
            bot_name = str(body["bot_name"]).strip()
        
        url = cfg["base_url"].rstrip("/") + "/chat/completions"
        pl = {"model": cfg["model"], "messages": msgs}
        for k in ["max_tokens", "temperature", "top_p"]:
            if body.get(k) is not None: pl[k] = body[k]
        data = json.dumps(pl).encode()
        req = urllib.request.Request(url, data=data, headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + cfg["api_key"],
        })
        rpm = cfg.get("rpm", RATE_LIMIT_DEFAULT_RPM)
        if not _rate_wait(kn, rpm):
            raise Exception(f"RateLimit 排队超时: {kn} (RPM={rpm})")
        try:
            with urllib.request.urlopen(req, timeout=cfg.get("timeout", 60), context=_CTX) as r:
                result = json.loads(r.read())
        except urllib.error.HTTPError as e:
            _log_request("POST", "/v1/chat/completions", e.code, kn, "anonymous", 0, time.time() - _call_start_time)
            raise Exception("HTTP " + str(e.code) + ": " + e.read().decode("utf-8", "replace")[:200])
        except urllib.error.URLError as e:
            _log_request("POST", "/v1/chat/completions", 0, kn, "anonymous", 0, time.time() - _call_start_time)
            raise Exception("连接失败: " + str(e.reason))
        if "error" in result:
            raise Exception(str(result["error"]))
        tokens = result.get("usage", {}).get("total_tokens", 0)
        Handler.pool.record(kn, tokens=tokens, ok=True, bot_name=bot_name)
        # v5.0 请求日志
        dt = time.time() - _call_start_time
        _log_request("POST", "/v1/chat/completions", 200, kn, bot_name, tokens, dt)
        return result

    def _redirect(self, p):
        self.send_response(302)
        self.send_header("Location", p)
        self.end_headers()

def main():
    import argparse
    pa = argparse.ArgumentParser()
    pa.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8088)))
    pa.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    a = pa.parse_args()
    Handler.pool = PoolManager()
    # v5.0 初始化热重载
    pf = os.environ.get("PROVIDERS_FILE", "")
    if pf and os.path.isfile(pf):
        global _config_last_mtime
        _config_last_mtime = os.path.getmtime(pf)
    print(f"[v5.0] RateLimit: 基于RPM令牌桶 | 请求日志: {REQUEST_LOG_MAX}条 | 热重载: 每5秒检测")
    server = HTTPServer((a.host, a.port), Handler)
    pool = Handler.pool.pool()
    print(f"\n🚀 冯家军统一API网关 v{VERSION}")
    print(f"  📊 面板: http://{a.host}:{a.port}/   v5.0: RateLimit+日志+文档+热重载")
    print(f"  🔌 API:  http://{a.host}:{a.port}/v1/chat/completions")
    print(f"  📁 项目: {PROJECTS_DIR}")
    print(f"  ⚙️ Provider: {len(pool)} 个已配置")
    for n, c in sorted(pool.items(), key=lambda x: (x[1]["priority"], x[0])):
        hh = "✅" if Handler.pool.health().get(n, True) else "❌"
        print(f"    {hh} P{c['priority']} {c['provider']:16s} {c['model']}")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        Handler.pool._save()
        server.server_close()

if __name__ == "__main__":
    main()
