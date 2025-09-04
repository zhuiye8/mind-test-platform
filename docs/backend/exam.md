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

## 主要接口
- `POST /api/teacher/exams` → `{exam创建结果}`
- `GET /api/teacher/exams` → `{data: Exam[], pagination}` (支持状态筛选)
- `PUT /api/teacher/exams/:id/publish` → 发布结果和公开链接
- `PUT /api/teacher/exams/:id/finish` → 结束考试确认
- `GET /api/teacher/exams/:id/results` → `{data: ExamResult[], pagination}`
- `GET /api/teacher/exams/:id/export` → Excel文件流

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