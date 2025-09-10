# AI 接口一览（与实现保持同步）

## REST（契约层 /api）
- `GET /api/health`
  - 响应：`{ status: 'healthy', service: 'emotion-ai', version: '1.0.0', timestamp }`
  - 来源：`contract_api.routes.health_check`

- `GET /api/ai/config`
  - 响应：
    - `{ available: true, websocket_url: 'ws://localhost:5678/socket.io/', features: { webrtc, emotion_analysis, heart_rate_detection, real_time_monitoring }, diagnostics: { version, models } }`
  - 来源：`contract_api.adapters.ai_config_response`

- `POST /api/create_session`
  - 请求：`{ participant_id: string, exam_id: string }`（兼容 camelCase）
  - 响应：`{ success: boolean, session_id?: string, sessionId?: string, aiSessionId?: string, message }`
  - 行为：注册到 `app_lan.student_sessions`，并在 `data/sessions/*.json` 备份
  - 来源：`contract_api.routes.create_session`

- `POST /api/end_session`
  - 请求：`{ session_id: string }`（兼容 camelCase）
  - 响应：`{ success: boolean, message }`
  - 行为：更新本地会话并异步触发 `finalize` 回调
  - 来源：`contract_api.routes.end_session`

## 本地/维护接口（内部使用）
- `GET /api/student_sessions`
  - 响应：`{ success, student_sessions, total_students, active_students }`
  - 说明：清理策略已修复为兼容 ISO8601 末尾 `Z`

- `POST /api/clear_student_sessions`
  - 响应：`{ success, cleared_count }`

- `POST /api/disconnect_student`
  - 请求：`{ session_id }`
  - 响应：`{ success, message, session_id, student_id }`

## GPU 管理接口
- `GET /api/gpu/status` → 系统/GPU 状态
- `POST /api/gpu/optimize` → 优化 GPU 内存
- `POST /api/gpu/enable` → 启用 GPU 加速
- `POST /api/gpu/disable` → 禁用 GPU 加速

## WebSocket / Socket.IO
- 连接：`ws://<host>:5678/socket.io/`
- 事件：见 `webrtc-signaling.md`

## 回调（AI → Backend）
- `POST http://localhost:3001/api/ai-service/sessions/{session_id}/finalize`
  - 头：`Authorization: Bearer dev-fixed-token-2024`、`Idempotency-Key: <uuid>`
  - 体：见 `callbacks.md`

- `POST http://localhost:3001/api/ai-service/sessions/{session_id}/checkpoint`
  - 头：`Authorization: Bearer dev-fixed-token-2024`
  - 体：见 `callbacks.md`
