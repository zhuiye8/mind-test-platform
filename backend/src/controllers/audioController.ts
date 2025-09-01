/**
 * 音频控制器
 * 处理音频相关的业务逻辑和权限验证
 */

import { Request, Response } from 'express';
import { audioFileService } from '../services/audioFileService';

/**
 * 获取试卷音频状态聚合数据
 */
export const getPaperAudioStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      res.status(401).json({
        success: false,
        error: '认证信息无效'
      });
      return;
    }

    // 验证试卷权限
    const paper = await audioFileService.getPaperWithPermissionCheck(paperId, teacherId);
    if (!paper) {
      res.status(404).json({
        success: false,
        error: '试卷不存在或无权限访问'
      });
      return;
    }

    // 获取聚合状态数据
    const aggregatedStatus = await audioFileService.getPaperAudioStatusAggregated(paperId);
    
    res.json({
      success: true,
      data: aggregatedStatus
    });
    
  } catch (error) {
    console.error('获取试卷音频状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取音频状态失败'
    });
  }
};

/**
 * 生成单个题目语音文件
 */
export const generateQuestionAudio = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * 生成单个题目语音文件 (新版本，使用TTS任务管理器)
 */
export const generateSingleQuestionAudio = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * 删除题目语音文件
 */
export const deleteQuestionAudio = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * 获取题目语音文件信息
 */
export const getQuestionAudioInfo = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * 批量生成试卷语音文件
 */
export const batchGeneratePaperAudio = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { voiceSettings } = req.body;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      res.status(401).json({
        success: false,
        error: '认证信息无效'
      });
      return;
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
};

/**
 * 检查题目是否需要更新语音
 */
export const checkQuestionAudioUpdate = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * 清理孤立的语音文件
 */
export const cleanupOrphanedAudio = async (_req: Request, res: Response): Promise<void> => {
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
};