# AI 后端交互契约（确定版）

AI 服务在结束会话和会话过程中与后端进行数据交付。本契约为固定接口与错误码标准，字段统一使用 snake_case，时间戳使用 ISO8601（UTC，含毫秒）。

注意：实现前请以后端框架与 ORM（Express + Prisma）的最新版官方文档核对鉴权中间件、事务与幂等落库方式（若无法访问官方文档，请在实现处标注“待调研”，不要直接拍板）。

状态说明（开发阶段策略）：本契约为当前唯一实现目标。采用 Finalize/Checkpoint 作为 AI→后端交付的唯一通道；可删除/停用现状的兼容端点（`/api/create_session` 除外其用于学生会话创建，`/api/end_session` 仍由后端调用 AI 服务用于资源释放；`/api/analyze_questions` 不再用于后端报告生成）。

## 1. 结束会话交付（Finalize）
- 方法与路径：`POST {BACKEND_BASE_URL}/api/ai-service/sessions/{session_id}/finalize`
- 鉴权：`Authorization: Bearer <jwt>` + `Idempotency-Key: <uuid>`
- 幂等：同一 `session_id` + `Idempotency-Key` 重复请求返回 200 与 `ack: true`。

请求体（字段需与后端 DB 模型严格对齐，见 DB_SCHEMA.md）：
```
{
  session_id: "s-uuid",
  exam_id: "e-1001",
  exam_result_id: "er-xxxx" // 可选，若已生成考试结果
  candidate_id: "c-9001",
  started_at: "...",
  ended_at: "...",
  models: ["face","attention","ppg","audio"],
  aggregates: {
    attention: { avg: 0.81, low_ratio: 0.12, spikes: 3 },
    face: { occlusion_ratio: 0.06, multi_face_secs: 5 },
    ppg: { hr_avg: 76, hr_var: 7.2 },
    audio: { dominant: "neutral", confidence_avg: 0.69 }
  },
  // 有限长度的时间序列，用于一次性交付（例如 1Hz 过去 N 分钟）
  series: [
    { model: "attention", points: [ { timestamp: "...", metrics: { score: 0.82 } } ] },
    { model: "ppg",       points: [ { timestamp: "...", metrics: { hr_bpm: 76, signal_quality: 0.9 } } ] }
  ],
  anomalies_timeline: [ { code: "LOOK_AWAY", from: "...", to: "...", evidence: { frames: ["thumb_001.jpg"] } } ],
  attachments: [ { type: "thumbnail", path: "local:/sessions/s-uuid/thumb_001.jpg", sha256: "...", size: 12345 } ],
  compute_stats: { avg_latency_ms: 28, dropped_frames: 42 },
  ai_version: "ai-service@2.0.0+models-2025-01-01"
}
```

响应体：
```
{ code: 0, message: "ok", data: { ack: true, session_id: "s-uuid" }, request_id: "...", timestamp: "..." }
```

## 2. 增量检查点（Checkpoint）
- 方法与路径：`POST {BACKEND_BASE_URL}/api/ai-service/sessions/{session_id}/checkpoint`
- 周期：60 秒一次，非强制，但在考试模式下启用。

请求体（示例）：
```
{
  session_id: "s-uuid",
  exam_result_id: "er-xxxx", // 可选
  timestamp: "...",
  snapshot: {
    metrics: { attention: 0.79, ppg_hr: 75, audio_dominant: "neutral" },
    anomalies: [ { code: "MULTI_FACE", at: "..." } ]
  }
}
```

响应体：
```
{ code: 0, message: "ok", data: { accepted: true } }
```

## 3. 标准错误码
- 1001 参数错误
- 1002 未授权 / Token 失效
- 2001 会话不存在 / 状态非法
- 3001 后端存储不可用
- 3002 重复提交（但应返回 200 + 幂等信息）

## 4. 字段校验与签名
- 鉴权：`Authorization: Bearer <jwt>`（JWT 的签发与校验策略需按后端统一鉴权方案落地，待调研确认）。
- 幂等：`Idempotency-Key` 作为请求头写入，后端应以 `(session_id, idempotency_key)` 做唯一约束。
- 签名（可选增强）：对请求体做 HMAC-SHA256 签名并随头传递；用于防篡改（密钥下发方式由后端统一，待调研确认）。

本契约由后端、AI 服务与前端共同遵循，作为重构后联调与验收的唯一标准。如有变更，先更新本文件并在 `SYSTEM_REFACTOR_OVERVIEW.md` 记录版本号与变更条目。

说明：Finalize/Checkpoint 仅承载“AI 推理侧”数据（聚合/异常/快照/附件），不承载学生作答明细；作答明细由学生端提交的 `timeline_data` 在后端解析入库（见《BACKEND_REFACTOR_GUIDE.md》《DB_SCHEMA.md》）。

series 映射：Finalize 的 `series` 将批量写入 `AiCheckpoint`（`timestamp`→记录时间，`snapshot_json`→metrics，按 `aiSessionId+timestamp` 去重）。


---

## 附录·监控事件（不改变 AI→后端 HTTP 契约，仅用于前端实时渲染与日志）

1) 事件与路径
- Socket.IO 路径：`/socket.io`
- 事件：
  - `session.heartbeat`（前端→AI，频率 1s）：`{ session_id, ts, request_id? }`
  - `monitor.update` v0.2（AI→前端，频率 1s）：
    ```
    {
      version: "0.2",
      session_id: "s-uuid",
      timestamp: "2025-01-01T08:00:00.123Z",
      latency_ms: 35,
      metrics: { fps: 12, audio_level: 0.18, hr_bpm: 76, attention_score: 0.82 },
      models: {
        face: { status: "active", emotion_top1: "neutral", distribution: { neutral: 0.72, happy: 0.12 } },
        audio: { speaking: false, emotion_top1: "neutral", distribution: { neutral: 0.69, angry: 0.08 } }
      },
      anomalies: [ { code: "LOOK_AWAY", severity: "medium", duration_ms: 800 } ],
      system: { cpu_util: 0.36, gpu_util: 0.41, dropped_frames: 2 },
      request_id: "..." // 可选，仅用于日志；优先事件 payload，回落连接 query
    }
    ```
- 约束：
  - 字段命名 snake_case；时间戳 ISO8601（UTC，含毫秒）。
  - 心跳改为 1s；断线重连后自动恢复心跳与订阅。
  - 日志采样：每会话每 5 次心跳打印一次 monitor.update.sent（结构化）。
  - hr_bpm：会话开始后的 3 秒预热期内可为 null，预热期后必须为数值并以 1s 频率更新。
  - request_id 透传：优先事件 payload，回落连接 query（仅日志用）。
  - 不涉及 AI→后端交互；最终以后端数据为准。

2) 本地缓存说明（AI 端非权威）
- 路径：`storage/sessions/<session_id>/monitor.jsonl`（逐条快照新增行）
- 路径：`storage/sessions/<session_id>/summary.json`（聚合导出）
- 标注："非权威缓存，以后端为准"；受环境变量 `RETENTION_TTL` 管理，过期清理。
- 用途：用于断线恢复与 UI 回放；联调时辅助排障。
