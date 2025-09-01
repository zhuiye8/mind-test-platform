/**
 * AI代理路由
 * 提供AI服务的代理接口，解决CORS跨域问题
 */

import { Router, Request, Response } from 'express';
import { aiProxyService } from '../services/aiProxyService';
import { createLogger } from '../utils/logger';
import { sendSuccess, sendError } from '../utils/response';

const logger = createLogger('AIProxyRoutes');

const router = Router();

/**
 * 创建AI分析会话
 * POST /api/ai-proxy/create_session
 */
router.post('/create_session', async (req: Request, res: Response) => {
  try {
    const { participant_id, exam_id } = req.body;
    
    const result = await aiProxyService.createSession({
      participant_id,
      exam_id
    });

    if (result.success && result.data) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error || '代理请求失败', 502);
    }
  } catch (error) {
    logger.error('创建会话错误', error);
    sendError(res, '代理服务内部错误', 500);
  }
});

/**
 * 结束AI分析会话
 * POST /api/ai-proxy/end_session
 */
router.post('/end_session', async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    
    if (!session_id) {
      sendError(res, '缺少session_id参数', 400);
      return;
    }

    const result = await aiProxyService.endSession({
      session_id
    });

    if (result.success && result.data) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error || '代理请求失败', 502);
    }
  } catch (error) {
    logger.error('结束会话错误', error);
    sendError(res, '代理服务内部错误', 500);
  }
});

/**
 * 分析问题数据
 * POST /api/ai-proxy/analyze_questions
 */
router.post('/analyze_questions', async (req: Request, res: Response) => {
  try {
    const { session_id, questions_data } = req.body;
    
    if (!session_id) {
      sendError(res, '缺少session_id参数', 400);
      return;
    }

    if (!questions_data || !Array.isArray(questions_data)) {
      sendError(res, 'questions_data必须是数组', 400);
      return;
    }

    const result = await aiProxyService.analyzeQuestions({
      session_id,
      questions_data
    });

    if (result.success && result.data) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error || '代理请求失败', 502);
    }
  } catch (error) {
    logger.error('分析问题错误', error);
    sendError(res, '代理服务内部错误', 500);
  }
});

/**
 * 健康检查
 * GET /api/ai-proxy/health
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const result = await aiProxyService.checkHealth();
    
    if (result.success && result.data) {
      sendSuccess(res, result.data);
    } else {
      sendError(res, result.error || '健康检查失败', 503);
    }
  } catch (error) {
    logger.error('健康检查错误', error);
    sendError(res, '健康检查失败', 500);
  }
});

/**
 * 获取WebSocket配置
 * GET /api/ai-proxy/config
 * 
 * 注意：WebSocket连接仍然直连AI服务，不经过代理
 * 这个接口只返回配置信息
 */
router.get('/config', (_req: Request, res: Response) => {
  try {
    const config = aiProxyService.getWebSocketConfig();
    sendSuccess(res, config);
  } catch (error) {
    logger.error('获取配置错误', error);
    sendError(res, '获取配置失败', 500);
  }
});

export default router;