/**
 * AI 服务专用路由
 * 处理 AI 服务回调与配置查询
 */

import express, { Router } from 'express';
import { authenticateAiService } from '../middleware/authenticateAiService';
import { finalizeAISession, getAISession } from '../controllers/aiDataController';
import { getAIServiceConfig } from '../controllers/aiController';

const router = Router();

// AI 数据回传端点（遵循 AI_API_CONTRACT - JSON文件存储）
// 仅对 application/gzip 启用 raw 解析，让控制器能拿到 Buffer 进行解压与MD5校验
router.post(
  '/sessions/:session_id/finalize',
  express.raw({ type: 'application/gzip', limit: '50mb' }),
  authenticateAiService,
  finalizeAISession
);
router.get('/sessions/:session_id', authenticateAiService, getAISession);
// 注意：checkpoint路由已废弃，现在使用JSON文件存储

// AI 服务配置（公开接口，学生端使用）
router.get('/config', getAIServiceConfig);

export default router;
