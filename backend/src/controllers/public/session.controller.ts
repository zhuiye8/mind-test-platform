/**
 * 公开考试会话管理控制器
 * 负责AI分析会话的创建、重试和管理
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { ExamStatus } from '../../types';
import prisma from '../../utils/database';
import { aiAnalysisService } from '../../services/aiAnalysis';

// 重试AI分析会话
export const retryAISession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicUuid } = req.params;
    const { participant_id, participant_name } = req.body;

    // 参数验证
    if (!participant_id || !participant_name) {
      sendError(res, '参与者ID和姓名不能为空', 400);
      return;
    }

    // 获取考试信息
    const exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
      },
    });

    if (!exam) {
      sendError(res, '考试不存在', 404);
      return;
    }

    if (exam.status !== ExamStatus.PUBLISHED) {
      sendError(res, '考试尚未发布', 403);
      return;
    }

    // 检查考试时间
    const now = new Date();
    if (exam.startTime && now < exam.startTime) {
      sendError(res, '考试尚未开始', 403);
      return;
    }
    if (exam.endTime && now > exam.endTime) {
      sendError(res, '考试已结束', 403);
      return;
    }

    // 查找现有的考试结果记录（应该在之前的创建过程中生成）
    const existingResult = await prisma.examResult.findUnique({
      where: {
        examId_participantId: {
          examId: exam.id,
          participantId: participant_id,
        },
      },
    });

    if (!existingResult) {
      sendError(res, '未找到考试记录，请重新开始考试', 404);
      return;
    }

    // 检查是否已经提交
    if (existingResult.submittedAt.getTime() !== new Date('1970-01-01').getTime()) {
      sendError(res, '您已经提交过本次考试，无法重试', 409);
      return;
    }

    // 如果已经有AI会话ID，说明之前成功过，无需重试
    if (existingResult.aiSessionId) {
      sendSuccess(res, {
        examResultId: existingResult.id,
        aiSessionId: existingResult.aiSessionId,
        message: 'AI分析会话已存在，无需重试',
      });
      return;
    }

    try {
      // 重新尝试创建AI分析会话
      const aiResult = await aiAnalysisService.createSession(
        existingResult.id,
        participant_id,
        exam.id
      );

      if (aiResult.success) {
        console.log(`✅ 学生 ${participant_name}(${participant_id}) 重试创建AI会话成功: ${aiResult.sessionId}`);
        
        sendSuccess(res, {
          examResultId: existingResult.id,
          aiSessionId: aiResult.sessionId,
          message: 'AI分析会话重试创建成功',
        });
      } else {
        console.warn(`⚠️ 学生 ${participant_name}(${participant_id}) 重试创建AI会话失败: ${aiResult.error}`);
        
        sendSuccess(res, {
          examResultId: existingResult.id,
          aiSessionId: null,
          message: 'AI分析服务暂时不可用，但可以正常参加考试',
          warning: aiResult.error,
        });
      }
    } catch (error: any) {
      console.error('[AI分析] 重试创建会话失败:', error);
      sendError(res, '重试创建AI分析会话失败', 500);
    }
  } catch (error) {
    console.error('重试创建AI分析会话失败:', error);
    sendError(res, '重试创建AI分析会话失败', 500);
  }
};

// 创建AI分析会话
export const createAISession = async (req: Request, res: Response): Promise<void> => {
  const { publicUuid } = req.params;
  const { participant_id, participant_name, started_at } = req.body;
  
  // 参数验证
  if (!participant_id || !participant_name) {
    sendError(res, '学号和姓名不能为空', 400);
    return;
  }

  let exam: any = null;
  
  try {
    // 获取考试信息
    exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
      },
    });

    if (!exam) {
      sendError(res, '考试不存在', 404);
      return;
    }

    if (exam.status !== ExamStatus.PUBLISHED) {
      sendError(res, '考试尚未发布', 403);
      return;
    }

    // 检查考试时间
    const now = new Date();
    if (exam.startTime && now < exam.startTime) {
      sendError(res, '考试尚未开始', 403);
      return;
    }
    if (exam.endTime && now > exam.endTime) {
      sendError(res, '考试已结束', 403);
      return;
    }

    // 检查是否已经提交过考试
    const existingResult = await prisma.examResult.findUnique({
      where: {
        examId_participantId: {
          examId: exam.id,
          participantId: participant_id,
        },
      },
    });

    if (existingResult) {
      // 检查是否真的已经提交（submittedAt不是初始值1970-01-01）
      const initialDate = new Date('1970-01-01').getTime();
      const submittedTime = existingResult.submittedAt.getTime();
      
      if (submittedTime !== initialDate) {
        // 确实已经提交过，拒绝重新开始
        sendError(res, '您已经提交过本次考试，无法重新开始', 409);
        return;
      }
      
      // 未提交的记录，清理旧记录允许重新开始
      console.log(`🔄 清理学生 ${participant_name}(${participant_id}) 的未完成考试记录: ${existingResult.id}`);
      await prisma.examResult.delete({
        where: { id: existingResult.id }
      });
    }

    // 获取客户端IP地址
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    
    // 检查AI服务是否为必需（可通过环境变量配置）
    const isAIRequired = process.env.AI_REQUIRED === 'true';
    
    // 准备考试记录数据
    const examResultData = {
      examId: exam.id,
      participantId: participant_id,
      participantName: participant_name,
      answers: {}, // 初始为空，提交时更新
      score: 0, // 初始为0，提交时更新
      ipAddress,
      startedAt: started_at ? new Date(started_at) : now,
      submittedAt: new Date('1970-01-01'), // 使用特殊时间戳标记未提交状态
    };

    await handleAISessionCreation(req, res, exam, participant_id, participant_name, examResultData, isAIRequired);
      
  } catch (error: any) {
    console.error('创建考试会话失败 (最外层错误):', {
      code: error.code,
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'), // 只记录前3行堆栈
      participantId: participant_id,
      examId: exam?.id,
      timestamp: new Date().toISOString()
    });
    
    // 最外层错误处理 - 处理未被内层捕获的严重错误
    if (error.code?.startsWith('P2')) {
      // Prisma数据库错误
      if (error.code === 'P2002') {
        // 这里不应该再出现P2002错误，因为内层已经处理了
        console.error('⚠️ P2002错误未被内层捕获，可能存在逻辑问题');
        sendError(res, '数据冲突，请稍后重试', 409);
      } else if (error.code === 'P2025') {
        sendError(res, '考试不存在或已被删除', 404);
      } else {
        sendError(res, `数据库操作失败 (${error.code})，请稍后重试`, 500);
      }
    } else if (error.message?.includes('timeout')) {
      // 网络超时错误
      sendError(res, '请求处理超时，请稍后重试', 504);
    } else if (error.name === 'ValidationError') {
      // 数据验证错误
      sendError(res, '数据验证失败，请检查输入参数', 400);
    } else {
      // 其他未知严重错误
      console.error('⚠️ 未预期的系统错误，需要调查:', error);
      sendError(res, '系统暂时不可用，请稍后重试', 500);
    }
  }
};

// AI会话创建处理逻辑
async function handleAISessionCreation(
  _req: Request, 
  res: Response, 
  exam: any, 
  participant_id: string, 
  participant_name: string, 
  examResultData: any, 
  isAIRequired: boolean
): Promise<void> {
  try {
    // 第一步：检查AI服务可用性（快速健康检查）
    console.log(`🔍 为学生 ${participant_name}(${participant_id}) 检查AI服务状态...`);
    const healthCheck = await aiAnalysisService.checkServiceHealth();
    
    let aiResult;
    if (healthCheck.available) {
      // AI服务可用，尝试创建会话
      console.log(`✅ AI服务可用，创建会话...`);
      aiResult = await aiAnalysisService.createSession(
        '', // 临时传空，待examResult创建后更新
        participant_id,
        exam.id
      );
    } else {
      // AI服务不可用，直接返回失败结果
      console.warn(`❌ AI服务不可用: ${healthCheck.error}`);
      aiResult = {
        success: false,
        error: `AI服务不可用: ${healthCheck.error}`
      };
    }

    // 第二步：根据AI服务状态创建考试记录
    let examResult;
    let aiSessionId = null;

    if (aiResult.success) {
      // AI服务正常，创建包含AI会话ID的考试记录
      console.log(`✅ AI会话创建成功: ${aiResult.sessionId}`);
      examResult = await prisma.examResult.create({
        data: {
          ...examResultData,
          aiSessionId: aiResult.sessionId || null, // 保存AI会话ID，确保类型正确
        },
      });
      aiSessionId = aiResult.sessionId || null;
      
      console.log(`✅ 学生 ${participant_name}(${participant_id}) 开始考试 ${exam.title}，完整AI功能已启用`);
      
      sendSuccess(res, {
        examResultId: examResult.id,
        aiSessionId: aiSessionId,
        message: 'AI分析会话创建成功，考试开始',
      }, 201);
      
    } else {
      // AI服务失败，根据配置决定是否允许考试继续
      if (isAIRequired) {
        // AI为必需服务，失败时不允许考试
        console.error(`❌ AI服务为必需功能，但创建失败: ${aiResult.error}`);
        sendError(res, `AI分析服务不可用，无法开始考试: ${aiResult.error}`, 503);
        return;
      } else {
        // AI为可选服务，失败时仍可考试（无AI功能）
        console.warn(`⚠️ AI服务失败但继续考试: ${aiResult.error}`);
        examResult = await prisma.examResult.create({
          data: {
            ...examResultData,
            aiSessionId: null, // AI服务失败，无会话ID
          },
        });
        
        console.log(`⚠️ 学生 ${participant_name}(${participant_id}) 开始考试 ${exam.title}，AI功能不可用`);
        
        sendSuccess(res, {
          examResultId: examResult.id,
          aiSessionId: null,
          message: 'AI分析服务暂时不可用，但可以正常参加考试',
          warning: aiResult.error,
        });
      }
    }
    
  } catch (error: any) {
    console.error('创建考试会话失败 (内层错误):', {
      code: error.code,
      message: error.message,
      meta: error.meta,
      participantId: participant_id,
      examId: exam?.id
    });
    
    // 处理数据库唯一约束错误
    if (error.code === 'P2002') {
      // 检查约束字段，确保是examId_participantId约束
      const constraintFields = error.meta?.target || [];
      console.log('唯一约束冲突详情:', {
        target: constraintFields,
        participantId: participant_id,
        examId: exam?.id
      });
      
      if (constraintFields.includes('examId') && constraintFields.includes('participantId')) {
        // 确实是重复提交约束
        sendError(res, '您已开始过本次考试，请勿重复开始', 409);
      } else {
        // 其他约束冲突
        sendError(res, '数据创建冲突，请稍后重试', 500);
      }
      return;
    }
    throw error;
  }
}