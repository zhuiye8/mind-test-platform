/**
 * 考试生命周期管理控制器
 * 负责考试状态转换、发布、结束、归档、恢复操作
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { ExamStatus, ExamStatusTransitionRequest } from '../../types';
import prisma from '../../utils/database';
import { getPrimaryFrontendOrigin } from '../../utils/env';
import { ExamStatusValidator } from '../../utils/examStatusValidator';

const examDetailInclude = {
  paper: {
    select: {
      title: true,
    },
  },
  _count: {
    select: {
      results: true,
    },
  },
};

const buildExamResponse = (exam: any) => {
  const snapshot = exam.questionIdsSnapshot;
  const questionIds = Array.isArray(snapshot) ? (snapshot as string[]) : [];

  return {
    id: exam.id,
    public_uuid: exam.publicUuid,
    title: exam.title,
    paper_title: exam.paper?.title,
    duration_minutes: exam.durationMinutes,
    question_count: questionIds.length,
    participant_count: exam._count?.results ?? 0,
    start_time: exam.startTime,
    end_time: exam.endTime,
    has_password: !!exam.password,
    shuffle_questions: exam.shuffleQuestions,
    allow_multiple_submissions: exam.allowMultipleSubmissions,
    status: exam.status,
    public_url: `${getPrimaryFrontendOrigin()}/exam/${exam.publicUuid}`,
    created_at: exam.createdAt,
    updated_at: exam.updatedAt,
    available_actions: ExamStatusValidator.getAvailableActions(
      exam.status as ExamStatus,
      exam._count?.results ?? 0
    ),
  };
};

// 切换考试发布状态
export const toggleExamPublish = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证考试权限
    const existingExam = await prisma.exam.findFirst({
      where: {
        id: examId,
        teacherId,
      },
    });

    if (!existingExam) {
      sendError(res, '考试不存在或无权限操作', 404);
      return;
    }

    // 切换状态
    const newStatus = existingExam.status === ExamStatus.PUBLISHED ? ExamStatus.DRAFT : ExamStatus.PUBLISHED;

    const updatedExam = await prisma.exam.update({
      where: { id: examId },
      data: {
        status: newStatus,
      },
    });

    sendSuccess(res, {
      id: updatedExam.id,
      status: updatedExam.status,
      message: newStatus === ExamStatus.PUBLISHED ? '考试已发布' : '考试已取消发布',
    });

    console.log(`✅ 考试状态已更新: ${existingExam.title} -> ${newStatus}`);
  } catch (error) {
    console.error('切换考试状态错误:', error);
    sendError(res, '切换考试状态失败', 500);
  }
};

/**
 * 结束考试 - 将进行中的考试正常结束 (PUBLISHED → SUCCESS)
 */
export const finishExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证考试存在且属于当前教师
    const existingExam = await prisma.exam.findFirst({
      where: {
        id: examId,
        teacherId,
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
        _count: {
          select: {
            results: true,
          },
        },
      },
    });

    if (!existingExam) {
      sendError(res, '考试不存在或无权限操作', 404);
      return;
    }

    // 验证状态转换有效性
    try {
      ExamStatusValidator.validateTransition(
        existingExam.status as ExamStatus,
        ExamStatus.SUCCESS
      );
    } catch (error: any) {
      sendError(res, error.message, 400);
      return;
    }

    // 更新考试状态为已结束
    const updatedExam = await prisma.exam.update({
      where: { id: examId },
      data: {
        status: ExamStatus.SUCCESS,
        updatedAt: new Date(),
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
        _count: {
          select: {
            results: true,
          },
        },
      },
    });

    const questionIds = updatedExam.questionIdsSnapshot as string[];

    // 构建响应数据（遵循现有格式）
    const responseData = {
      id: updatedExam.id,
      public_uuid: updatedExam.publicUuid,
      title: updatedExam.title,
      paper_title: updatedExam.paper.title,
      duration_minutes: updatedExam.durationMinutes,
      question_count: questionIds.length,
      participant_count: updatedExam._count.results,
      start_time: updatedExam.startTime,
      end_time: updatedExam.endTime,
      has_password: !!updatedExam.password,
      shuffle_questions: updatedExam.shuffleQuestions,
      allow_multiple_submissions: updatedExam.allowMultipleSubmissions,
      status: updatedExam.status,
      public_url: `${getPrimaryFrontendOrigin()}/exam/${updatedExam.publicUuid}`,
      created_at: updatedExam.createdAt,
      updated_at: updatedExam.updatedAt,
      // 生命周期管理相关字段
      available_actions: ExamStatusValidator.getAvailableActions(
        updatedExam.status as ExamStatus,
        updatedExam._count.results
      ),
    };

    sendSuccess(res, responseData);

    console.log(`✅ 考试已结束: ${updatedExam.title} (${examId}) 参与人数: ${updatedExam._count.results}`);
  } catch (error) {
    console.error('结束考试错误:', error);
    sendError(res, '结束考试失败', 500);
  }
};

