# AI 服务概览（emotion 项目）

## 架构与技术栈
- 应用框架: Flask + Flask-SocketIO（threading 模式）
- AI 模型: DeepFace、Emotion2Vec、PPG/Enhanced PPG
- 合约层: `contract_api` Blueprint（REST 契约与回调）
- 实时通信: Socket.IO（WebRTC 信令与监控）
- 运行端口: 5678（统一契约）

## 运行入口
- 本机开发: `python emotion/app.py`（127.0.0.1:5678）
- 局域网部署: `python emotion/app_lan.py`（0.0.0.0:5678）

## 关键模块
- `emotion/app_lan.py`：主应用（LAN，建议部署入口）
- `emotion/contract_api/`：契约 API 与回调
- `emotion/webrtc_signaling.py`：WebRTC/Socket.IO 信令处理
- `emotion/models/*`：AI 模型加载与推理
- `emotion/utils/*`：数据与 WebSocket 辅助
- `emotion/config.py`：全局配置（端口、CORS、SocketIO）

## 契约与事件
- REST 契约：`/api/health`、`/api/ai/config`、`/api/create_session`、`/api/end_session`
- 回调：AI→Backend `finalize`、`checkpoint`（`/api/ai-service/sessions/...`）
- Socket.IO：`signal.offer/answer/ice`、`session.heartbeat`、`monitor.update`
- 兼容事件：`webrtc-offer/webrtc-answer/ice-candidate`

调试辅助（仅 app_lan，不影响契约）：
- `/api/lan/health`、`/api/simple/create_session`、`/api/simple/end_session`

## 统一口径
- 端口固定 5678
- 字段命名 snake_case；时间戳 ISO8601 UTC（末尾 Z）
- 健康检查与配置以契约蓝图返回为准
