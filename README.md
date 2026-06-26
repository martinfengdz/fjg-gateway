# FJG Unified API Gateway v4.0

统一多提供商 API 网关，支持熔断、降级、统计、BOT 追踪、密码管理后台。

## 功能

| 功能 | 说明 |
|------|------|
| 多提供商路由 | Zhipu / StepFun / Xunfei 自动切换 |
| 熔断降级 | 失败自动降级到可用节点 |
| 日用量统计 | 按日期 + BOT 维度统计 |
| 月K线统计 | OHLC 趋势图 |
| BOT 追踪 | X-BOT-Name 头识别 |
| 密码管理后台 | 默认 123456 |
| 健康监控 | 实时节点状态 |

## 快速启动

```bash
cd /home/agent/fjg-gateway
python3 src/gateway.py
```

访问 http://localhost:8088/

## 配置

src/providers.json — 提供商列表（含 API Key）

## 升级

./upgrade.sh

## 版本历史

- v4.0.0 — 密码认证 + 日用量/月K线/BOT统计 + 管理后台
