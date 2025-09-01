/**
 * 公开考试验证控制器
 * 负责提交前验证逻辑
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { ExamStatus } from '../../types';
import prisma from '../../utils/database';

// 检查重复提交
export const checkDuplicateSubmission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicUuid } = req.params;
    const { participant_id } = req.body;

    if (!participant_id) {
      sendError(res, '参与者ID不能为空', 400);
      return;
    }

    // 获取考试信息，包含多次提交设置
    const exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: { 
        id: true, 
        status: true, 
        allowMultipleSubmissions: true // 新增字段
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

    // 如果考试允许多次提交，直接允许
    if (exam.allowMultipleSubmissions) {
      sendSuccess(res, { canSubmit: true, message: '考试允许多次提交' });
      return;
    }

    // 🔧 修复重复提交检查逻辑：只检查已完成的提交（submittedAt不是初始值）
    const existingResult = await prisma.examResult.findFirst({
      where: {
        examId: exam.id,
        participantId: participant_id,
      },
    });

    if (existingResult) {
      // 检查是否真的已经提交（submittedAt不是初始值1970-01-01）
      const initialDate = new Date('1970-01-01').getTime();
      const submittedTime = existingResult.submittedAt.getTime();
      
      if (submittedTime !== initialDate) {
        // 确实已经提交过考试，检查是否允许多次提交
        sendError(res, '您已经完成过本次考试，不允许重复提交', 409);
        return;
      }
    }

    // 没有重复提交
    sendSuccess(res, { canSubmit: true });
  } catch (error) {
    console.error('检查重复提交失败:', error);
    sendError(res, '检查重复提交失败', 500);
  }
};