# 后端重构指南（AI 数据接入）

目标：提供 AI 数据的接收、存储、报告生成与权限扩展能力。技术栈 Node.js + Express + TypeScript + Prisma。

重要：落地前需按当前官方文档核对 Express、Prisma、PostgreSQL 的最佳实践（事务、JSONB、索引、分区、迁移）。若无法访问官方文档，请在实现点注明“待调研”，不要直接拍板。

## 1. 模块划分
- `modules/ai/`：AI 接口控制器、服务、DTO、校验、日志。
- `modules/exam/`：考试与会话主数据（关联 student/course/room）。
- `modules/report/`：报告生成与导出（PDF/CSV）。
- `modules/auth/`：JWT、角色与后续多租户隔离。

## 2. 数据模型
- 唯一来源：`docs/refactor/DB_SCHEMA.md`（Prisma + PostgreSQL）。
- 所有迁移与表结构变更均以该文档为准，不参考旧表。

## 3. 接口实现（按 AI_API_CONTRACT.md）
- `POST /api/ai/sessions/:session_id/finalize`：幂等，返回 `{ack:true}`。落库到 `AiSession/*`。
- `POST /api/ai/sessions/:session_id/checkpoint`：写入 `AiCheckpoint`；可按考试分区归档。
- 鉴权：JWT + `Idempotency-Key`；按 `org_id` 预留多租户字段。

建议实现细节（需与官方文档核对，无法访问则标注“待调研”）：
- 使用 `zod` 或 `class-validator` 做 DTO 校验（待调研：选型与生态）。
- Prisma 事务处理 Finalize：写入 Aggregates/Anomalies/Attachments 与 Idempotency 记录（待调研：事务隔离级别）。
- JSONB 字段与索引：高频查询键增加表达式索引（待调研：PostgreSQL 官方建议）。

## 4. 可靠性与可观测性
- 幂等：基于 `(session_id, idempotency_key)` 约束；重复提交返回 200。
- 日志：结构化日志（请求ID、会话ID、错误码）。
- 指标：请求耗时、入库延迟、失败率、幂等命中率。

## 5. 报告生成
- 统一在后端根据 `AiSession/*` + 作答结构化数据（`QuestionResponse` + `QuestionActionEvent`）生成；前端/AI 不直接生成报告。
- 模板与导出：PDF（模板引擎）+ CSV（原始聚合/时间序列）。

## 6. 对齐与迁移（开发阶段策略）
- 所有服务以 `docs/refactor/DB_SCHEMA.md` 字段为准；允许破坏性变更（Drop & Recreate）。
- 数据不保留：执行 `prisma migrate reset` 后更新 seed 脚本，确保最小闭环可运行。

本指南与 `AI_API_CONTRACT.md`、`DB_SCHEMA.md` 构成后端实现的唯一参考。

## 7. 学生时间线解析（方案A）
- 提交端点：`POST /api/public/exams/:uuid/submit`
- 解析流程：
  1) 保存标准化答案 → 计算得分。
  2) 解析 `timeline_data`（见前端指南中的事件格式），按题目聚合得到：
     - `question_displayed_at`、`response_submitted_at`、`time_to_answer_seconds`
     - 最终答案（考虑多次修改/回选）
  3) Upsert `QuestionResponse`；批量写入 `QuestionActionEvent`。
  4) 原始时间线备份至 `ExamInteractionData.timelineData`（可选、限期保存）。

事件解析建议：
- display：首次显示记录 `question_displayed_at`。
- select/change：更新临时答案；记录 `QuestionActionEvent`。
- navigate：用于统计回看次数（从后向前跳转记一次回看）。
- submit：取当时的临时答案作为最终答案；时间差得到作答用时。

## 8. Finalize 落库映射细则（AI 服务回填路径）
- 输入契约见《AI_API_CONTRACT.md》：`aggregates`、`anomalies_timeline`、`attachments`、`compute_stats`、`ai_version`。
- 落库步骤：
  1) `AiSession`：若不存在则创建（以 `session_id` 作为主键/外键关联 `ExamResult.aiSessionId`），更新 `ended_at`、`status=ENDED`、`ai_version`。
  2) `AiAggregate`：按 `model`+`key` 去重写入（新增或更新）。
  3) `AiAnomaly`：按 `code`+`from_ts`+`to_ts` upsert；`evidence_json` 存缩略图/关键帧引用。
  4) `series` → `AiCheckpoint`：逐 `point` 写入（`timestamp` 与 `snapshot_json`），以 `aiSessionId+timestamp` 唯一约束去重。
  5) `AiAttachment`：按 `sha256` 唯一；路径可为对象存储 URL 或本地路径映射。
  6) `AiFinalizeIdemp`：记录 `(session_id, idempotency_key)` 幂等。
- 禁止：Finalize 不修改 `ExamResult.answers` 与评分/作答时间；该部分仅由学生提交端点负责，避免数据竞争。