/**
 * 归档考试 - 将已结束的考试归档到回收站 (SUCCESS → ARCHIVED)
 */
export const archiveExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证考试存在且属于当前教师
    const existingExam = await prisma.exam.findFirst({
      where: {
        id: examId,
        teacherId,
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
        _count: {
          select: {
            results: true,
          },
        },
      },
    });

    if (!existingExam) {
      sendError(res, '考试不存在或无权限操作', 404);
      return;
    }

    // 验证状态转换有效性
    try {
      ExamStatusValidator.validateTransition(
        existingExam.status as ExamStatus,
        ExamStatus.ARCHIVED
      );
    } catch (error: any) {
      sendError(res, error.message, 400);
      return;
    }

    // 更新考试状态为已归档
    const updatedExam = await prisma.exam.update({
      where: { id: examId },
      data: {
        status: ExamStatus.ARCHIVED,
        updatedAt: new Date(),
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
        _count: {
          select: {
            results: true,
          },
        },
      },
    });

    const questionIds = updatedExam.questionIdsSnapshot as string[];

    const responseData = {
      id: updatedExam.id,
      public_uuid: updatedExam.publicUuid,
      title: updatedExam.title,
      paper_title: updatedExam.paper.title,
      duration_minutes: updatedExam.durationMinutes,
      question_count: questionIds.length,
      participant_count: updatedExam._count.results,
      start_time: updatedExam.startTime,
      end_time: updatedExam.endTime,
      has_password: !!updatedExam.password,
      shuffle_questions: updatedExam.shuffleQuestions,
      allow_multiple_submissions: updatedExam.allowMultipleSubmissions,
      status: updatedExam.status,
      public_url: `${getPrimaryFrontendOrigin()}/exam/${updatedExam.publicUuid}`,
      created_at: updatedExam.createdAt,
      updated_at: updatedExam.updatedAt,
      archived_at: updatedExam.updatedAt, // 归档时间
      available_actions: ExamStatusValidator.getAvailableActions(
        updatedExam.status as ExamStatus,
        updatedExam._count.results
      ),
    };

    sendSuccess(res, responseData);

    console.log(`✅ 考试已归档: ${updatedExam.title} (${examId}) 移至回收站`);
  } catch (error) {
    console.error('归档考试错误:', error);
    sendError(res, '归档考试失败', 500);
  }
};

/**
 * 恢复考试 - 从回收站恢复考试 (ARCHIVED → SUCCESS)
 */
