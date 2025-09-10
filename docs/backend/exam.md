# 考试管理模块

## 涉及文件
- `/backend/src/controllers/exam/crud.controller.ts` - 考试CRUD操作
- `/backend/src/controllers/exam/query.controller.ts` - 复杂查询和分页
- `/backend/src/controllers/exam/results.controller.ts` - 考试结果管理
- `/backend/src/controllers/exam/export.controller.ts` - 结果导出功能
- `/backend/src/controllers/exam/lifecycle.controller.ts` - 生命周期管理
- `/backend/src/controllers/examController.ts` - 兼容层导出

## 数据库
- **exams表**: id, paperId, teacherId, publicUuid, title, status(5状态), password, startTime, endTime, durationMinutes, allowMultipleSubmissions, questionIdsSnapshot(JSON)
- **exam_results表**: id, examId, participantId, participantName, answers(JSON), score, ipAddress, startedAt, submittedAt
- **question_responses表**: examResultId, questionId, responseValue, responseScore, timeToAnswerSeconds

## 主要接口（与路由实现同步）
- `POST /api/teacher/exams` → 创建考试
  - 请求：`{ paper_id, title, duration_minutes, start_time?, end_time?, password?, shuffle_questions, allow_multiple_submissions }`
  - 响应：`{ id, public_uuid, title, status, duration_minutes, public_url, created_at, updated_at }`
- `GET /api/teacher/exams` → 获取考试列表（支持状态筛选）
  - 查询：`?status=`（可选）
  - 响应：`Exam[]`（含 `public_uuid/public_url/_count.results` 等）
- `GET /api/teacher/exams/archived` → 获取归档列表
- `GET /api/teacher/exams/:exam_id` → 获取考试详情
- `PUT /api/teacher/exams/:exam_id` → 更新考试（标题/时长/时间窗/选项）
- `DELETE /api/teacher/exams/:exam_id` → 删除（含保护/约束）
- `POST /api/teacher/exams/:exam_id/toggle-publish` → 发布/下线（生成/撤销公开链接）
- `PUT /api/teacher/exams/:exam_id/finish` → 结束考试（published→success）
- `PUT /api/teacher/exams/:exam_id/archive` → 归档（success→archived）
- `PUT /api/teacher/exams/:exam_id/restore` → 恢复（archived→success）
- `GET /api/teacher/exams/:exam_id/submissions` → 提交学生列表（参与者视图）
- `GET /api/teacher/exams/:exam_id/questions` → 考试题目详情（用于结果展示/核验）
- `GET /api/teacher/exams/:exam_id/results` → 结果列表
- `GET /api/teacher/exams/:exam_id/results/:result_id` → 单个结果详情
- `GET /api/teacher/exams/:exam_id/results/export` → 导出 CSV/Excel
- `POST /api/teacher/exams/batch-export` → 批量导出

## 核心功能
- 5状态生命周期管理（DRAFT→PUBLISHED→SUCCESS/EXPIRED→ARCHIVED）
- 公开链接生成（publicUuid）
- 考试结果统计和导出
- 智能分页策略（游标/偏移）
- 密码保护和时间限制
- 题目顺序快照保存

## 注意事项
- 严格状态转换验证（EXAM_STATUS_TRANSITIONS规则）
- questionIdsSnapshot保存题目顺序避免后续修改影响
- 支持多次提交配置
- 结果导出包含详细答题数据

## 字段映射（数据库）
- exams：`id, paperId, teacherId, publicUuid, title, status, password, startTime, endTime, durationMinutes, allowMultipleSubmissions, shuffleQuestions, questionIdsSnapshot(JSON)`
- exam_results：`id, examId, participantId, participantName, answers(JSON), score, ipAddress, startedAt, submittedAt, aiSessionId?`
- question_responses：`examResultId, questionId, responseValue, responseScore, timeToAnswerSeconds, questionDisplayedAt?, responseSubmittedAt`

## 题目快照与顺序
- 列表与详情中题目顺序来源于 `exams.questionIdsSnapshot`；后续对题库的变更不影响已发布考试。
