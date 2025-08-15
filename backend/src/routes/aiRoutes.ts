import express from 'express';
import {
  createEmotionSession,
  endEmotionSession,
  generateReport,
  getReportStatus,
  downloadReport,
  getReports,
} from '../controllers/aiController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// 情绪分析相关路由
router.post('/emotion/session', createEmotionSession);
router.post('/emotion/session/:sessionId/end', endEmotionSession);

// AI报告相关路由
router.post('/report/generate', generateReport);
router.get('/report/:reportId/status', getReportStatus);
router.get('/report/:reportId/download', downloadReport);
router.get('/reports', getReports);

// 需要认证的管理员路由
router.get('/admin/reports', authenticateToken, async (_req, res) => {
  // 管理员查看所有报告
  // 这里可以添加管理员权限检查
  res.json({ message: '管理员报告列表功能待实现' });
});

router.delete('/admin/report/:reportId', authenticateToken, async (_req, res) => {
  // 管理员删除报告
  res.json({ message: '删除报告功能待实现' });
});

export default router;