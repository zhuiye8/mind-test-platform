# WebRTC + Socket.IO 设计（局域网固定方案）

本设计为确定性方案，前端与 AI 服务部署在同一局域网：音视频通过 WebRTC 传输；Socket.IO 仅用于信令与实时指标推送。所有字段命名为 snake_case，注释与文档均使用中文。

## 1. 拓扑与链路
- 传输分层：
  - WebRTC：传输音视频（MediaStream）；不经公网，不使用 STUN/TURN，仅 host candidates。
  - Socket.IO：承载信令（offer/answer/ice）与监控事件（monitor.update、session.heartbeat）。
- 路由：
  - 聚合大屏：`GET /monitor`（展示全部活跃会话）。
  - 单会话诊断：`GET /monitor/sessions/:session_id`（可选）。

## 2. 信令事件（Socket.IO）
- `signal.offer`（前端→服务）: `{ session_id, sdp }`
- `signal.answer`（服务→前端）: `{ session_id, sdp }`
- `signal.ice`（双向）: `{ session_id, candidate }`
- `signal.ready`（服务→前端）: `{ session_id }`
- `signal.close`（服务→前端）: `{ session_id, reason }`

约束：
- ICE 策略固定为 host-only；不配置 STUN/TURN；禁止公网回落。
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
- 视频：H.264/VP8 均可；帧率<= 15fps，分辨率<= 640x480（按硬件能力自适应）。
- 音频：16kHz 单声道 PCM 为分析标准；浏览器端做基本降噪/回声消除。
- 断线恢复：前端重连后立刻发送 `signal.offer` 并恢复订阅；服务端回补 10 秒聚合快照。

## 5. 安全与访问控制
- 访问控制：聚合大屏 `/monitor` 需登录后的短期 Token；当前不做教师/考试隔离（后续由后端鉴权完善）。
- 媒体隐私：默认马赛克或缩略图预览；音频仅显示电平/频谱，不回放内容。

## 6. 错误与降级
- 服务不可达：前端退回只读占位 UI；每 5s 重试 Socket.IO 连接。
- 推理进程异常：服务端发出 `signal.close` 并在大屏标记降级；自动重启推理进程后可恢复。

本文档为重构基准，AI 服务实现与前端联调均以此为准。

