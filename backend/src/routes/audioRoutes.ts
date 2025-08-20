import { Router } from 'express';
import path from 'path';
import { audioFileService } from '../services/audioFileService';
// import { audioProgressService } from '../services/audioProgressService'; // 已禁用WebSocket
import { authenticateToken } from '../middleware/auth';

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
    console.error('HEAD请求失败:', error);
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

    console.log(`🎵 直接提供音频文件: ${filePath}`);
    
    // 使用Express的sendFile方法，它自动处理Range请求、缓存等
    res.sendFile(filePath, {
      acceptRanges: true,
      cacheControl: true,
      lastModified: true,
      etag: true
    }, (err) => {
      if (err && !res.headersSent) {
        console.error('发送音频文件失败:', err);
        res.status(500).json({
          success: false,
          error: '服务器错误'
        });
      }
    });
    
  } catch (error) {
    console.error('获取音频文件失败:', error);
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
router.post('/questions/:questionId/generate', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { voiceSettings } = req.body;
    
    console.log(`🎙️ 收到语音生成请求: ${questionId}`);
    
    const result = await audioFileService.generateAudioForQuestion(questionId, voiceSettings);
    
    if (result.success) {
      res.json({
        success: true,
        data: {
          audioId: result.audioId,
          fileUrl: result.fileUrl,
          duration: result.duration
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('生成语音文件失败:', error);
    res.status(500).json({
      success: false,
      error: '生成语音失败'
    });
  }
});

/**
 * 生成单个题目语音文件 (新版本，使用TTS任务管理器) - 需要教师认证
 * POST /api/audio/questions/:questionId/generate-single
 */
router.post('/questions/:questionId/generate-single', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { voiceSettings, async: asyncMode = false } = req.body;
    
    console.log(`🎙️ 收到新版单题目语音生成请求: ${questionId}, 异步模式: ${asyncMode}`);
    
    if (asyncMode) {
      // 异步模式：立即返回，WebSocket推送进度
      res.json({
        success: true,
        message: '语音生成任务已启动，请通过WebSocket监听进度',
        questionId
      });

      // 异步执行生成任务
      audioFileService.generateSingleQuestionAudio(
        questionId,
        voiceSettings,
        (progress, status) => {
          console.log(`🎯 单题目 ${questionId} 进度: ${progress}% - ${status}`);
          // 这里可以通过WebSocket发送进度更新
          // audioProgressService.sendQuestionProgress(...);
        }
      ).then(result => {
        if (result.success) {
          console.log(`✅ 异步生成单题目 ${questionId} 成功`);
        } else {
          console.error(`❌ 异步生成单题目 ${questionId} 失败:`, result.error);
        }
      }).catch(error => {
        console.error(`❌ 异步生成单题目 ${questionId} 异常:`, error);
      });

    } else {
      // 同步模式：等待完成后返回结果
      const result = await audioFileService.generateSingleQuestionAudio(
        questionId,
        voiceSettings,
        (progress, status) => {
          console.log(`🎯 单题目 ${questionId} 进度: ${progress}% - ${status}`);
        }
      );
      
      if (result.success) {
        res.json({
          success: true,
          data: {
            audioId: result.audioId,
            fileUrl: result.fileUrl,
            duration: result.duration
          },
          message: '语音生成完成'
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    }
    
  } catch (error) {
    console.error('新版生成语音文件失败:', error);
    res.status(500).json({
      success: false,
      error: '生成语音失败'
    });
  }
});

/**
 * 删除题目语音文件 - 需要教师认证
 * DELETE /api/audio/questions/:questionId
 */
router.delete('/questions/:questionId', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    
    console.log(`🗑️ 收到语音删除请求: ${questionId}`);
    
    const success = await audioFileService.deleteAudioFile(questionId);
    
    if (success) {
      res.json({
        success: true,
        message: '语音文件已删除'
      });
    } else {
      res.status(400).json({
        success: false,
        error: '删除语音文件失败'
      });
    }
    
  } catch (error) {
    console.error('删除语音文件失败:', error);
    res.status(500).json({
      success: false,
      error: '删除语音失败'
    });
  }
});

/**
 * 获取题目语音文件信息 - 需要教师认证
 * GET /api/audio/questions/:questionId/info
 */
router.get('/questions/:questionId/info', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const audioInfo = await audioFileService.getAudioInfo(questionId);
    
    res.json({
      success: true,
      data: audioInfo
    });
    
  } catch (error) {
    console.error('获取语音信息失败:', error);
    res.status(500).json({
      success: false,
      error: '获取语音信息失败'
    });
  }
});