export const restoreExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证考试存在且属于当前教师
    const existingExam = await prisma.exam.findFirst({
      where: {
        id: examId,
        teacherId,
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
        _count: {
          select: {
            results: true,
          },
        },
      },
    });

    if (!existingExam) {
      sendError(res, '考试不存在或无权限操作', 404);
      return;
    }

    // 验证状态转换有效性
    try {
      ExamStatusValidator.validateTransition(
        existingExam.status as ExamStatus,
        ExamStatus.SUCCESS
      );
    } catch (error: any) {
      sendError(res, error.message, 400);
      return;
    }

    // 更新考试状态为已结束
    const updatedExam = await prisma.exam.update({
      where: { id: examId },
      data: {
        status: ExamStatus.SUCCESS,
        updatedAt: new Date(),
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
        _count: {
          select: {
            results: true,
          },
        },
      },
    });

    const questionIds = updatedExam.questionIdsSnapshot as string[];

    const responseData = {
      id: updatedExam.id,
      public_uuid: updatedExam.publicUuid,
      title: updatedExam.title,
      paper_title: updatedExam.paper.title,
      duration_minutes: updatedExam.durationMinutes,
      question_count: questionIds.length,
      participant_count: updatedExam._count.results,
      start_time: updatedExam.startTime,
      end_time: updatedExam.endTime,
      has_password: !!updatedExam.password,
      shuffle_questions: updatedExam.shuffleQuestions,
      allow_multiple_submissions: updatedExam.allowMultipleSubmissions,
      status: updatedExam.status,
      public_url: `${getPrimaryFrontendOrigin()}/exam/${updatedExam.publicUuid}`,
      created_at: updatedExam.createdAt,
      updated_at: updatedExam.updatedAt,
      restored_at: updatedExam.updatedAt, // 恢复时间
      available_actions: ExamStatusValidator.getAvailableActions(
        updatedExam.status as ExamStatus,
        updatedExam._count.results
      ),
    };

    sendSuccess(res, responseData);

    console.log(`✅ 考试已恢复: ${updatedExam.title} (${examId}) 从回收站恢复`);
  } catch (error) {
    console.error('恢复考试错误:', error);
    sendError(res, '恢复考试失败', 500);
  }
};

/**
 * 通用状态更新接口 - 支持EXPIRED/DRAFT等状态转换
 */
export const updateExamStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;
    const { to_status, from_status, reason }: Partial<ExamStatusTransitionRequest> = req.body || {};

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    if (!to_status || !Object.values(ExamStatus).includes(to_status as ExamStatus)) {
      sendError(res, '无效的目标状态', 400);
      return;
    }

    const targetStatus = to_status as ExamStatus;

    const existingExam = await prisma.exam.findFirst({
      where: {
        id: examId,
        teacherId,
      },
      include: examDetailInclude,
    });

    if (!existingExam) {
      sendError(res, '考试不存在或无权限操作', 404);
      return;
    }

    const currentStatus = existingExam.status as ExamStatus;

    if (currentStatus === targetStatus) {
      sendError(res, '考试已处于该状态', 400);
      return;
    }

    if (from_status && from_status !== currentStatus) {
      sendError(res, '考试状态已更新，请刷新后重试', 409);
      return;
    }

    try {
      ExamStatusValidator.validateTransition(currentStatus, targetStatus);
    } catch (error: any) {
      sendError(res, error.message, 400);
      return;
    }

    const updatedExam = await prisma.exam.update({
      where: { id: examId },
      data: {
        status: targetStatus,
        updatedAt: new Date(),
      },
      include: examDetailInclude,
    });

    const responseData: any = {
      ...buildExamResponse(updatedExam),
      lifecycle: {
        from: currentStatus,
        to: targetStatus,
        reason: reason || null,
        timestamp: updatedExam.updatedAt,
      },
    };

    if (targetStatus === ExamStatus.ARCHIVED) {
      responseData.archived_at = updatedExam.updatedAt;
    }

    if (targetStatus === ExamStatus.SUCCESS && currentStatus === ExamStatus.ARCHIVED) {
      responseData.restored_at = updatedExam.updatedAt;
    }

    if (targetStatus === ExamStatus.EXPIRED) {
      responseData.expired_at = updatedExam.updatedAt;
    }

    sendSuccess(res, responseData);

    console.log(`✅ 考试状态更新: ${existingExam.title} (${examId}) ${currentStatus} → ${targetStatus}`);
  } catch (error) {
    console.error('更新考试状态错误:', error);
    sendError(res, '更新考试状态失败', 500);
  }
};
