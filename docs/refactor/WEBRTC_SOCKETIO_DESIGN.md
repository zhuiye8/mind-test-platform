# WebRTC + Socket.IO 设计（局域网固定方案）

本设计为确定性方案，前端与 AI 服务部署在同一局域网：音视频通过 WebRTC 传输；Socket.IO 仅用于信令与实时指标推送。所有字段命名为 snake_case，注释与文档均使用中文。

重要：实现前需以当期官方文档校验关键点：
- 浏览器 WebRTC 兼容性与编解码支持矩阵（Chrome/Edge/Safari）。
- aiortc（或服务端 WebRTC 实现）的最新 API 与稳定性建议。
- Socket.IO 客户端/服务端的当前主要版本及断线重连策略。

## 1. 拓扑与链路
- 传输分层：
  - WebRTC：传输音视频（MediaStream）；不经公网，不使用 STUN/TURN，仅 host candidates。
  - Socket.IO：承载信令（offer/answer/ice）与监控事件（monitor.update、session.heartbeat）。
- 路由：
  - 聚合大屏：`GET /monitor`（展示全部活跃会话）。
  - 单会话诊断：`GET /monitor/sessions/:session_id`（可选）。
  - 学生考试流：学生端在“成功创建 AI 会话（后端→AI 服务）”后，立即以 `session_id` 建立 WebRTC；提交时断开。

## 2. 信令事件（Socket.IO）
- `signal.offer`（前端→服务）: `{ session_id, sdp }`
- `signal.answer`（服务→前端）: `{ session_id, sdp }`
- `signal.ice`（双向）: `{ session_id, candidate }`
- `signal.ready`（服务→前端）: `{ session_id }`
- `signal.close`（服务→前端）: `{ session_id, reason }`

约束：
- ICE 策略固定为 host-only；不配置 STUN/TURN；禁止公网回落；目标浏览器：Chrome/Edge（Windows/macOS/Linux）。
- 会话状态在服务端维护，断线自动重连并恢复最近 10 秒快照。

 

## 3. 监控事件（Socket.IO）
- `monitor.update`（服务→前端，250–500ms 节流）
```
{
  session_id: "s-uuid",
  timestamp: "2025-01-01T08:00:00.123Z",
  models: ["face","attention","ppg","audio"],
  metrics: {
    attention: { score: 0.82, confidence: 0.91 },
    face: { detected: true, multi_face_secs: 0, occlusion_ratio: 0.02 },
    ppg: { hr_bpm: 76, signal_quality: 0.88 },
    audio: { dominant: "neutral", confidence: 0.71 }
  },
  anomalies: [ { code: "LOOK_AWAY", severity: "medium", duration_ms: 800 } ],
  latency_ms: 35,
  system: { gpu_util: 0.41, cpu_util: 0.36, dropped_frames: 2 }
}
```

- `session.heartbeat`（前端→服务，每 2s）: `{ session_id, ts }`

## 4. WebRTC 策略
- 视频：H.264/VP8 均可；帧率<= 15fps，分辨率<= 640x480（按硬件能力自适应）。具体编解码首选顺序与码率控制需对照浏览器与 aiortc 的最新官方建议再行确认（待调研）。
- 音频：16kHz 单声道 PCM 为分析标准；浏览器端做基本降噪/回声消除。若需回退为 Opus，需评估对 emotion2vec 预处理的影响（待调研）。
- 断线恢复：前端重连后立刻发送 `signal.offer` 并恢复订阅；服务端回补 10 秒聚合快照。

## 5. 安全与访问控制
- 访问控制：聚合大屏 `/monitor` 需登录后的短期 Token；当前不做教师/考试隔离（后续由后端鉴权完善）。
- 媒体隐私：默认马赛克或缩略图预览；音频仅显示电平/频谱，不回放内容。

## 6. 错误与降级
- 服务不可达：前端退回只读占位 UI；每 5s 重试 Socket.IO 连接（指数退避，最大 N 次）。
- 推理进程异常：服务端发出 `signal.close` 并在大屏标记降级；自动重启推理进程后可恢复。
- 失败场景与处理：
  1) 创建会话成功但信令握手失败：
     - 前端：指数退避重试 `signal.offer`（如 3 次），失败后标记“AI监测不可用”，继续考试；记录事件。
     - 服务端：会话标记为 ACTIVE（无媒体），若 T 超时未建立媒体，自动清理。
  2) 信令成功但媒体传输失败（无轨/无帧）：
     - 前端：监控 `connectionstatechange`/`ontrack`，尝试一次重新协商；仍失败则降级提示。
     - 服务端：统计 `audio_frames`/`video_frames`，如连续 10s 为 0，发出 `signal.close` 建议重连，或转入降级。
  3) 学生提交成功，但 `end_session`（后端→AI）失败：
     - 后端：加入重试队列（指数退避、最多 N 次），并记录状态；不影响前端断开。
     - 服务端：保留会话并依 TTL 自动清理。
  4) `end_session` 成功，但前端未断开 WebRTC：
     - 前端：在提交成功回调中 `pc.close()`；同时监听 `beforeunload/pagehide` 做兜底断开。
     - 服务端：收到 `end_session` 立即关闭 peer connection，作为最终兜底。
  5) 学生直接关闭页签且 WebRTC 仍连接：
     - 前端：在 `beforeunload/pagehide` 尝试断开；不可保证成功。
     - 服务端：通过 `session.heartbeat` 超时或 WebRTC ICE 断线计时，T 秒后清理；写 `AiAggregate.system` 记录中断原因。

本文档为重构基准，AI 服务实现与前端联调均以此为准。

## 7. 会话生命周期绑定与时序（学生考试）

1) 创建会话（后端→AI 服务）
- 前端：`POST /api/public/exams/:uuid/create-ai-session` → 后端调用 AI `/api/create_session`；返回 `{ examResultId, aiSessionId }`。

2) 建立 WebRTC（前端→AI 服务）
- 前端立即发起握手（Socket.IO `signal.offer`），携带 `session_id=aiSessionId`。
- 双方完成 `answer` 与 `ice` 交换后，媒体轨开始传输。

3) 提交与断开
- 前端提交答案 → 后端写库成功 → 后端 `POST {AI}/api/end_session`。
- 前端同时主动关闭 WebRTC（`pc.close()`/停止本地轨），确保浏览器资源释放。

4) 断线重连（可选）
- 前端监听断线，自动重连 Socket.IO 并重发最新 `offer`；AI 服务回补 10 秒快照，保证大屏连续性。