/**
 * 批量生成试卷语音文件 - 需要教师认证
 * POST /api/audio/papers/:paperId/batch-generate
 */
router.post('/papers/:paperId/batch-generate', authenticateToken, async (req, res) => {
  try {
    const { paperId } = req.params;
    const { voiceSettings } = req.body;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      return res.status(401).json({
        success: false,
        error: '认证信息无效'
      });
    }
    
    console.log(`📋 收到批量语音生成请求: ${paperId} (教师: ${teacherId})`);
    
    // WebSocket服务已禁用，使用轮询机制获取进度
    console.log('📊 使用轮询机制进行进度更新，请通过 /api/audio/papers/:paperId/status 查询状态');
    
    // 设置长时间超时，因为批量生成可能需要较长时间
    req.setTimeout(300000); // 5分钟超时
    
    let totalQuestions = 0;
    
    // 传统进度回调（向后兼容）
    const onProgress = (current: number, total: number, questionId: string) => {
      totalQuestions = total;
      console.log(`📊 批量生成进度: ${current}/${total} - ${questionId}`);
    };
    
    const result = await audioFileService.batchGenerateAudio(paperId, voiceSettings, onProgress);
    
    res.json({
      success: true,
      data: {
        totalQuestions,
        successCount: result.success,
        failedCount: result.failed,
        errors: result.errors,
        totalTime: result.totalTime
      }
    });
    
  } catch (error) {
    console.error('批量生成语音失败:', error);
    res.status(500).json({
      success: false,
      error: '批量生成语音失败'
    });
  }
  return;
});

/**
 * 获取试卷音频状态聚合数据 - 需要教师认证
 * GET /api/audio/papers/:paperId/status
 */
router.get('/papers/:paperId/status', authenticateToken, async (req, res) => {
  try {
    const { paperId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      return res.status(401).json({
        success: false,
        error: '认证信息无效'
      });
    }

    // 验证试卷权限
    const paper = await audioFileService.getPaperWithPermissionCheck(paperId, teacherId);
    if (!paper) {
      return res.status(404).json({
        success: false,
        error: '试卷不存在或无权限访问'
      });
    }

    // 获取聚合状态数据
    const aggregatedStatus = await audioFileService.getPaperAudioStatusAggregated(paperId);
    
    return res.json({
      success: true,
      data: aggregatedStatus
    });
    
  } catch (error) {
    console.error('获取试卷音频状态失败:', error);
    return res.status(500).json({
      success: false,
      error: '获取音频状态失败'
    });
  }
});

/**
 * 检查题目是否需要更新语音 - 需要教师认证
 * GET /api/audio/questions/:questionId/check-update
 */
router.get('/questions/:questionId/check-update', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const checkResult = await audioFileService.updateAudioIfNeeded(questionId);
    
    res.json({
      success: true,
      data: checkResult
    });
    
  } catch (error) {
    console.error('检查语音更新失败:', error);
    res.status(500).json({
      success: false,
      error: '检查更新失败'
    });
  }
});

/**
 * 清理孤立的语音文件 - 需要教师认证
 * POST /api/audio/cleanup
 */
router.post('/cleanup', authenticateToken, async (_req, res) => {
  try {
    console.log('🧹 开始清理孤立语音文件');
    
    const result = await audioFileService.cleanupOrphanedAudio();
    
    res.json({
      success: true,
      data: {
        cleanedCount: result.cleaned,
        errors: result.errors
      }
    });
    
  } catch (error) {
    console.error('清理语音文件失败:', error);
    res.status(500).json({
      success: false,
      error: '清理失败'
    });
  }
});

export default router;