# AI分析模块

## 涉及文件
- `/backend/src/controllers/aiController.ts` - AI功能控制器
- `/backend/src/controllers/aiDataController.ts` - AI数据控制器
- `/backend/src/controllers/aiReportController.ts` - AI报告控制器
- `/backend/src/services/aiAnalysis/` - AI分析服务模块(8个文件)
- `/backend/src/services/aiProxyService.ts` - AI代理服务
- `/backend/src/services/aiReportService.ts` - AI报告服务

## 数据库
- **ai_sessions表**: id, examId, examResultId(可为null), participant_id, status(ACTIVE/ENDED), createdAt, updatedAt
- **ai_aggregates表**: sessionId, model, key, value_json - AI数据聚合
- **ai_anomalies表**: sessionId, code, severity, from_ts, to_ts - AI异常检测
- **ai_checkpoints表**: sessionId, timestamp, snapshot_json - AI检查点数据
- **ai_reports表**: examResultId, reportContent, reportFile, generatedAt
- **emotion_analysis表**: examResultId, emotionData(JSON), avgHeartRate, analysisTimestamp

## 主要接口（与路由实现同步）
- 公开/学生端：
- `GET /api/ai-service/config` → AI服务配置与可用性
  - 返回：`{ websocket_url, available, features:{...}, diagnostics?, error?, timestamp }`
  - 前端使用 `websocket_url` 通过 Socket.IO 建立信令连接。
  - `POST /api/public/exams/:publicUuid/create-ai-session` → 创建AI会话
  - `POST /api/public/exams/:publicUuid/retry-ai-session` → 重试AI会话
- 教师端（teacher/ai）：
  - `POST /api/teacher/ai/exam-results/:examResultId/generate-report` → 生成AI报告
  - `POST /api/teacher/ai/exam-results/:examResultId/regenerate-report` → 重新生成报告
  - `GET /api/teacher/ai/exam-results/:examResultId/report-status` → 报告状态（latestReport.downloadUrl/filename/progress）
  - `GET /api/teacher/ai/exam-results/:examResultId/emotion-preview` → 情绪数据预览
  - `POST /api/teacher/ai/exam-results/:examResultId/end-session` → 手动结束AI会话
- AI 服务回调：
  - `POST /api/ai-service/sessions/:session_id/finalize` → 完成AI会话
  - `POST /api/ai-service/sessions/:session_id/checkpoint` → 保存会话检查点

## 核心功能
- AI会话独立管理（不依赖ExamResult提前创建）
- 多种会话查找机制（ExamResult、participantId+examId）
- 外部AI服务集成（端口5678）
- 情绪数据和心率实时分析处理
- 多模态分析数据存储（FACE/ATTENTION/PPG/AUDIO）
- AI报告生成和导出（PDF/DOCX/TXT）
- WebRTC + Socket.IO实时数据传输

## AI会话生命周期

### 创建阶段
1. **学生开始考试** → 调用 `/api/public/exams/:publicUuid/create-ai-session`
2. **AI服务检查** → 验证服务可用性（健康检查）
3. **创建会话** → 调用AI服务创建会话，不依赖ExamResult存在
4. **记录会话** → 在ai_sessions表中记录会话信息和状态

### 运行阶段
1. **实时分析** → WebRTC数据流传输到AI服务
2. **数据聚合** → 存储到ai_aggregates/ai_checkpoints表
3. **异常检测** → 记录到ai_anomalies表

### 结束阶段  
1. **学生提交答案** → 调用 submission 控制器，可能触发 AI endSession
2. **查找AI会话** → ExamResult.aiSessionId 或 participantId+examId
3. **停止会话** → 调用 AI 服务停止检测
4. **更新状态** → 更新 ai_sessions.status=ENDED

## 注意事项
- 支持AI服务降级处理与健康检查；前端仅提示可用性
- AI会话可在提交前独立存在，提交时自动关联
- 教师端报告下载地址通过 `report-status` 的 `latestReport.downloadUrl` 返回；无独立下载端点
- WebRTC + Socket.IO 双向通信架构
- 支持 `AI_REQUIRED` 环境变量控制是否必需
