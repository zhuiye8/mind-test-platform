# 前端重构指南（监控大屏）

目标：提供监控大屏（聚合视图）与单会话诊断页，基于 WebRTC + Socket.IO 与 AI 服务联动。使用 React + Vite + TypeScript。

## 1. 页面与路由
- `/monitor`：聚合大屏，显示全部活跃会话；支持筛选与排序。
- `/monitor/sessions/:session_id`：单会话诊断（可选）。

## 2. 数据与通信
- Socket.IO 连接：订阅 `monitor.update` 与发送 `session.heartbeat`（2s）。
- WebRTC：仅在需要预览时建立 PeerConnection，发送 offer → 接收 answer，ICE host-only。
- API：创建/结束会话由考试页面触发；大屏仅展示与控制（不创建）。

## 3. 组件建议
- MonitorWall：聚合卡片；显示会话基本信息、缩略预览、关键指标与异常徽标。
- SessionCard：卡片内图表（attention/ppg/audio）、状态指示（ACK/重试/延迟）。
- SessionDetail：时间线、指标折线、异常表；用于排查。

## 4. 类型与约定
- 所有接口字段 snake_case；前端类型使用 camelCase，但与服务器交互前后做映射。
- 响应统一：`{ code, message, data, request_id, timestamp }`。
- 时间：服务器 UTC → 前端按本地时区展示。

## 5. 性能与隐私
- 节流：按 250–500ms 频率更新 UI；使用 requestAnimationFrame 合批渲染。
- 媒体：默认马赛克/缩略图；音频不回放，仅电平/频谱。

## 6. 配置
- 环境变量：`VITE_AI_BASE_URL`、`VITE_WS_PATH`。
- 错误处理：全局 Toast 与重连提示；对 `code` 做分支处理（1001/1002/2001/300x）。

本指南与 `WEBRTC_SOCKETIO_DESIGN.md` 为联调依据，前端以此为唯一标准开发。

