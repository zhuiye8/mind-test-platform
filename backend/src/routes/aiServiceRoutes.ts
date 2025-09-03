/**
 * AI 服务专用路由
 * 处理 AI 服务回调与配置查询
 */

import { Router } from 'express';
import { authenticateAiService } from '../middleware/authenticateAiService';
import { finalizeAISession, saveAICheckpoint, getAISession } from '../controllers/aiDataController';
import { getAIServiceConfig } from '../controllers/aiController';

const router = Router();

// AI 数据回传端点（遵循 AI_API_CONTRACT）
router.post('/sessions/:session_id/finalize', authenticateAiService, finalizeAISession);
router.post('/sessions/:session_id/checkpoint', authenticateAiService, saveAICheckpoint);
router.get('/sessions/:session_id', authenticateAiService, getAISession);

// AI 服务配置（公开接口，学生端使用）
router.get('/config', getAIServiceConfig);

export default router;
