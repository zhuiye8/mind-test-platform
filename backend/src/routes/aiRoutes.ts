/**
 * AI 分析功能路由（教师端使用）
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  generateAIReport,
  getAIReportStatus,
  checkAIServiceHealth,
  endAISession,
  regenerateAIReport,
  getEmotionDataPreview,
} from '../controllers/aiController';

const router = Router();

// 教师端所有 AI 接口均需身份认证
router.use(authenticateToken);

// AI 分析相关接口
router.post('/exam-results/:examResultId/generate-report', generateAIReport); // 生成 AI 分析报告
router.post('/exam-results/:examResultId/regenerate-report', regenerateAIReport); // 重新生成 AI 分析报告
router.get('/exam-results/:examResultId/report-status', getAIReportStatus); // 获取报告状态
router.get('/exam-results/:examResultId/emotion-preview', getEmotionDataPreview); // 获取情绪分析数据预览
router.post('/exam-results/:examResultId/end-session', endAISession); // 手动结束 AI 会话
router.get('/service/health', checkAIServiceHealth); // AI 服务健康检查

export default router;
