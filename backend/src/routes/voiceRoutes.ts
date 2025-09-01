import { Router } from 'express';
import { llmService } from '../services/llmService';
import { createLogger } from '../utils/logger';

const logger = createLogger('VoiceRoutes');

const router = Router();

/**
 * 语音匹配接口
 */
router.post('/match', async (req, res) => {
  try {
    const { voiceText, question, options, questionId } = req.body;
    
    // 验证参数
    if (!voiceText || !question || !options) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数'
      });
      return;
    }

    logger.info(`语音匹配请求 [${questionId}]: "${voiceText}"`);
    
    // 调用LLM服务进行匹配
    const result = await llmService.matchVoiceAnswer(
      voiceText,
      question,
      options
    );
    
    logger.info(`匹配结果 [${questionId}]:`, result);
    
    // 返回结果
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('语音匹配接口错误', error);
    res.status(500).json({
      success: false,
      error: '语音匹配失败'
    });
  }
});

/**
 * 获取语音提示
 */
router.post('/prompt', async (req, res) => {
  try {
    const { question, options } = req.body;
    
    if (!question || !options) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数'
      });
      return;
    }
    
    const prompt = llmService.generateVoicePrompt(question, options);
    
    res.json({
      success: true,
      data: {
        prompt
      }
    });
    
  } catch (error) {
    logger.error('生成语音提示失败', error);
    res.status(500).json({
      success: false,
      error: '生成提示失败'
    });
  }
});

/**
 * 检查LLM服务状态
 */
router.get('/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      llmEnabled: llmService.isEnabled(),
      timestamp: new Date().toISOString()
    }
  });
});

export default router;