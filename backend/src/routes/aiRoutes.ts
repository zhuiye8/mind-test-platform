/**
 * AI分析功能路由
 * 提供教师端AI分析功能 + AI服务数据接收端点
 */

import { Router } from 'express';
import { authenticateAiService } from '../middleware/authenticateAiService';
import { authenticateToken } from '../middleware/auth';
import {
  generateAIReport,
  getAIReportStatus,
  checkAIServiceHealth,
  endAISession,
  getAIServiceConfig,
  regenerateAIReport,
  getEmotionDataPreview,
} from '../controllers/aiController';
import {
  finalizeAISession,
  saveAICheckpoint,
  getAISession,
} from '../controllers/aiDataController';

const router = Router();

// AI Data Ingestion Endpoints (按 AI_API_CONTRACT.md 规范)
// POST /api/ai/sessions/:session_id/finalize
router.post('/sessions/:session_id/finalize', authenticateAiService, finalizeAISession);

// POST /api/ai/sessions/:session_id/checkpoint
router.post('/sessions/:session_id/checkpoint', authenticateAiService, saveAICheckpoint);

// GET /api/ai/sessions/:session_id - Debug endpoint
router.get('/sessions/:session_id', authenticateAiService, getAISession);

// AI服务配置接口（公开，学生端需要）
router.get('/config', getAIServiceConfig);                                     // 获取AI服务配置

// 教师端AI功能路由 - 需要教师认证
router.use(authenticateToken);

// AI分析相关接口
router.post('/exam-results/:examResultId/generate-report', generateAIReport);     // 生成AI分析报告
router.post('/exam-results/:examResultId/regenerate-report', regenerateAIReport); // 重新生成AI分析报告
router.get('/exam-results/:examResultId/report-status', getAIReportStatus);       // 获取报告状态
router.get('/exam-results/:examResultId/emotion-preview', getEmotionDataPreview); // 获取情绪分析数据预览
router.post('/exam-results/:examResultId/end-session', endAISession);             // 手动结束AI会话
router.get('/service/health', checkAIServiceHealth);                              // AI服务健康检查

export default router;