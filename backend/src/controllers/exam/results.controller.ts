/**
 * 考试结果管理控制器
 * 负责考试结果的查询、导出和详情展示
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { 
  GetExamSubmissionsRequest,
  ExamSubmissionResult,
  ExamSubmissionStats
} from '../../types';
import prisma from '../../utils/database';
import { SmartPagination, OffsetPagination, PaginationOptions } from '../../utils/pagination';

// 获取考试结果（支持分页）
export const getExamResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 解析分页参数
    const paginationOptions: PaginationOptions = {
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
      cursor: req.query.cursor as string,
      sortField: (req.query.sortField as string) || 'submittedAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    // 验证考试权限
    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        teacherId,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!exam) {
      sendError(res, '考试不存在或无权限访问', 404);
      return;
    }

    // 获取总数量
    const totalCount = await prisma.examResult.count({
      where: { examId },
    });

    // 构建智能分页查询
    const { strategy, params } = SmartPagination.buildQuery(paginationOptions, totalCount);

    let results: any[];
    let paginationResult: any;

    if (strategy === 'cursor') {
      // 游标分页
      console.log(`📄 使用游标分页查询考试结果，考试: ${examId}`);
      results = await prisma.examResult.findMany({
        where: { examId, ...params },
        take: paginationOptions.limit! + 1,
        orderBy: { [paginationOptions.sortField!]: paginationOptions.sortOrder },
      });

      const hasNext = results.length > paginationOptions.limit!;
      const actualData = hasNext ? results.slice(0, -1) : results;

      paginationResult = {
        pagination: {
          strategy: 'cursor',
          limit: paginationOptions.limit,
          hasNext,
          hasPrev: !!paginationOptions.cursor,
          nextCursor: hasNext && actualData.length > 0 
            ? Buffer.from(JSON.stringify({
                id: actualData[actualData.length - 1].id,
                sortValue: actualData[actualData.length - 1][paginationOptions.sortField!]
              })).toString('base64')
            : undefined,
        },
      };
      results = actualData;
    } else {
      // 偏移分页
      console.log(`📄 使用偏移分页查询考试结果，考试: ${examId}, page ${paginationOptions.page}`);
      const offset = OffsetPagination.calculateOffset(paginationOptions.page!, paginationOptions.limit!);
      
      results = await prisma.examResult.findMany({
        where: { examId },
        skip: offset,
        take: paginationOptions.limit!,
        orderBy: { [paginationOptions.sortField!]: paginationOptions.sortOrder },
      });

      paginationResult = OffsetPagination.buildResult(
        results,
        totalCount,
        paginationOptions.page!,
        paginationOptions.limit!
      );
    }

    const formattedResults = results.map(result => ({
      id: result.id,
      participant_id: result.participantId,
      participant_name: result.participantName,
      answers: result.answers,
      score: result.score,
      ip_address: result.ipAddress,
      started_at: result.startedAt,
      submitted_at: result.submittedAt,
    }));

    // 构建最终响应结果
    const resultsData = {
      exam_info: {
        id: exam.id,
        title: exam.title,
      },
      data: formattedResults,
      ...paginationResult,
      meta: {
        totalCount: strategy === 'offset' ? totalCount : undefined,
        strategy,
        currentPage: paginationOptions.page,
      },
    };

    sendSuccess(res, resultsData);
  } catch (error) {
    console.error('获取考试结果错误:', error);
    sendError(res, '获取考试结果失败', 500);
  }
};

// 获取单个考试结果详情
export const getExamResultDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId, resultId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证考试权限并获取考试和结果信息
    const exam = await prisma.exam.findFirst({
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
        results: {
          where: {
            id: resultId,
          },
        },
      },
    });

    if (!exam) {
      sendError(res, '考试不存在或无权访问', 404);
      return;
    }

    if (exam.results.length === 0) {
      sendError(res, '考试结果不存在', 404);
      return;
    }

    const result = exam.results[0];

    // 获取题目信息
    const questionIds = exam.questionIdsSnapshot as string[];
    const questions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
      },
      orderBy: {
        questionOrder: 'asc',
      },
    });

    // 构建详细答案信息
    const answers = result.answers as Record<string, string>;
    const detailedAnswers = questions.map(question => {
      const studentAnswer = answers[question.id] || '';
      let answerDisplay = studentAnswer;
      
      // 如果是选择题，显示选项内容
      if (studentAnswer && question.options && typeof question.options === 'object') {
        const optionContent = (question.options as Record<string, string>)[studentAnswer];
        if (optionContent) {
          answerDisplay = `${studentAnswer}: ${optionContent}`;
        }
      }

      return {
        question_id: question.id,
        question_order: question.questionOrder,
        question_title: question.title,
        question_type: question.questionType,
        question_options: question.options,
        student_answer: studentAnswer,
        answer_display: answerDisplay,
        display_condition: question.displayCondition,
      };
    });

    // 计算答题用时
    const startTime = new Date(result.startedAt || result.submittedAt);
    const endTime = new Date(result.submittedAt);
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    sendSuccess(res, {
      exam_info: {
        id: exam.id,
        title: exam.title,
        paper_title: exam.paper.title,
        duration_minutes: exam.durationMinutes,
      },
      result_info: {
        id: result.id,
        participant_id: result.participantId,
        participant_name: result.participantName,
        score: result.score,
        ip_address: result.ipAddress,
        started_at: result.startedAt,
        submitted_at: result.submittedAt,
        duration_minutes: durationMinutes,
      },
      answers: detailedAnswers,
      total_questions: questions.length,
      answered_questions: detailedAnswers.filter(a => a.student_answer).length,
    });

    console.log(`✅ 获取考试结果详情: ${result.participantName} (${result.participantId})`);
  } catch (error) {
    console.error('获取考试结果详情错误:', error);
    sendError(res, '获取结果详情失败', 500);
  }
};

// 获取考试提交学生列表 - 删除前预览功能
export const getExamSubmissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 解析查询参数
    const {
      page = 1,
      limit = 10,
      search,
      sort_field = 'submitted_at',
      sort_order = 'desc'
    }: GetExamSubmissionsRequest & { [key: string]: any } = req.query;

    // API字段名到Prisma模型字段名的映射
    const mapApiFieldToPrismaField = (apiField: string): string => {
      const fieldMap: Record<string, string> = {
        'submitted_at': 'submittedAt',
        'participant_id': 'participantId', 
        'participant_name': 'participantName',
        'ip_address': 'ipAddress',
        'started_at': 'startedAt'
      };
      return fieldMap[apiField] || apiField;
    };

    const paginationOptions: PaginationOptions = {
      page: parseInt(String(page)),
      limit: Math.min(parseInt(String(limit)), 200),
      sortField: mapApiFieldToPrismaField(sort_field as string),
      sortOrder: sort_order as 'asc' | 'desc',
    };

    // 验证考试权限
    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        teacherId,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!exam) {
      sendError(res, '考试不存在或无权限访问', 404);
      return;
    }

    // 构建查询条件
    const whereClause: any = {
      examId,
    };

    // 添加搜索条件（按学号或姓名搜索）
    if (search) {
      whereClause.OR = [
        { participantId: { contains: search as string } },
        { participantName: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // 获取总数量和统计信息
    const [totalCount, submissions] = await Promise.all([
      prisma.examResult.count({ where: whereClause }),
      prisma.examResult.findMany({
        where: whereClause,
        skip: OffsetPagination.calculateOffset(paginationOptions.page!, paginationOptions.limit!),
        take: paginationOptions.limit!,
        orderBy: { [paginationOptions.sortField!]: paginationOptions.sortOrder },
        select: {
          id: true,
          participantId: true,
          participantName: true,
          answers: true,
          score: true,
          ipAddress: true,
          startedAt: true,
          submittedAt: true,
        },
      }),
    ]);

    // 计算统计信息
    const allSubmissions = await prisma.examResult.findMany({
      where: { examId },
      select: {
        answers: true,
        ipAddress: true,
        submittedAt: true,
      },
    });

    // 计算最新提交时间
    const latestSubmission = allSubmissions.length > 0 
      ? allSubmissions.sort((a, b) => 
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
        )[0].submittedAt.toISOString()
      : undefined;

    const stats: ExamSubmissionStats = {
      total_submissions: allSubmissions.length,
      completed_submissions: allSubmissions.filter(s => 
        s.answers && Object.keys(s.answers as object).length > 0
      ).length,
      unique_participants: allSubmissions.length,
      unique_ips: new Set(allSubmissions.map(s => s.ipAddress).filter(Boolean)).size,
      ...(latestSubmission && { latest_submission: latestSubmission }),
    };

    // 格式化提交结果
    const formattedSubmissions: ExamSubmissionResult[] = submissions.map(submission => ({
      id: submission.id,
      participant_id: submission.participantId,
      participant_name: submission.participantName,
      answers: submission.answers as any,
      score: submission.score,
      ip_address: submission.ipAddress,
      started_at: submission.startedAt?.toISOString() || null,
      submitted_at: submission.submittedAt.toISOString(),
    }));

    const paginationResult = OffsetPagination.buildResult(
      formattedSubmissions,
      totalCount,
      paginationOptions.page!,
      paginationOptions.limit!
    );

    const result = {
      exam_info: {
        id: exam.id,
        title: exam.title,
        status: exam.status,
      },
      statistics: stats,
      data: formattedSubmissions,
      ...paginationResult,
      meta: {
        totalCount,
        searchQuery: search || null,
        sortField: paginationOptions.sortField,
        sortOrder: paginationOptions.sortOrder,
      },
    };

    sendSuccess(res, result);

    console.log(`✅ 获取考试提交列表: ${formattedSubmissions.length} 条提交记录`);
  } catch (error) {
    console.error('获取考试提交列表错误:', error);
    sendError(res, '获取考试提交列表失败', 500);
  }
};