# 运行流程（端到端时序）

本文面向 AI 协作开发，描述当前仓库“可运行”的端到端流程，以及重构完成后的目标流程。字段与接口命名统一 snake_case，时间戳 ISO8601（UTC，毫秒）。

## 一、前置与启动
- 后端（Node.js + Express + Prisma）
  - 环境：`DATABASE_URL`、`JWT_SECRET`、`AI_SERVICE_URL`
  - 启动：`cd backend && npm run dev`
  - 依赖：`docker compose up -d`（Postgres:5433, Redis:6379）
- 前端（React + Vite）
  - 环境：`VITE_API_BASE_URL`（已内置为 `/api` 代理）、建议新增 `VITE_AI_SERVICE_URL`
  - 启动：`cd frontend && npm run dev`
- AI 服务（Flask + Socket.IO + aiortc + 模型）
  - 启动：`python emotion/app_lan.py`（或 GPU 版本 `app_lan_gpu.py`），监听 `:5000`
  - 页面：`/`（实时检测）、`/records`（历史记录）
  - 健康：`GET /api/health`

## 二、考试流程（现状流程）
1) 教师端
- 登录：`POST /api/auth/login`
- 题库：创建试卷与题目；可批量导入/排序；可批量生成题目语音（TTS）
- 创建考试：`POST /api/teacher/exams`
- 发布考试：`POST /api/teacher/exams/:id/toggle-publish`

2) 学生端（公开路由）
- 打开：前端路由 `/exam/:public_uuid`
- 拉取考试信息：`GET /api/public/exams/:public_uuid`
- 验证密码（如需要）：`POST /api/public/exams/:public_uuid/verify`
- 创建 AI 会话（后端→AI 服务）：
  - 前端：`POST /api/public/exams/:public_uuid/create-ai-session`
  - 后端：`POST {AI_SERVICE_URL}/api/create_session`
  - 成功后，后端将 `ai_session_id` 写入 `exam_result`
- 答题并提交：`POST /api/public/exams/:public_uuid/submit`
  - 后端保存答案与时间线，必要时调用 AI 服务 `POST /api/end_session`

3) 教师端查看与报告生成
- 查看成绩：`GET /api/teacher/exams/:id/results`
- 生成 AI 报告：
  - 前端：`POST /api/teacher/ai/exam-results/:exam_result_id/generate-report`
  - 后端：收集题目+作答时间线 → `POST {AI_SERVICE_URL}/api/analyze_questions`
  - AI 服务：返回报告文本；后端存入 `AIReport`
- 查看情绪数据预览（模拟/聚合）：`GET /api/teacher/ai/exam-results/:exam_result_id/emotion-preview`

4) 监控大屏（可选）
- 教师端入口：直接打开 `{VITE_AI_SERVICE_URL}/` 或 `{VITE_AI_SERVICE_URL}/records`
- 说明：前端不复刻大屏渲染逻辑，仅跳转到 AI 服务页面

## 二点五、学生端 WebRTC 联动流程（关键）

目的：学生开始考试后，浏览器将音视频通过 WebRTC 实时上送至 AI 服务；AI 服务侧用于实时分析与大屏展示。提交试卷时，结束会话并断开 WebRTC。

1) 开始阶段（创建会话后立即启动）
- 前端调用：`POST /api/public/exams/:public_uuid/create-ai-session`，成功返回 `{ examResultId, aiSessionId }`。
- 前端拉取 AI 配置：`GET /api/ai-service/config`（含 `websocketUrl`/特性开关）。
- 前端初始化本地媒体：`getUserMedia`（视频+音频），创建 `RTCPeerConnection`。
- 握手：通过 Socket.IO 信令连接 `{VITE_AI_SERVICE_URL}`，发送 `signal.offer { session_id: aiSessionId, sdp }`，接收 `signal.answer` 与后续 `signal.ice` 交换（具体字段见《WEBRTC_SOCKETIO_DESIGN.md》）。
- 连接建立后：
  - 媒体轨到达 AI 服务；
  - DataChannel 建立后，前端每 2 秒发送 `session.heartbeat`（或 ping 控制消息）；
  - AI 服务以 `monitor.update` 推送分析指标（可用于本地 UI 轻量反馈）。

