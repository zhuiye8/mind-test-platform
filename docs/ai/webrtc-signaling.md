# WebRTC / Socket.IO 信令说明

## 连接
- URL：`ws://<host>:5678/socket.io/`
- CORS：已放开（`cors_allowed_origins="*"`）

## 事件（前端 → AI）
- `signal.offer`：`{ session_id, sdp }`
  - 行为：生成并回发 `signal.answer`

- `signal.ice`：`{ session_id, candidate }`
  - 行为：处理并回发远端 ICE（镜像交换）

- `session.heartbeat`：`{ session_id, ts }`
  - 行为：记录心跳并推送 `monitor.update`；同时同步更新 `student_sessions[session_id].last_activity`（ISO8601 Z），避免监控侧误清理

说明：为最大兼容性，前端会同时发送两套事件名（webrtc-* 与 signal.*）：
- offer：同时发送 `webrtc-offer` 与 `signal.offer`，负载包含 `{ offer, sdp }`
- ice：同时发送 `ice-candidate` 与 `signal.ice`
并同时监听 `webrtc-answer` 与 `signal.answer`。

## 事件（AI → 前端）
- `signal.answer`：`{ session_id, sdp }`
- `signal.ice`：`{ session_id, candidate }`
- `signal.ready`：`{ session_id }`（可选）
- `signal.close`：`{ session_id, reason }`（可选）
- `monitor.update`：
  - 形如：`{ session_id, timestamp, models:['webrtc_signaling'], metrics:{ connection_state, session_duration, heartbeat_interval, last_activity }, latency_ms, system:{ active_sessions, signal_type:'webrtc' } }`

## 兼容事件（前端历史实现）
- `webrtc-offer` → 映射为 `signal.offer`
- `webrtc-answer` → 日志记录（无需处理）
- `ice-candidate` → 映射为 `signal.ice`

## 会话与清理
- 活跃会话表：`active_sessions`
- 心跳统计：`heartbeat_intervals`
- 清理策略：`cleanup_inactive_sessions(timeout=300s)`
