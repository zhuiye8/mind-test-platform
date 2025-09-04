# AI分析模块

## 涉及文件
- `/backend/src/controllers/aiController.ts` - AI功能控制器
- `/backend/src/controllers/aiDataController.ts` - AI数据控制器
- `/backend/src/controllers/aiReportController.ts` - AI报告控制器
- `/backend/src/services/aiAnalysis/` - AI分析服务模块(8个文件)
- `/backend/src/services/aiProxyService.ts` - AI代理服务
- `/backend/src/services/aiReportService.ts` - AI报告服务

## 数据库
- **ai_sessions表**: id, examResultId, status(ACTIVE/ENDED), aiServiceUrl, createdAt, endedAt
- **ai_analysis_data表**: sessionId, modelType, analysisData(JSON), confidence, timestamp
- **ai_reports表**: examResultId, reportContent, reportFile, generatedAt
- **emotion_analysis表**: examResultId, emotionData(JSON), avgHeartRate, analysisTimestamp

## 主要接口
- `GET /api/teacher/ai/config` → AI服务配置和健康状态
- `POST /api/teacher/ai/session` → 创建AI分析会话
- `POST /api/ai-service/sessions/:sessionId/finalize` → 完成AI会话
- `POST /api/reports/generate` → 生成AI分析报告
- `GET /api/reports/:reportId/download` → 下载报告文件

## 核心功能
- AI会话生命周期管理
- 外部AI服务集成（emotion_origin端口5000）
- 情绪数据和心率分析处理
- 多模态分析数据存储
- AI报告生成和导出（PDF/DOCX/TXT）
- WebSocket配置和健康检查

## 注意事项
- 支持AI服务降级处理
- 需要AI服务认证token
- 报告生成支持异步处理
- WebRTC数据传输集成