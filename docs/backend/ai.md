# AI分析模块

**Last Updated**: 2025-01-15 - 添加ID对齐机制和数据传输流程

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
    - 返回：`{ available, websocket_url?, error?, timestamp }`
    - 前端用于检查AI服务状态，不直接建立WebRTC连接
  - `POST /api/public/exams/:publicUuid/create-ai-session` → 创建AI会话
    - 请求：`{ participant_id, participant_name, started_at? }`
    - 响应：`{ examResultId?, aiSessionId?, message, warning? }`
  - `POST /api/public/exams/:publicUuid/retry-ai-session` → 重试AI会话
- 教师端（teacher/ai）：
  - `POST /api/teacher/ai/exam-results/:examResultId/generate-report` → 生成AI报告
    - 支持 force=true 强制重新生成
  - `POST /api/teacher/ai/exam-results/:examResultId/regenerate-report` → 重新生成报告
  - `GET /api/teacher/ai/exam-results/:examResultId/report-status` → 报告状态
    - 返回：`{ latestReport: { downloadUrl?, filename?, progress?, status } }`
  - `GET /api/teacher/ai/exam-results/:examResultId/emotion-preview` → 情绪数据预览
  - `POST /api/teacher/ai/exam-results/:examResultId/end-session` → 手动结束AI会话
  - `GET /api/teacher/ai/service/health` → AI服务健康检查
- AI 服务回调：
  - `POST /api/ai-service/sessions/:session_id/finalize` → 完成AI会话（gzip压缩JSON数据）
  - `GET /api/ai-service/sessions/:session_id` → 查询会话信息

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
2. **后端创建会话** → 调用AI服务 `/api/create_session`，传递UUID session_id
3. **AI服务注册** → 在AI服务 `student_sessions` 中注册session_id与stream_name映射
4. **数据库记录** → 在ai_sessions表中记录会话信息和状态

### 运行阶段
1. **WebRTC推流** → 学生端通过WHIP协议推送到MediaMTX服务器
2. **RTSP拉流** → AI服务从MediaMTX获取RTSP流，通过stream_name映射到session_id
3. **实时分析** → AI模型分析音视频数据，保存到 session_id.json 文件
4. **Socket.IO推送** → 实时分析结果推送给教师和学生端

### 结束阶段  
1. **学生提交答案** → 调用 submission 控制器，触发 AI endSession
2. **AI数据整理** → AI服务整理完整分析数据，准备传输
3. **数据传输** → AI服务调用 `/api/ai-service/sessions/:session_id/finalize` 发送gzip压缩数据
4. **文件清理** → AI服务删除本地 session_id.json 文件，更新状态为ENDED

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

### ID对齐机制 ⚠️
**核心概念**：
- **session_id**: UUID格式（如 d38c6f7a-32c9-47e7-a4ee-5c0d89641dfe），用于数据存储和数据库关联
- **stream_name**: 格式为 `exam-{examUuid[:8]}-user-{participantId[:8]}`，仅用于RTSP流传输

**映射关系**：
```typescript
// 后端创建AI会话
const sessionId = uuid.v4();  // d38c6f7a-32c9-47e7-a4ee-5c0d89641dfe
const streamName = generateStreamName(examPublicUuid, participantId);  // exam-5e3a23e1-user-2025011

// AI服务注册映射
student_sessions[sessionId] = {
  session_id: sessionId,      // UUID，唯一标识
  stream_name: streamName,    // RTSP流名称
  student_id: participantId,
  // ...
}
```

**数据流传输**：
```
学生端(WebRTC) → MediaMTX(WHIP/WHEP) → RTSP流(stream_name) → AI服务(映射到session_id) → 数据文件(session_id.json) → 后端数据库
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
- **ID对齐**: 严格区分session_id（UUID）和stream_name（RTSP流名），绝不混用
- **映射机制**: AI服务必须通过`student_sessions`映射表建立stream_name到session_id的关联
- **数据传输**: AI服务使用gzip压缩JSON + MD5校验传输完整分析数据
- **支持降级**: AI服务不可用时考试仍可正常进行，仅失去AI分析功能
- **教师端报告**: 下载地址通过 `report-status` 的 `latestReport.downloadUrl` 返回
- **会话独立性**: AI会话可在提交前独立存在，提交时自动关联ExamResult
- **环境配置**: 支持 `AI_REQUIRED` 环境变量控制是否必需
- **部署架构**: 开发环境WSL2 + Windows MediaMTX，生产环境全Linux部署

### 常见问题排查
- **会话创建失败**: 检查session_id与stream_name是否正确映射
- **数据未找到**: 确认AI服务使用session_id而非stream_name保存文件
- **传输失败**: 验证finalize接口的gzip压缩和MD5校验是否正确
