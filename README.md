# FJG Gateway - 冯家军统一API管理系统

## 启动

```bash
cd /home/agent/fjg-gateway

# 1. 编辑API Key
vim src/providers.json

# 2. 启动
sudo docker compose up -d

# 3. 验证
curl http://localhost:8088/health

# 4. 打开仪表盘
# http://容器IP:8088/
```

## Provider优先级

P0 智谱GLM-4-Flash (免费) → P1 阶跃Step-1v-32k (免费15天) → P2 DeepSeek (付费)

## 安全

- 使用 PROVIDERS_FILE 方式加载Key（Key不暴露在进程命令行中）
- providers.json 权限 600（仅属主可读）