2) 进行阶段（考试进行中）
- 前端持续传输音视频；
- 前端记录时间线（timeline_data），包括 WebRTC 状态变化、异常提示等；
- 断线重连：若 Socket.IO 断线，重连后立即重发最新 offer；恢复最近 10 秒聚合快照（由 AI 服务实现）。

3) 结束阶段（提交与断开）
- 前端提交：`POST /api/public/exams/:public_uuid/submit`（包含 `timeline_data`、`device_test_results` 等）。
- 后端成功写库后：
  - 后端调用 AI 服务：`POST {AI_SERVICE_URL}/api/end_session`，使 AI 服务释放会话上下文（PPG/模型状态复位）。
  - 前端收到提交成功回调后，调用本地 `peerConnection.close()` 并释放媒体轨（即使 AI 服务已收到 `end_session`，前端仍需主动断开，避免资源泄漏）。
- 异常：
  - 若 `end_session` 失败，后端重试（指数退避）；前端仍应断开 WebRTC，保证浏览器资源释放。

提交写库说明（方案A）：
- 后端解析 `timeline_data` → 生成/更新 `QuestionResponse` 与批量写入 `QuestionActionEvent`；原始时间线可限期备份到 `ExamInteractionData.timelineData`。

失败场景与处理（统一标准）
- 会话创建成功但信令握手失败：
  - 前端重试 3 次（指数退避），失败则标记“AI监测不可用”继续考试；提交不受影响。
  - AI 服务保留会话至 TTL，未建媒体自动清理。
- 信令成功但媒体传输失败：
  - 前端检测无轨/无帧，重协商一次；失败则降级。
  - AI 服务统计帧数，10s 为 0 触发 `signal.close` 建议重连。
- 学生提交成功但 `end_session` 失败：
  - 后端加入重试队列并告警；前端已断开（finally 块统一断开）。
- `end_session` 成功但 WebRTC 未断开：
  - 前端 `finally` 调用 `pc.close()`；AI 服务在 `end_session` 后强制关闭 peer connection 兜底。
- 学生直接关闭页签：
  - 前端注册 `beforeunload/pagehide` 断开；AI 服务基于心跳/ICE 断线超时清理。

## 三、目标流程（Finalize/Checkpoint 上线后）
1) 学生端创建会话后，AI 服务周期性发送 Checkpoint：
- `POST {BACKEND}/api/ai-service/sessions/{session_id}/checkpoint`（60s 一次）
2) 学生提交或超时，AI 服务聚合并 Finalize：
- `POST {BACKEND}/api/ai-service/sessions/{session_id}/finalize` → 后端返回 `ack:true`
3) 后端统一基于 `AiSession/*` 模型持久化：
- 聚合（`AiAggregate`）、异常（`AiAnomaly`）、时间点（`AiCheckpoint`）、附件（`AiAttachment`）
4) 教师端生成报告：
- 直接使用后端 `AiSession` 数据生成（不再调用 AI 服务 `analyze_questions`）
备注：目标流程下，`end_session` 将内聚在 AI→后端 Finalize 过程中，由后端 ACK 作为会话关闭的判定；前端仍在提交后主动关闭 WebRTC。

## 四、异常与降级
- AI 服务不可达：
  - 学生端可退化为仅提交答案；报告稍后生成
  - 教师端大屏按钮禁用或提示“服务不可达”；`/api/ai-service/config` 返回 available=false
- WebRTC 不可用：
  - 仅使用 Socket.IO 推送指标（若实现）；或只展示历史记录

## 五、链路一览（简版时序）
- 学生开始 → 后端 `create-ai-session` → AI 服务 `create_session`
- 学生提交 → 后端保存答案 → 后端可选调用 AI 服务 `end_session`
- 教师查看 → 后端 `generate-report` → AI 服务 `analyze_questions` → 文本报告存 `AIReport`
- 大屏查看 → 直接访问 AI 服务页面 `/` 或 `/records`

以上流程供 AI 协作开发按步骤执行；如需变更，先更新本文档并联动更新《AI_API_CONTRACT.md》《DB_SCHEMA.md》与《SYSTEM_REFACTOR_OVERVIEW.md》。
