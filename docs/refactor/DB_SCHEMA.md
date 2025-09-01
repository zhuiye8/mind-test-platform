# 数据库结构（Prisma + PostgreSQL）

本文件为数据库的唯一来源（Single Source of Truth）。所有服务以本文件字段为准。如需调整，先更新本文件并广播通知，对齐迁移计划。

注意：在实现前需要按当期 Prisma 与 PostgreSQL 官方文档确认以下事项（无法访问官方文档时请在实现点标注“待调研”）：
- JSONB 字段与索引（GIN/GIST）的使用与性能建议（待调研）。
- 分区/分表策略（按考试或时间分区）的最佳实践（待调研）。
- 事务与幂等落库（Prisma 的 upsert/unique 约束策略）。

## 1. 设计原则
- 会话为核心：一切 AI 数据（聚合、异常、快照、附件）都挂靠 `AiSession`。
- 与现有表对齐：复用现有 `Exam`/`ExamResult` 结构；AI 数据通过 `exam_result_id` 或 `exam_id` 关联。
- JSONB 存储复杂结构：聚合、异常证据、快照使用 JSONB 存储；关键查询字段建索引。
- 幂等保障：Finalize 使用 `(session_id, idempotency_key)` 保证幂等。

## 2. 枚举
```
// schema.prisma 片段

enum SessionStatus {
  ACTIVE
  ENDED
  PENDING_FLUSH
}

enum AiModel {
  FACE
  ATTENTION
  PPG
  AUDIO
  POSE
  IDENTITY
}

enum Severity {
  LOW
  MEDIUM
  HIGH
}

enum AttachmentType {
  THUMBNAIL
  KEYFRAME
  METRIC_DUMP
  MEDIA_CLIP
}

// 学生作答行为事件类型（用于 QuestionActionEvent）
enum QuestionActionType {
  DISPLAY   // 题目呈现
  SELECT    // 选择（首次选择）
  DESELECT  // 取消选择（多选题）
  CHANGE    // 更改（单选/文本从A→B）
  NAVIGATE  // 导航（从题X跳到题Y）
  FOCUS     // 聚焦输入框
  BLUR      // 离开输入框
}
```

## 3. 新增/重构模型
```
// 与现有 Teacher/Paper/Exam/ExamResult 并存，不改动其定义

model AiSession {
  id               String        @id @default(uuid())
  examId           String?
  examResultId     String?
  station_id       String?
  room_id          String?
  started_at       DateTime
  ended_at         DateTime?
  status           SessionStatus @default(ACTIVE)
  ai_version       String?
  retention_ttl_sec Int          @default(86400)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  exam             Exam?         @relation(fields: [examId], references: [id])
  examResult       ExamResult?   @relation(fields: [examResultId], references: [id])
  aggregates       AiAggregate[]
  anomalies        AiAnomaly[]
  checkpoints      AiCheckpoint[]
  attachments      AiAttachment[]
  idempotency      AiFinalizeIdemp[]

  @@index([examId, started_at])
  @@index([examResultId, started_at])
}

model AiAggregate {
  id          String   @id @default(uuid())
  aiSessionId String
  model       AiModel
  key         String
  value_json  Json     // JSONB
  createdAt   DateTime @default(now())

  session     AiSession @relation(fields: [aiSessionId], references: [id])

  @@index([aiSessionId, model, key])
}

model AiAnomaly {
  id            String   @id @default(uuid())
  aiSessionId   String
  code          String
  severity      Severity
  from_ts       DateTime
  to_ts         DateTime
  evidence_json Json     // JSONB（缩略图/关键帧列表等）
  createdAt     DateTime @default(now())

  session       AiSession @relation(fields: [aiSessionId], references: [id])

  @@index([aiSessionId, code, from_ts])
}

model AiCheckpoint {
  id            String   @id @default(uuid())
  aiSessionId   String
  timestamp     DateTime
  snapshot_json Json     // JSONB（最近窗口指标）
  createdAt     DateTime @default(now())

  session       AiSession @relation(fields: [aiSessionId], references: [id])

  @@unique([aiSessionId, timestamp])
}

model AiAttachment {
  id          String   @id @default(uuid())
  aiSessionId String
  type        AttachmentType
  path        String
  sha256      String
  size        Int
  createdAt   DateTime @default(now())

  session     AiSession @relation(fields: [aiSessionId], references: [id])

  @@unique([sha256])
  @@index([aiSessionId, type])
}

model AiFinalizeIdemp {
  id               String   @id @default(uuid())
  aiSessionId      String
  idempotency_key  String
  createdAt        DateTime @default(now())

  session          AiSession @relation(fields: [aiSessionId], references: [id])

  @@unique([aiSessionId, idempotency_key])
}

// 学生作答事件表（结构化时间线，用于还原“显示/选择/修改/回看”等行为）
model QuestionActionEvent {
  id              String   @id @default(uuid())
  examResultId    String
  questionId      String
  event_type      QuestionActionType
  payload_json    Json?    // { option_before, option_after, source: 'click|voice', from, to, ... }
  occurred_at     DateTime // 事件发生时刻（ISO）
  createdAt       DateTime @default(now())

  examResult      ExamResult @relation(fields: [examResultId], references: [id])
  question        Question   @relation(fields: [questionId], references: [id])

  @@index([examResultId, occurred_at])
  @@index([examResultId, questionId, occurred_at])
}
```

说明（开发阶段策略）：直接采用 `AiSession/*` 体系，允许删除与之重叠的旧表/字段，无需历史迁移；更新 seed 脚本即可。

## 4. 字段与 API 映射
- `AiSession` ↔ AI 服务创建/结束接口体中的会话信息（`session_id`、`exam_id`、`exam_result_id`）。
- `AiAggregate` ↔ Finalize 中的 `aggregates`（按模型+key 落库）。
- `AiAnomaly` ↔ Finalize 中的 `anomalies_timeline`。
- `AiCheckpoint` ↔ Checkpoint 的 `snapshot`。
- `AiAttachment` ↔ Finalize 的 `attachments`（对象存储或本地路径映射）。
- `QuestionActionEvent` ↔ 学生端 `timeline_data` 解析后写入的结构化事件，用于还原单题多次修改/回选。

## 5. 开发阶段变更流程（破坏性）
- 允许直接变更/删除表与字段；执行 `prisma migrate reset`；更新并运行 seed 脚本确保最小可运行集。
- 种子数据覆盖：教师、试卷、题目、一次考试与一名学生作答最小闭环（便于端到端验证）。

附：时间线解析与写库
- 前端提交时携带 `timeline_data`（事件数组）。后端在提交成功后解析并写入：
  1) 以题目粒度汇总，生成/更新 `QuestionResponse`（最终答案、显示时间、提交时间、作答用时）。
  2) 逐事件写入 `QuestionActionEvent`（display/select/change/navigate等），保留完整行为轨迹。
  3) `ExamInteractionData.timelineData` 可保留原始 JSON 作为审计备份（短期），长期以结构化数据为准。

## 6. 索引与性能
- JSONB 常用查询键建议建立表达式索引（待调研 PostgreSQL 14+ 的最佳实践）。
- 读路径以 `aiSessionId` 为首键；写路径以批量插入为主，避免频繁事务。

本结构如需变更，请在 PR 中更新本文件，并在 `SYSTEM_REFACTOR_OVERVIEW.md` 记录版本号与变更内容。

附：series 默认长度
- Finalize 的 `series` 默认提供 600 秒（10 分钟）窗口的 1Hz 指标点；后端以 `aiSessionId + timestamp` 去重写入 `AiCheckpoint`。
