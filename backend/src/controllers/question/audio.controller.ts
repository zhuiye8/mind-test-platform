import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import prisma from '../../utils/database';
import { audioFileService } from '../../services/audioFileService';

// 获取题目列表（按试卷）- 包含语音状态
export const getQuestionsByPaper = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证试卷权限
    const paper = await prisma.paper.findFirst({
      where: {
        id: paperId,
        teacherId,
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限访问', 404);
      return;
    }

    // 获取题目列表（包含语音文件信息）
    const questions = await prisma.question.findMany({
      where: { paperId },
      orderBy: { questionOrder: 'asc' },
      include: {
        audio: {
          select: {
            id: true,
            status: true,
            fileUrl: true,
            duration: true,
            contentHash: true,
            generatedAt: true,
            error: true,
          }
        }
      }
    });

    const formattedQuestions = questions.map(question => {
      // 计算当前题目内容哈希
      const currentHash = audioFileService.calculateContentHash({
        id: question.id,
        title: question.title,
        options: question.options,
        question_type: question.questionType,
      });
      
      // 判断语音是否需要更新
      const audioNeedsUpdate = question.audio ? 
        (question.audio.contentHash !== currentHash) : false;

      return {
        id: question.id,
        question_order: question.questionOrder,
        title: question.title,
        options: question.options,
        question_type: question.questionType,
        display_condition: question.displayCondition,
        is_required: question.isRequired,
        is_scored: question.isScored,
        score_value: question.scoreValue,
        created_at: question.createdAt.toISOString(),
        updated_at: question.updatedAt.toISOString(),
        // 语音文件状态
        audio_status: question.audio?.status || 'none',
        audio_url: question.audio?.fileUrl || null,
        audio_duration: question.audio?.duration || null,
        audio_needs_update: audioNeedsUpdate,
        audio_error: question.audio?.error || null,
        audio_generated_at: question.audio?.generatedAt?.toISOString() || null,
      };
    });

    sendSuccess(res, formattedQuestions);
  } catch (error) {
    console.error('获取题目列表错误:', error);
    sendError(res, '获取题目列表失败', 500);
  }
};

// 批量生成试卷语音文件
export const batchGenerateAudio = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { voiceSettings, forceRegenerate = false } = req.body;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证试卷权限
    const paper = await prisma.paper.findFirst({
      where: {
        id: paperId,
        teacherId,
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限操作', 404);
      return;
    }

    console.log(`📋 开始批量生成试卷 ${paper.title} 的语音文件`);

    // 获取需要生成语音的题目
    let questions;
    if (forceRegenerate) {
      // 强制重新生成所有题目的语音
      questions = await prisma.question.findMany({
        where: { paperId },
        orderBy: { questionOrder: 'asc' }
      });
    } else {
      // 只生成没有语音或需要更新的题目
      questions = await prisma.question.findMany({
        where: { paperId },
        include: { audio: true },
        orderBy: { questionOrder: 'asc' }
      });

      // 过滤出需要生成/更新的题目
      const questionsToGenerate = [];
      for (const question of questions) {
        if (!question.audio) {
          // 没有语音文件
          questionsToGenerate.push(question);
        } else {
          // 检查是否需要更新
          const currentHash = audioFileService.calculateContentHash({
            id: question.id,
            title: question.title,
            options: question.options,
            question_type: question.questionType,
          });
          
          if (question.audio.contentHash !== currentHash || question.audio.status === 'error') {
            questionsToGenerate.push(question);
          }
        }
      }
      questions = questionsToGenerate;
    }

    if (questions.length === 0) {
      sendSuccess(res, {
        message: '所有题目的语音文件都是最新的',
        totalQuestions: 0,
        successCount: 0,
        failedCount: 0,
        errors: []
      });
      return;
    }

    // 执行批量生成
    const result = await audioFileService.batchGenerateAudio(
      paperId,
      voiceSettings,
      (current: number, total: number, questionId: string) => {
        console.log(`📊 生成进度: ${current}/${total} - ${questionId}`);
      }
    );

    sendSuccess(res, {
      message: `批量语音生成完成`,
      totalQuestions: questions.length,
      successCount: result.success,
      failedCount: result.failed,
      errors: result.errors
    });

    console.log(`✅ 试卷 ${paper.title} 批量语音生成完成: 成功 ${result.success}, 失败 ${result.failed}`);

  } catch (error) {
    console.error('批量生成语音失败:', error);
    sendError(res, '批量生成语音失败', 500);
  }
};

// 获取试卷语音状态概览
export const getPaperAudioStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证试卷权限
    const paper = await prisma.paper.findFirst({
      where: {
        id: paperId,
        teacherId,
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限操作', 404);
      return;
    }

    // 获取所有题目及其语音状态
    const questions = await prisma.question.findMany({
      where: { paperId },
      include: { 
        audio: {
          select: {
            status: true,
            contentHash: true,
            generatedAt: true,
            duration: true,
          }
        }
      },
      orderBy: { questionOrder: 'asc' }
    });

    // 统计各状态的题目数量
    const statusCount = {
      none: 0,        // 无语音文件
      pending: 0,     // 生成中
      generating: 0,  // 生成中
      ready: 0,       // 已完成
      error: 0,       // 生成失败
      needUpdate: 0   // 需要更新
    };

    let totalDuration = 0;
    let hasAudioCount = 0;

    for (const question of questions) {
      if (!question.audio) {
        statusCount.none++;
      } else {
        // 检查是否需要更新
        const currentHash = audioFileService.calculateContentHash({
          id: question.id,
          title: question.title,
          options: question.options,
          question_type: question.questionType,
        });

        if (question.audio.contentHash !== currentHash) {
          statusCount.needUpdate++;
        } else {
          const status = question.audio.status;
          if (status in statusCount) {
            statusCount[status as keyof typeof statusCount]++;
          }
          
          if (status === 'ready' && question.audio.duration) {
            totalDuration += question.audio.duration;
            hasAudioCount++;
          }
        }
      }
    }

    // 计算完成率
    const totalQuestions = questions.length;
    const completedCount = statusCount.ready;
    const completionRate = totalQuestions > 0 ? Math.round((completedCount / totalQuestions) * 100) : 0;

    sendSuccess(res, {
      paperId,
      paperTitle: paper.title,
      totalQuestions,
      statusCount,
      completionRate,
      totalDuration: Math.round(totalDuration * 10) / 10, // 保留1位小数
      averageDuration: hasAudioCount > 0 ? Math.round((totalDuration / hasAudioCount) * 10) / 10 : 0,
      lastGenerated: questions
        .map(q => q.audio?.generatedAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] || null
    });

  } catch (error) {
    console.error('获取试卷语音状态失败:', error);
    sendError(res, '获取语音状态失败', 500);
  }
};