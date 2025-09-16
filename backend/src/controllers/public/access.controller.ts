/**
 * 公开考试访问控制器
 * 负责考试信息获取和密码验证
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { VerifyExamPasswordRequest, ExamStatus } from '../../types';
import prisma from '../../utils/database';
import { shuffleArray } from './utils';
import { comparePassword } from '../../utils/password';

// 获取公开考试信息
export const getPublicExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicUuid } = req.params;

    // 缓存已移除，直接查询数据库
    const exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        password: true,
        startTime: true,
        endTime: true,
        shuffleQuestions: true,
        allowMultipleSubmissions: true,
        status: true,
        questionIdsSnapshot: true,
        paper: {
          select: {
            description: true,
          },
        },
      },
    });

    if (!exam) {
      sendError(res, '考试不存在或已过期', 404);
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

    // 检查是否需要密码（仅返回基本信息，不包含题目）
    if (exam.password) {
      sendSuccess(res, {
        id: exam.id,
        title: exam.title,
        description: exam.paper.description,
        duration_minutes: exam.durationMinutes,
        shuffle_questions: exam.shuffleQuestions,
        allow_multiple_submissions: exam.allowMultipleSubmissions,
        password_required: true,
      });
      return;
    }

    // 获取题目详情
    const questionIds = exam.questionIdsSnapshot as string[];
    const questions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
      },
    });

    // 按快照中的顺序排序题目
    const orderedQuestions = questionIds.map(id => 
      questions.find(q => q.id === id)
    ).filter(Boolean);

    // 格式化题目数据
    let formattedQuestions = orderedQuestions.map(question => ({
      id: question!.id,
      question_order: question!.questionOrder,
      title: question!.title,
      options: question!.options,
      question_type: question!.questionType,
      display_condition: question!.displayCondition,
    }));

    // 如果需要打乱题目顺序
    if (exam.shuffleQuestions) {
      formattedQuestions = shuffleArray(formattedQuestions);
    }

    sendSuccess(res, {
      id: exam.id,
      title: exam.title,
      description: exam.paper.description,
      duration_minutes: exam.durationMinutes,
      shuffle_questions: exam.shuffleQuestions,
      allow_multiple_submissions: exam.allowMultipleSubmissions,
      password_required: false,
      questions: formattedQuestions,
    });
  } catch (error) {
    console.error('获取公开考试信息错误:', error);
    sendError(res, '获取考试信息失败', 500);
  }
};

// 验证考试密码
export const verifyExamPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicUuid } = req.params;
    const { password }: VerifyExamPasswordRequest = req.body;

    const exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        password: true,
        startTime: true,
        endTime: true,
        shuffleQuestions: true,
        allowMultipleSubmissions: true,
        status: true,
        questionIdsSnapshot: true,
        paper: {
          select: {
            description: true,
          },
        },
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

    if (!exam.password) {
      sendError(res, '此考试无需密码', 400);
      return;
    }

    // 仅支持哈希密码（开发环境可重置数据，无需兼容明文）
    const passwordMatch = await comparePassword(password, exam.password);
    if (!passwordMatch) {
      sendError(res, '密码错误', 401);
      return;
    }

    // 密码验证成功，返回完整考试信息和题目
    const questionIds = exam.questionIdsSnapshot as string[];
    const questions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
      },
    });

    // 按快照中的顺序排序题目
    const orderedQuestions = questionIds.map(id => 
      questions.find(q => q.id === id)
    ).filter(Boolean);

    // 格式化题目数据
    let formattedQuestions = orderedQuestions.map(question => ({
      id: question!.id,
      question_order: question!.questionOrder,
      title: question!.title,
      options: question!.options,
      question_type: question!.questionType,
      display_condition: question!.displayCondition,
    }));

    // 如果需要打乱题目顺序
    if (exam.shuffleQuestions) {
      formattedQuestions = shuffleArray(formattedQuestions);
    }

    sendSuccess(res, {
      id: exam.id,
      title: exam.title,
      description: exam.paper.description,
      duration_minutes: exam.durationMinutes,
      shuffle_questions: exam.shuffleQuestions,
      allow_multiple_submissions: exam.allowMultipleSubmissions,
      password_required: false,
      questions: formattedQuestions,
    });
  } catch (error) {
    console.error('验证考试密码错误:', error);
    sendError(res, '验证密码失败', 500);
  }
};
