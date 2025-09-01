# 系统重构总览（统一规范）

本总览定义团队统一规范与文档清单，确保后续开发对齐。字段统一 snake_case，时间戳 ISO8601（UTC，毫秒），注释使用中文。

## 1. 边界与职责
- AI 服务：仅负责实时分析与大屏展示；正式数据由后端持久化；本地仅短期缓存并定期清理。
- 后端：会话主数据、AI 汇总/时间序列、报告生成、权限/多租户、审计与运维。
- 前端：考试流程与监控大屏入口；调度/展示 AI 指标；不直接持久化 AI 数据。

## 2. 统一规范
- 字段命名：接口与持久化使用 snake_case；代码内部变量 camelCase 允许。
- API 响应：`{ code, message, data, request_id, timestamp }`。
- 时间与时区：服务器统一 UTC；前端展示按本地时区格式化。
- 鉴权：后端使用 JWT；AI 调用后端携带 Bearer Token + `Idempotency-Key`。
- 日志：结构化 JSON，不含 PII；错误必须包含错误码与请求上下文。
- 版本：`ai_version`、模型指纹随交付一并上报，便于追踪。

## 3. 关键接口（索引）
- AI 服务外部接口：`POST /api/sessions`、`POST /api/sessions/{id}/end`、`GET /health`、Socket.IO 事件（见 WEBRTC_SOCKETIO_DESIGN.md）。
- AI→后端：Finalize 与 Checkpoint（见 AI_API_CONTRACT.md）。

## 4. 文档清单（需逐步完善）
- AI 服务重构方案：`AI_SERVICE_REFACTOR_GUIDE_V2.md`（基准）
- WebRTC+Socket.IO 设计：`WEBRTC_SOCKETIO_DESIGN.md`（前后端共同遵循）
- AI 后端交互契约：`AI_API_CONTRACT.md`（后端实现依据）
- 前端重构指南：`FRONTEND_REFACTOR_GUIDE.md`（监控大屏与联调）
- 后端重构指南：`BACKEND_REFACTOR_GUIDE.md`（AI 数据模型与接口）

## 5. 里程碑
1) 架构骨架（AI + 前端大屏雏形 + 健康检查）
2) 模型接入（PPG/DeepFace/emotion2vec）与统一聚合
3) 会话闭环（创建/结束、Finalize、清理计划）
4) 运维完善（指标、日志、告警、重试面板）
5) 性能稳定（压力测试、并发治理、断点恢复）

本总览作为所有子文档的入口与约束源，新增需求需先更新本总览再细化子文档。

