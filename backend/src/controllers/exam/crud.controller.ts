/**
 * 考试CRUD操作控制器
 * 负责基本的创建、读取、更新、删除操作
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { 
  CreateExamRequest, 
  ExamStatus
} from '../../types';
import prisma from '../../utils/database';
import { ExamStatusValidator } from '../../utils/examStatusValidator';
import { hashPassword } from '../../utils/password';

// 创建考试
export const createExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      paper_id,
      title,
      duration_minutes,
      start_time,
      end_time,
      password,
      shuffle_questions,
      allow_multiple_submissions,
    }: CreateExamRequest = req.body;
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!paper_id || !title || !duration_minutes) {
      sendError(res, '试卷ID、考试标题和时长不能为空', 400);
      return;
    }

    if (duration_minutes <= 0) {
      sendError(res, '考试时长必须大于0', 400);
      return;
    }

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证试卷权限
    const paper = await prisma.paper.findFirst({
      where: {
        id: paper_id,
        teacherId,
      },
      include: {
        questions: {
          orderBy: { questionOrder: 'asc' },
          select: { id: true },
        },
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限操作', 404);
      return;
    }

    if (paper.questions.length === 0) {
      sendError(res, '试卷中没有题目，无法创建考试', 400);
      return;
    }

    // 生成题目ID快照
    const questionIds = paper.questions.map(q => q.id);

    // 处理密码哈希
    const hashedPassword = password ? await hashPassword(password) : null;

    // 创建考试
    const exam = await prisma.exam.create({
      data: {
        paperId: paper_id,
        teacherId,
        title,
        durationMinutes: duration_minutes,
        questionIdsSnapshot: questionIds,
        startTime: start_time ? new Date(start_time) : null,
        endTime: end_time ? new Date(end_time) : null,
        password: hashedPassword,
        shuffleQuestions: shuffle_questions || false,
        allowMultipleSubmissions: allow_multiple_submissions || false,
        status: ExamStatus.DRAFT, // 创建后为草稿状态，需手动发布
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
      },
    });

    sendSuccess(res, {
      id: exam.id,
      public_uuid: exam.publicUuid,
      title: exam.title,
      paper_title: exam.paper.title,
      duration_minutes: exam.durationMinutes,
      question_count: questionIds.length,
      start_time: exam.startTime,
      end_time: exam.endTime,
      has_password: !!exam.password,
      shuffle_questions: exam.shuffleQuestions,
      allow_multiple_submissions: exam.allowMultipleSubmissions,
      status: exam.status,
      public_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/exam/${exam.publicUuid}`,
      created_at: exam.createdAt,
      updated_at: exam.updatedAt,
    }, 201);

    console.log(`✅ 考试已创建: ${exam.title} (${exam.publicUuid})`);
  } catch (error) {
    console.error('创建考试错误:', error);
    sendError(res, '创建考试失败', 500);
  }
};

// 获取考试详情
export const getExamById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        teacherId,
      },
      include: {
        paper: {
          select: {
            title: true,
            description: true,
          },
        },
        _count: {
          select: {
            results: true,
          },
        },
      },
    });

    if (!exam) {
      sendError(res, '考试不存在或无权限访问', 404);
      return;
    }

    // 安全处理questionIdsSnapshot，避免空值错误
    const questionIds = (exam.questionIdsSnapshot as string[]) || [];
    console.log(`获取考试详情: ${examId}, 题目数: ${questionIds.length}`);

    // 获取完成结果统计
    const completedResults = await prisma.examResult.count({
      where: {
        examId: exam.id,
      },
    });

    const examDetail = {
      id: exam.id,
      public_uuid: exam.publicUuid,
      title: exam.title,
      description: exam.paper.description || '',
      paper_title: exam.paper.title,
      paper_id: exam.paperId,
      duration_minutes: exam.durationMinutes,
      question_count: questionIds.length,
      participant_count: exam._count.results,
      completion_count: completedResults,
      start_time: exam.startTime,
      end_time: exam.endTime,
      has_password: !!exam.password,
      password: exam.password,
      max_attempts: 1,
      show_results: true,
      shuffle_questions: exam.shuffleQuestions,
      allow_multiple_submissions: exam.allowMultipleSubmissions,
      status: exam.status,
      public_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/exam/${exam.publicUuid}`,
      created_at: exam.createdAt,
      updated_at: exam.updatedAt,
      teacher_id: teacherId,
      teacher: {
        id: teacherId,
        name: exam.paper.title,
        teacher_id: teacherId,
      },
    };

    sendSuccess(res, examDetail);
  } catch (error: any) {
    // 详细错误日志
    console.error('获取考试详情错误 - 详细信息:', {
      examId: req.params.examId,
      teacherId: req.teacher?.id,
      errorMessage: error.message,
      errorStack: error.stack
    });
    
    sendError(res, `获取考试详情失败: ${error.message || '未知错误'}`, 500);
  }
};

// 更新考试
export const updateExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const {
      title,
      duration_minutes,
      start_time,
      end_time,
      password,
      shuffle_questions,
      allow_multiple_submissions,
    } = req.body;
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

    // 更新考试
    // 如有提供新密码，则进行哈希存储；传入空字符串代表清除密码
    let newPasswordValue = existingExam.password;
    if (password !== undefined) {
      if (password) {
        newPasswordValue = await hashPassword(password);
      } else {
        newPasswordValue = null;
      }
    }

    const updatedExam = await prisma.exam.update({
      where: { id: examId },
      data: {
        title: title ?? existingExam.title,
        durationMinutes: duration_minutes ?? existingExam.durationMinutes,
        startTime: start_time ? new Date(start_time) : (start_time === null ? null : existingExam.startTime),
        endTime: end_time ? new Date(end_time) : (end_time === null ? null : existingExam.endTime),
        password: newPasswordValue,
        shuffleQuestions: shuffle_questions ?? existingExam.shuffleQuestions,
        allowMultipleSubmissions: allow_multiple_submissions ?? existingExam.allowMultipleSubmissions,
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
      },
    });

    const questionIds = updatedExam.questionIdsSnapshot as string[];

    sendSuccess(res, {
      id: updatedExam.id,
      public_uuid: updatedExam.publicUuid,
      title: updatedExam.title,
      paper_title: updatedExam.paper.title,
      duration_minutes: updatedExam.durationMinutes,
      question_count: questionIds.length,
      start_time: updatedExam.startTime,
      end_time: updatedExam.endTime,
      has_password: !!updatedExam.password,
      shuffle_questions: updatedExam.shuffleQuestions,
      allow_multiple_submissions: updatedExam.allowMultipleSubmissions,
      status: updatedExam.status,
      public_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/exam/${updatedExam.publicUuid}`,
      created_at: updatedExam.createdAt,
      updated_at: updatedExam.updatedAt,
    });

    console.log(`✅ 考试已更新: ${updatedExam.title}`);
  } catch (error) {
    console.error('更新考试错误:', error);
    sendError(res, '更新考试失败', 500);
  }
};

// 删除考试
export const deleteExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证考试权限并获取详细信息
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

    const currentStatus = existingExam.status as ExamStatus;
    const submissionCount = existingExam._count.results;

    // 验证是否可以删除
    try {
      ExamStatusValidator.validateAction(currentStatus, 'delete', submissionCount);
    } catch (error: any) {
      sendError(res, error.message, 400);
      return;
    }

    // 判断删除类型
    const isHardDelete = currentStatus === ExamStatus.ARCHIVED;
    const deleteMessage = isHardDelete ? '永久删除' : '删除';

    // 如果是草稿或归档状态，直接删除
    if (ExamStatusValidator.canDelete(currentStatus, submissionCount)) {
      // 在事务中删除考试和相关数据
      await prisma.$transaction(async (tx) => {
        // 如果有提交结果，先删除相关数据（按外键依赖顺序）
        if (submissionCount > 0) {
          // 1. 先删除QuestionActionEvent（作答事件）
          await tx.questionActionEvent.deleteMany({
            where: {
              examResult: {
                examId
              }
            }
          });
          
          // 2. 删除QuestionResponse（题目答案）
          await tx.questionResponse.deleteMany({
            where: {
              examResult: {
                examId
              }
            }
          });
          
          // 3. 删除ExamInteractionData（交互数据）
          await tx.examInteractionData.deleteMany({
            where: {
              examResult: {
                examId
              }
            }
          });
          
          // 4. 删除AiSession（AI会话）
          await tx.aiSession.deleteMany({
            where: {
              examId
            }
          });
          
          // 5. 最后删除ExamResult
          await tx.examResult.deleteMany({
            where: { examId }
          });
          
          console.log(`🗑️ 已删除 ${submissionCount} 条提交记录及相关数据`);
        }

        // 删除考试
        await tx.exam.delete({
          where: { id: examId },
        });
      });
    } else {
      sendError(res, `无法${deleteMessage}，该考试已有 ${submissionCount} 个提交结果`, 400);
      return;
    }

    sendSuccess(res, {
      message: `考试${deleteMessage}成功`,
      deleted_exam: {
        id: existingExam.id,
        title: existingExam.title,
        paper_title: existingExam.paper.title,
        status: currentStatus,
        submission_count: submissionCount,
        delete_type: isHardDelete ? 'permanent' : 'normal',
      },
    });

    console.log(`✅ 考试已${deleteMessage}: ${existingExam.title} (${examId}) 状态: ${currentStatus} 提交数: ${submissionCount}`);
  } catch (error) {
    console.error('删除考试错误:', error);
    sendError(res, '删除考试失败', 500);
  }
};
