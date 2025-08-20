/**
 * AI代理路由
 * 提供AI服务的代理接口，解决CORS跨域问题
 */

import { Router, Request, Response } from 'express';
import { aiProxyService } from '../services/aiProxyService';

const router = Router();

/**
 * 创建AI分析会话
 * POST /api/ai-proxy/create_session
 */
router.post('/create_session', async (req: Request, res: Response) => {
  try {
    const { student_id, exam_id } = req.body;
    
    const result = await aiProxyService.createSession({
      student_id,
      exam_id
    });

    if (result.success && result.data) {
      res.json(result.data);
    } else {
      res.status(502).json({
        success: false,
        message: result.error || '代理请求失败',
        errorCode: result.errorCode || 'PROXY_ERROR'
      });
    }
  } catch (error) {
    console.error('[AIProxy路由] 创建会话错误:', error);
    res.status(500).json({
      success: false,
      message: '代理服务内部错误'
    });
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
      res.status(400).json({
        success: false,
        message: '缺少session_id参数'
      });
      return;
    }

    const result = await aiProxyService.endSession({
      session_id
    });

    if (result.success && result.data) {
      res.json(result.data);
    } else {
      res.status(502).json({
        success: false,
        message: result.error || '代理请求失败',
        errorCode: result.errorCode || 'PROXY_ERROR'
      });
    }
  } catch (error) {
    console.error('[AIProxy路由] 结束会话错误:', error);
    res.status(500).json({
      success: false,
      message: '代理服务内部错误'
    });
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
      res.status(400).json({
        success: false,
        message: '缺少session_id参数'
      });
      return;
    }

    if (!questions_data || !Array.isArray(questions_data)) {
      res.status(400).json({
        success: false,
        message: 'questions_data必须是数组'
      });
      return;
    }

    const result = await aiProxyService.analyzeQuestions({
      session_id,
      questions_data
    });

    if (result.success && result.data) {
      res.json(result.data);
    } else {
      res.status(502).json({
        success: false,
        message: result.error || '代理请求失败',
        errorCode: result.errorCode || 'PROXY_ERROR'
      });
    }
  } catch (error) {
    console.error('[AIProxy路由] 分析问题错误:', error);
    res.status(500).json({
      success: false,
      message: '代理服务内部错误'
    });
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
      res.json(result.data);
    } else {
      res.status(503).json(result.data || {
        status: 'unhealthy',
        message: result.error || '健康检查失败'
      });
    }
  } catch (error) {
    console.error('[AIProxy路由] 健康检查错误:', error);
    res.status(500).json({
      status: 'error',
      message: '健康检查失败'
    });
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
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('[AIProxy路由] 获取配置错误:', error);
    res.status(500).json({
      success: false,
      message: '获取配置失败'
    });
  }
});

export default router;