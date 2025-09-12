# AI分析模块

## 涉及文件
- `/backend/src/controllers/aiController.ts` - AI功能控制器
- `/backend/src/controllers/aiDataController.ts` - AI数据控制器
- `/backend/src/controllers/aiReportController.ts` - AI报告控制器
- `/backend/src/services/aiAnalysis/` - AI分析服务模块(11个文件)
  - `aiAnalysisService.ts` - 核心AI分析服务
  - `aiDataMatcher.ts` - AI数据匹配器（新增）
  - `promptBuilder.ts` - 报告提示构建器（新增）
  - `reportGenerator.ts` - AI报告生成器
  - `emotionDataProcessor.ts` - 情绪数据处理器
  - `sessionManager.ts` - AI会话管理器
  - `questionDataBuilder.ts` - 题目数据构建器
  - `healthChecker.ts` - 健康检查器
  - `config.ts` - AI服务配置
  - `types.ts` - TypeScript类型定义
  - `index.ts` - 模块导出
- `/backend/src/services/llm/` - LLM服务模块（新增）
  - `GenericLLMClient.ts` - 通用LLM客户端
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
    - 前端使用返回信息建立WebRTC连接
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
- WebRTC → MediaMTX → RTSP 数据流传输
- **新增**: AI数据匹配和关联分析（aiDataMatcher.ts）
- **新增**: LLM报告生成提示构建（promptBuilder.ts）
- **新增**: 通用LLM客户端集成（GenericLLMClient.ts）

## AI会话生命周期

### 创建阶段
1. **学生开始考试** → 调用 `/api/public/exams/:publicUuid/create-ai-session`
2. **AI服务检查** → 验证服务可用性（健康检查）
3. **创建会话** → 调用AI服务创建会话，不依赖ExamResult存在
4. **记录会话** → 在ai_sessions表中记录会话信息和状态

### 运行阶段
1. **WebRTC推流** → 学生端通过WHIP协议推送到MediaMTX服务器
2. **RTSP拉流** → AI服务从MediaMTX获取RTSP流进行分析
3. **数据聚合** → 存储到ai_aggregates/ai_checkpoints表
4. **异常检测** → 记录到ai_anomalies表

### 结束阶段  
1. **学生提交答案** → 调用 submission 控制器，可能触发 AI endSession
2. **查找AI会话** → ExamResult.aiSessionId 或 participantId+examId
3. **停止会话** → 调用 AI 服务停止检测
4. **更新状态** → 更新 ai_sessions.status=ENDED

## 新增模块详解

### AI数据匹配器 (aiDataMatcher.ts)
- **功能**: 将AI分析数据与考试答题数据进行关联匹配
- **实现**: 基于时间戳和会话ID进行精确匹配
- **用途**: 为报告生成提供完整的数据关联关系

### 报告提示构建器 (promptBuilder.ts) 
- **功能**: 根据考试数据和AI分析结果构建LLM报告生成提示
- **实现**: 模板化提示构建，支持多种报告类型
- **用途**: 为LLM客户端提供结构化的报告生成指令

### 通用LLM客户端 (GenericLLMClient.ts)
- **功能**: 统一的LLM服务接口，支持多种LLM提供商
- **实现**: 抽象化的API调用接口，支持OpenAI、Claude等
- **用途**: AI报告生成的核心引擎，处理自然语言生成任务

## 技术架构

### 数据流传输
```
学生端(WebRTC) → MediaMTX(WHIP/WHEP) → RTSP流 → AI服务(Python) → 分析结果 → 后端数据库
```

### WebRTC集成
- **WHIP协议**: 学生端推流到MediaMTX服务器
- **媒体流管理**: MediaStreamContext维护全局流状态
- **编码参数优化**: 1920x1080@30fps, 最大8Mbps码率
- **降级策略**: maintain-resolution优先，自动适配网络条件

### AI服务通信
- **RTSP消费**: AI服务通过rtsp_consumer.py消费视频流
- **实时分析**: DeepFace情绪检测 + PPG心率监测
- **结果推送**: Socket.IO事件推送分析结果
- **会话管理**: 独立的AI会话生命周期管理

## 注意事项
- 支持AI服务降级处理与健康检查；前端仅提示可用性
- AI会话可在提交前独立存在，提交时自动关联
- 教师端报告下载地址通过 `report-status` 的 `latestReport.downloadUrl` 返回；无独立下载端点
- WebRTC → MediaMTX → RTSP 流媒体传输架构
- 支持 `AI_REQUIRED` 环境变量控制是否必需
- 开发环境：WSL2 + Windows MediaMTX，生产环境：全Linux部署
