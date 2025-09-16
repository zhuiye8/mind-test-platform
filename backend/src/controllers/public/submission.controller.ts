/**
 * 公开考试提交控制器
 * 负责处理考试答案的提交和评分
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { SubmitExamRequest, ExamStatus } from '../../types';
import prisma from '../../utils/database';
import { aiAnalysisService } from '../../services/aiAnalysis';
import { stopAIConsumerForStream } from '../../services/webrtcStreamService';
import { generateStreamName } from '../../utils/streamName';
import { calculateScore } from './utils';
import { processTimelineData } from '../../services/timelineParserService';

// 提交考试答案
export const submitExamAnswers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicUuid } = req.params;
    const { 
      participant_id, 
      participant_name, 
      answers, 
      started_at,
      submitted_at,
      // AI功能相关数据（已简化）
      timeline_data,
      voice_interactions,
      device_test_results
    }: SubmitExamRequest = req.body;

    // 参数验证
    if (!participant_id || !participant_name || !answers) {
      sendError(res, '学号、姓名和答案不能为空', 400);
      return;
    }

    // 获取考试信息
    const exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: {
        id: true,
        publicUuid: true,
        paperId: true,
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

    // 获取客户端IP地址
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    // 获取题目信息用于校验与计分
    const questions = await prisma.question.findMany({
      where: {
        paperId: exam.paperId,
      },
      orderBy: {
        questionOrder: 'asc',
      },
    });

    // 服务端完整性校验（默认所有题为必答；后续可根据配置扩展例外）
    const missingRequired: string[] = [];
    for (const q of questions) {
      const val = (answers as any)[q.id];
      const isEmpty =
        val === undefined || val === null || (typeof val === 'string' && val.trim() === '') ||
        (Array.isArray(val) && val.length === 0);
      if (isEmpty) missingRequired.push(q.id);
    }
    if (missingRequired.length > 0) {
      sendError(res, `存在未作答的必答题: ${missingRequired.length} 题`, 400);
      return;
    }

    // 标准化答案格式：将数组格式转换为逗号分隔字符串
    const normalizedAnswers: Record<string, string> = {};
    for (const [questionId, answer] of Object.entries(answers)) {
      if (Array.isArray(answer)) {
        normalizedAnswers[questionId] = answer.join(',');
      } else if (answer !== null && answer !== undefined) {
        normalizedAnswers[questionId] = answer.toString();
      }
    }

    // 计算得分（智能计分，支持选项分数）
    const score = calculateScore(normalizedAnswers, questions);

    try {
      const result = await handleExamSubmission(
        exam,
        participant_id,
        participant_name,
        normalizedAnswers,
        score,
        ipAddress,
        started_at,
        submitted_at,
        now,
        timeline_data,
        voice_interactions,
        device_test_results
      );

    // 提交完成后，尽量停止 AI RTSP 消费（容错）
    try {
      const streamName = generateStreamName(publicUuid, participant_id);
      stopAIConsumerForStream(streamName).catch(() => {});
    } catch {}

    // 检查是否有AI服务警告
      const response: any = {
        result_id: result.id,
        score,
        message: '提交成功！感谢您的参与。',
        submitted_at: result.submittedAt,
      };

      // 如果有AI会话但结束失败，添加降级警告
      if ((result as any).aiWarning) {
        response.warning = (result as any).aiWarning;
        response.degraded = true;
      }

      sendSuccess(res, response, 201);
      // 仅记录必要的审计信息，避免敏感数据泄露
      console.log(`✅ 学生 ${participant_name}(${participant_id}) 提交了考试 ${exam.title}`);
    } catch (error: any) {
      // 处理重复提交错误
      if (error.code === 'P2002') {
        sendError(res, '您已提交过本次考试，请勿重复提交。', 409);
        return;
      }
      throw error;
    }
  } catch (error: any) {
    console.error('提交考试答案错误:', error);
    
    // 细化错误处理
    if (error.code?.startsWith('P2')) {
      // Prisma数据库错误
      sendError(res, '数据保存失败，请稍后重试', 400);
    } else if (error.message?.includes('timeout')) {
      // 超时错误
      sendError(res, '服务响应超时，请稍后重试', 504);
    } else if (error.message?.includes('validation')) {
      // 数据验证错误
      sendError(res, '提交的数据格式不正确', 400);
    } else {
      // 其他未知错误
      sendError(res, '提交答案失败', 500);
    }
  }
};

// 处理考试提交逻辑
async function handleExamSubmission(
  exam: any,
  participant_id: string,
  participant_name: string,
  normalizedAnswers: Record<string, string>,
  score: number,
  ipAddress: string,
  started_at: any,
  submitted_at: any,
  now: Date,
  timeline_data: any,
  voice_interactions: any,
  device_test_results: any
): Promise<any> {
  const serverReceivedAt = now;
  const parseClientDate = (value: any): Date | null => {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const clientStartedAt = parseClientDate(started_at);
  const clientSubmittedAt = parseClientDate(submitted_at);
  const normalizedSubmittedAt = clientSubmittedAt ?? serverReceivedAt;
  const placeholderEpochMs = new Date('1970-01-01').getTime();

  // 检查是否已存在考试结果记录（从createAISession创建的临时记录）
  let result = await prisma.examResult.findUnique({
    where: {
      examId_participantId: {
        examId: exam.id,
        participantId: participant_id,
      },
    },
  });

  if (result && result.submittedAt.getTime() === placeholderEpochMs) {
    // 更新已存在的临时记录
    const existingStartedAt = result.startedAt ?? null;
    const existingStartedAtValid =
      existingStartedAt instanceof Date &&
      !Number.isNaN(existingStartedAt.getTime()) &&
      existingStartedAt.getTime() !== placeholderEpochMs;

    const normalizedStartedAt =
      clientStartedAt ??
      (existingStartedAtValid ? existingStartedAt : null) ??
      normalizedSubmittedAt;

    const totalTimeSeconds = Math.max(
      0,
      Math.floor(
        (normalizedSubmittedAt.getTime() - normalizedStartedAt.getTime()) / 1000
      )
    );

    const startedAtUpdate: { startedAt?: Date } = {};
    if (clientStartedAt) {
      startedAtUpdate.startedAt = normalizedStartedAt;
    } else if (!existingStartedAtValid) {
      startedAtUpdate.startedAt = normalizedStartedAt;
    }

    result = await prisma.examResult.update({
      where: { id: result.id },
      data: {
        answers: normalizedAnswers, // 使用标准化后的答案
        score,
        submittedAt: normalizedSubmittedAt,
        totalTimeSeconds,
        ...startedAtUpdate,
      },
    });

    // 处理时间线数据并创建结构化记录
    if (timeline_data && Array.isArray(timeline_data) && timeline_data.length > 0) {
      try {
        const timelineResult = await processTimelineData(result.id, timeline_data);
        console.log(`📊 时间线数据处理完成: ${timelineResult.processedResponses}个答题记录, ${timelineResult.processedEvents}个行为事件`);
      } catch (timelineError) {
        console.error('时间线数据处理失败:', timelineError);
        // 时间线处理失败不应该影响考试提交
      }
    }

    // 更新或创建交互数据（作为原始数据备份）
    if (timeline_data || voice_interactions || device_test_results) {
      await prisma.examInteractionData.upsert({
        where: { examResultId: result.id },
        update: {
          timelineData: timeline_data || undefined,
          voiceInteractions: voice_interactions || undefined,
          deviceTestResults: device_test_results || undefined,
        },
        create: {
          examResultId: result.id,
          timelineData: timeline_data || null,
          voiceInteractions: voice_interactions || null,
          deviceTestResults: device_test_results || null,
        },
      });
    }

    // 如果有AI会话，结束AI检测
    let aiWarning = null;
    if (result.aiSessionId) {
      try {
        const endResult = await aiAnalysisService.endSession(result.id);
        if (endResult.success) {
          console.log(`🔚 AI会话 ${result.aiSessionId} 已结束`);
        } else {
          console.warn(`⚠️ AI会话 ${result.aiSessionId} 结束失败: ${endResult.error}`);
          aiWarning = 'AI分析服务不可用，但答案已成功保存';
        }
      } catch (aiError: any) {
        console.warn(`⚠️ AI服务连接失败: ${aiError?.message || aiError}`);
        aiWarning = 'AI分析服务暂时不可用，但答案已成功保存';
      }
    }
    
    // 添加AI警告到返回结果
    if (aiWarning) {
      (result as any).aiWarning = aiWarning;
    }
  } else {
    // 创建新的考试结果记录（兼容旧的提交方式）
    const normalizedStartedAt = clientStartedAt ?? normalizedSubmittedAt;
    const totalTimeSeconds = Math.max(
      0,
      Math.floor(
        (normalizedSubmittedAt.getTime() - normalizedStartedAt.getTime()) / 1000
      )
    );

    result = await prisma.examResult.create({
      data: {
        examId: exam.id,
        participantId: participant_id,
        participantName: participant_name,
        answers: normalizedAnswers, // 使用标准化后的答案
        score,
        ipAddress,
        startedAt: normalizedStartedAt,
        submittedAt: normalizedSubmittedAt,
        totalTimeSeconds,
      },
    });

    // 处理时间线数据并创建结构化记录
    if (timeline_data && Array.isArray(timeline_data) && timeline_data.length > 0) {
      try {
        const timelineResult = await processTimelineData(result.id, timeline_data);
        console.log(`📊 时间线数据处理完成: ${timelineResult.processedResponses}个答题记录, ${timelineResult.processedEvents}个行为事件`);
      } catch (timelineError) {
        console.error('时间线数据处理失败:', timelineError);
        // 时间线处理失败不应该影响考试提交
      }
    }

    // 创建交互数据（作为原始数据备份）
    if (timeline_data || voice_interactions || device_test_results) {
      await prisma.examInteractionData.create({
        data: {
          examResultId: result.id,
          timelineData: timeline_data || null,
          voiceInteractions: voice_interactions || null,
          deviceTestResults: device_test_results || null,
        },
      });
    }

    // 结束AI检测（重构后：提交时才创建ExamResult，因此此处分支也需要结束会话）
    let aiWarning = null;
    try {
      const endResult = await aiAnalysisService.endSession(result.id);
      if (endResult.success) {
        console.log(`🔚 AI会话(通过新建记录关联) 已结束`);
      } else {
        console.warn(`⚠️ AI会话结束失败: ${endResult.error}`);
        aiWarning = 'AI分析服务不可用，但答案已成功保存';
      }
    } catch (aiError: any) {
      console.warn(`⚠️ AI服务连接失败: ${aiError?.message || aiError}`);
      aiWarning = 'AI分析服务暂时不可用，但答案已成功保存';
    }

    if (aiWarning) {
      (result as any).aiWarning = aiWarning;
    }
  }

  return result;
}
