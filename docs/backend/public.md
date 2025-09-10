# 学生端接口模块

## 涉及文件
- `/backend/src/controllers/public/access.controller.ts` - 考试访问控制
- `/backend/src/controllers/public/session.controller.ts` - 考试会话管理
- `/backend/src/controllers/public/submission.controller.ts` - 答题提交处理
- `/backend/src/controllers/public/validation.controller.ts` - 数据验证
- `/backend/src/controllers/public/utils.ts` - 工具函数
- `/backend/src/services/timelineParserService.ts` - 时间线数据解析

## 数据库
- **exams表**: publicUuid(公开访问), password, status, startTime, endTime
- **exam_results表**: participantId, participantName, answers(JSON), ipAddress, startedAt, submittedAt
- **ai_sessions表**: 独立的AI会话管理，支持无ExamResult的会话创建
- **question_responses表**: 每题详细作答记录
- **question_action_events表**: questionId, actionType, timestamp, optionBefore, optionAfter

## 主要接口（与路由实现同步）
- `GET /api/public/exams/:publicUuid`
  - 响应：当需要密码时仅返回基础信息：
    - `{ id, title, description, duration_minutes, shuffle_questions, password_required: true }`
  - 响应：当不需要密码时返回题目：
    - `{ id, title, description, duration_minutes, shuffle_questions, password_required: false, questions: Question[] }`
  - 题目字段来源：`questions` 按 `exams.questionIdsSnapshot` 顺序组装，字段映射：
    - `id, question_order, title, options(JSON), question_type, display_condition`（来自 `questions` 表）
- `POST /api/public/exams/:publicUuid/verify`
  - 请求：`{ password: string }`（与 `exams.password` 哈希比对）
  - 响应：`{ id, title, description, duration_minutes, shuffle_questions, password_required: false, questions: Question[] }`
- `POST /api/public/exams/:publicUuid/create-ai-session`
  - 请求：`{ participant_id, participant_name, started_at? }`
  - 响应：`{ examResultId: string|null, aiSessionId: string|null, message, warning? }`
  - 说明：AI为非必需时，即便失败也允许继续答题（`aiSessionId=null`）。
- `POST /api/public/exams/:publicUuid/retry-ai-session`
  - 请求：`{ participant_id, participant_name }`
  - 响应：`{ examResultId, aiSessionId|null, message, warning? }`
- `POST /api/public/exams/:publicUuid/check-duplicate`
  - 请求：`{ participant_id }`
  - 响应：`{ canSubmit: boolean }`
- `POST /api/public/exams/:publicUuid/submit`
  - 请求：`{ participant_id, participant_name, answers, started_at?, timeline_data?, voice_interactions?, device_test_results? }`
  - 响应：`{ result_id: string, score?: number, message?: string, ai_warning?: string }`

## 核心功能
- 公开考试信息获取（无需认证）
- 密码验证和访问控制
- 答题数据提交和存储
- 时间线事件解析（DISPLAY/SELECT/DESELECT/CHANGE/NAVIGATE/FOCUS/BLUR）→ `question_action_events`
- AI会话独立管理（不依赖ExamResult提前创建）
- 延迟ExamResult创建（仅在实际提交时创建）
- 防重复提交保护

## 注意事项
- 使用publicUuid避免暴露内部ID
- `questionIdsSnapshot` 用于固定题目顺序（避免后续修改影响进行中的考试）
- `timeline_data` 解析为结构化记录：
  - `question_responses`: 每题作答（响应值、显示/提交时间、用时）
  - `question_action_events`: 行为事件（类型枚举、payload、时间戳）
- 支持设备检测数据的原始存储：`exam_interaction_data.deviceTestResults`
- IP地址记录和防作弊机制
