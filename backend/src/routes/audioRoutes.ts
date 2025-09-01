import { Router } from 'express';
import path from 'path';
import { audioFileService } from '../services/audioFileService';
import { authenticateToken } from '../middleware/auth';
import { createLogger } from '../utils/logger';

const logger = createLogger('AudioRoutes');
import {
  getPaperAudioStatus,
  generateQuestionAudio,
  generateSingleQuestionAudio,
  deleteQuestionAudio,
  getQuestionAudioInfo,
  batchGeneratePaperAudio,
  checkQuestionAudioUpdate,
  cleanupOrphanedAudio,
} from '../controllers/audioController';

const router = Router();

/**
 * 处理CORS预检请求
 * OPTIONS /api/audio/questions/:questionId/:filename
 */
router.options('/questions/:questionId/:filename', (req, res) => {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.status(200).end();
});

/**
 * HEAD请求支持 - 检查文件是否存在
 * HEAD /api/audio/questions/:questionId/:filename
 */
router.head('/questions/:questionId/:filename', async (req, res): Promise<void> => {
  try {
    const { questionId, filename } = req.params;
    
    // 验证文件是否存在
    const filePath = await audioFileService.getAudioFilePath(questionId, filename);
    
    if (!filePath) {
      res.status(404).end();
      return;
    }

    // 检查文件是否真实存在
    const fs = require('fs').promises;
    try {
      const stats = await fs.stat(filePath);
      
      // 设置CORS头
      const origin = req.headers.origin;
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      // 设置文件信息头
      const ext = require('path').extname(filename).toLowerCase();
      const contentType = ext === '.mp3' ? 'audio/mpeg' : 
                         ext === '.wav' ? 'audio/wav' : 
                         ext === '.m4a' ? 'audio/mp4' : 
                         ext === '.ogg' ? 'audio/ogg' :
                         'audio/mpeg';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size.toString());
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.status(200).end();
    } catch {
      res.status(404).end();
    }
  } catch (error) {
    logger.error('HEAD请求失败', error);
    res.status(500).end();
  }
});

/**
 * 公开访问语音文件 - 不需要认证，使用Express sendFile方法
 * GET /api/audio/questions/:questionId/:filename
 */
router.get('/questions/:questionId/:filename', async (req, res): Promise<void> => {
  try {
    const { questionId, filename } = req.params;
    
    // 验证文件是否存在（安全检查）
    const filePath = await audioFileService.getAudioFilePath(questionId, filename);
    
    if (!filePath) {
      res.status(404).json({
        success: false,
        error: '音频文件不存在'
      });
      return;
    }

    // 检查文件是否真实存在
    const fs = require('fs').promises;
    try {
      await fs.access(filePath);
    } catch {
      res.status(404).json({
        success: false,
        error: '音频文件不存在'
      });
      return;
    }

    // 设置CORS头 (在sendFile之前设置)
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');

    // 设置音频文件的Content-Type
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.mp3' ? 'audio/mpeg' : 
                       ext === '.wav' ? 'audio/wav' : 
                       ext === '.m4a' ? 'audio/mp4' : 
                       ext === '.ogg' ? 'audio/ogg' :
                       'audio/mpeg';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Accept-Ranges', 'bytes');

    logger.info(`直接提供音频文件: ${filePath}`);
    
    // 使用Express的sendFile方法，它自动处理Range请求、缓存等
    res.sendFile(filePath, {
      acceptRanges: true,
      cacheControl: true,
      lastModified: true,
      etag: true
    }, (err) => {
      if (err && !res.headersSent) {
        logger.error('发送音频文件失败', err);
        res.status(500).json({
          success: false,
          error: '服务器错误'
        });
      }
    });
    
  } catch (error) {
    logger.error('获取音频文件失败', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: '服务器错误'
      });
    }
  }
});

/**
 * 生成单个题目语音文件 - 需要教师认证
 * POST /api/audio/questions/:questionId/generate
 */
router.post('/questions/:questionId/generate', authenticateToken, generateQuestionAudio);

/**
 * 生成单个题目语音文件 (新版本，使用TTS任务管理器) - 需要教师认证
 * POST /api/audio/questions/:questionId/generate-single
 */
router.post('/questions/:questionId/generate-single', authenticateToken, generateSingleQuestionAudio);

/**
 * 删除题目语音文件 - 需要教师认证
 * DELETE /api/audio/questions/:questionId
 */
router.delete('/questions/:questionId', authenticateToken, deleteQuestionAudio);

/**
 * 获取题目语音文件信息 - 需要教师认证
 * GET /api/audio/questions/:questionId/info
 */
router.get('/questions/:questionId/info', authenticateToken, getQuestionAudioInfo);

/**
 * 批量生成试卷语音文件 - 需要教师认证
 * POST /api/audio/papers/:paperId/batch-generate
 */
router.post('/papers/:paperId/batch-generate', authenticateToken, batchGeneratePaperAudio);

/**
 * 获取试卷音频状态聚合数据 - 需要教师认证
 * GET /api/audio/papers/:paperId/status
 */
router.get('/papers/:paperId/status', authenticateToken, getPaperAudioStatus);

/**
 * 检查题目是否需要更新语音 - 需要教师认证
 * GET /api/audio/questions/:questionId/check-update
 */
router.get('/questions/:questionId/check-update', authenticateToken, checkQuestionAudioUpdate);

/**
 * 清理孤立的语音文件 - 需要教师认证
 * POST /api/audio/cleanup
 */
router.post('/cleanup', authenticateToken, cleanupOrphanedAudio);

export default router;