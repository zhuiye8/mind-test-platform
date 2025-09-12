# 运行与部署

## 本地运行
- 前置：Python 环境、`pip install -r requirements.txt`（需具备 Flask/Flask-SocketIO 等依赖）
- 启动（推荐，本机/局域网一致）：`python emotion/app_lan.py` → `http://<host>:5678`

## 健康检查
- `GET /api/health`（契约）
- `GET /api/ai/config`

调试辅助（仅 app_lan，本地观察用）：
- `GET /api/lan/health`（与 /api/health 等价但含本机 IP 等调试信息）

## WebSocket
- 地址：`ws://<host>:5678/socket.io/`
- 允许跨域

## 配置
- 端口：`emotion/config.py` → `PORT=5678`
- SocketIO：`async_mode='threading'`，`cors_allowed_origins='*'`
- 回调：`app_lan.py` 中设置 Backend 基础地址与 Token

## 本地调试端点（不影响契约）
- `POST /api/simple/create_session`（本地简化创建，会话数据写入本地 JSON）
- `POST /api/simple/end_session`（本地简化结束，会触发 Finalize 回调作为兜底）

说明：正式联调请使用契约端点：
- `POST /api/create_session`
- `POST /api/end_session`

## 代理/网络
- 若命令行设置了 `http_proxy/https_proxy`，请为本机/局域网地址配置 `no_proxy`，例如：
  - `export no_proxy="localhost,127.0.0.1,172.31.0.0/16,192.168.0.0/16,10.0.0.0/8"`
