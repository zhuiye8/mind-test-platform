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
- **question_responses表**: 每题详细作答记录
- **question_action_events表**: questionId, actionType, timestamp, optionBefore, optionAfter

## 主要接口
- `GET /api/public/exam/:uuid` → `{exam信息, questions[]}`
- `POST /api/public/exam/:uuid/verify` → 密码验证结果
- `POST /api/public/exam/:uuid/session` → AI会话创建
- `POST /api/public/exam/:uuid/submit` → 提交答题和时间线数据

## 核心功能
- 公开考试信息获取（无需认证）
- 密码验证和访问控制
- 答题数据提交和存储
- 时间线事件解析（DISPLAY/SELECT/CHANGE/NAVIGATE/FOCUS/BLUR）
- AI会话创建和关联
- 防重复提交保护

## 注意事项
- 使用publicUuid避免暴露内部ID
- timeline_data解析为结构化事件记录
- 支持设备检测数据存储
- IP地址记录和防作弊机制