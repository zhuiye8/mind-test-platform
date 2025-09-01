# 接口总览（Backend / Frontend / AI Service）

本文为“一目了然”的接口清单，分层列出现状可用接口与目标接口（规划）。字段统一 snake_case，时间戳 ISO8601（UTC，毫秒）。

## A. 后端 API（REST）

- 认证
  - POST `/api/auth/login`：教师登录
  - GET `/api/auth/verify`：校验登录态（JWT）

- 教师·试卷（papers）
  - GET `/api/teacher/papers`：列表
  - GET `/api/teacher/papers/:paper_id`：详情（含题目）
  - POST `/api/teacher/papers`：创建
  - PUT `/api/teacher/papers/:paper_id`：更新
  - DELETE `/api/teacher/papers/:paper_id`：删除
  - 题目 CRUD/批量/依赖/音频（详见源码 routes + controllers/question/*）

- 教师·考试（exams）
  - POST `/api/teacher/exams`：创建
  - GET `/api/teacher/exams`：列表（支持状态筛选）
  - GET `/api/teacher/exams/archived`：归档列表
  - GET `/api/teacher/exams/:exam_id`：详情
  - PUT `/api/teacher/exams/:exam_id`：更新
  - DELETE `/api/teacher/exams/:exam_id`：删除
  - PUT `/api/teacher/exams/:exam_id/finish`：结束（published→success）
  - PUT `/api/teacher/exams/:exam_id/archive`：归档（success→archived）
  - PUT `/api/teacher/exams/:exam_id/restore`：恢复（archived→success）
  - POST `/api/teacher/exams/:exam_id/toggle-publish`：发布/下线
  - GET `/api/teacher/exams/:exam_id/submissions`：提交列表
  - GET `/api/teacher/exams/:exam_id/results`：结果列表
  - GET `/api/teacher/exams/:exam_id/results/:result_id`：结果详情
  - GET `/api/teacher/exams/:exam_id/results/export`：导出 CSV
  - POST `/api/teacher/exams/batch-export`：批量导出 CSV

- 教师·AI 分析
  - POST `/api/teacher/ai/exam-results/:exam_result_id/generate-report`：生成报告
  - POST `/api/teacher/ai/exam-results/:exam_result_id/regenerate-report`：重新生成
  - GET `/api/teacher/ai/exam-results/:exam_result_id/report-status`：报告状态
  - GET `/api/teacher/ai/exam-results/:exam_result_id/emotion-preview`：情绪数据预览（聚合）
  - GET `/api/teacher/ai/service/health`：AI 服务健康
  - GET `/api/ai/config`：公开 AI 服务配置（学生端使用）

- 学生·公开 API
  - GET `/api/public/exams/:public_uuid`：考试信息
  - POST `/api/public/exams/:public_uuid/verify`：考试密码
  - POST `/api/public/exams/:public_uuid/check-duplicate`：重复提交判断
  - POST `/api/public/exams/:public_uuid/create-ai-session`：创建 AI 会话（后端→AI 服务）
  - POST `/api/public/exams/:public_uuid/retry-ai-session`：重试 AI 会话
  - POST `/api/public/exams/:public_uuid/submit`：提交答案

- 音频（公开 + 教师）
  - GET `/api/audio/questions/:question_id/:filename`：下载/预览（公开，含 CORS/Range）
  - HEAD `/api/audio/questions/:question_id/:filename`：探测可用性
  - POST `/api/audio/papers/:paper_id/batch-generate`：批量生成题目音频（教师）
  - GET `/api/audio/papers/:paper_id/status`：音频状态（教师）
  - 其他见 `routes/audioRoutes.ts`

- AI 服务专用（已删除 - 使用 Finalize/Checkpoint 契约）
  - 原有 `/api/ai-service/*` 端点已移除，统一使用 AI 代理服务
  - AI 会话管理现在由后端统一处理，前端不再直接调用结束会话

## B. AI 服务 API（REST + 页面 + Socket.IO）

- 现状·已实现
  - POST `/api/create_session`：创建会话
  - POST `/api/end_session`：结束会话
  - POST `/api/analyze_questions`：生成报告文本
  - GET `/api/health`：健康检查
  - GET `/`：实时检测页面
  - GET `/records`：历史记录页面
  - Socket.IO：信令与监控（见《WEBRTC_SOCKETIO_DESIGN.md》）
  

- 目标·规划
  - POST `/api/sessions`、POST `/api/sessions/{id}/end`（与本文“AI 方案 v2”一致）
  - 对后端：Finalize/Checkpoint（见《AI_API_CONTRACT.md》）

## C. 前端集成要点

- 环境变量
  - `VITE_API_BASE_URL`：后端 API（已默认 `/api` 代理）
  - `VITE_AI_SERVICE_URL`：AI 服务地址（用于跳转大屏）

- 页面路由（现状）
  - 管理端：`/dashboard`、`/papers`、`/exams`、`/analytics` 等
  - 学生端：`/exam/:public_uuid`
  - 大屏入口：建议在 Dashboard/ExamDetail 放置按钮跳转 `{VITE_AI_SERVICE_URL}/` 或 `/records`

## D. 模型与存储（映射）

- 现状·后端 Prisma：`EmotionAnalysis`、`AIReport`、`ExamInteractionData`
- 目标·后端 Prisma：`AiSession`、`AiAggregate`、`AiAnomaly`、`AiCheckpoint`、`AiAttachment`、`AiFinalizeIdemp`（见《DB_SCHEMA.md》）

以上接口清单与映射确保 AI 协作开发可快速定位端点与调用方式；如有变更，请同步更新本文档及相关契约文档。
