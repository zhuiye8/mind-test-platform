/**
 * 考试查询控制器
 * 负责复杂查询、分页、筛选和搜索
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { ExamStatus } from '../../types';
import prisma from '../../utils/database';
import { getPrimaryFrontendOrigin } from '../../utils/env';
import { SmartPagination, OffsetPagination, PaginationOptions } from '../../utils/pagination';
import { ExamStatusValidator, getStatusColor } from '../../utils/examStatusValidator';

// 获取教师的所有考试（支持分页）
export const getTeacherExams = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 解析分页参数
    const paginationOptions: PaginationOptions = {
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
      cursor: req.query.cursor as string,
      sortField: (req.query.sortField as string) || 'updatedAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    // 解析状态筛选和搜索参数
    const status = req.query.status as string;
    const includeArchived = req.query.include_archived === 'true';
    const search = req.query.search as string;

    // 构建查询条件
    const whereClause: any = {
      teacherId,
    };

    // 状态筛选
    if (status && status !== 'all') {
      whereClause.status = status;
    } else if (!includeArchived) {
      whereClause.status = {
        not: ExamStatus.ARCHIVED,
      };
    }

    // 搜索条件
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { paper: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // 预估总数量用于智能分页策略选择
    const totalCount = await prisma.exam.count({
      where: whereClause,
    });

    // 构建智能分页查询
    const { strategy, params } = SmartPagination.buildQuery(paginationOptions, totalCount);

    let exams: any[];
    let paginationResult: any;

    if (strategy === 'cursor') {
      // 游标分页
      console.log(`📄 使用游标分页查询考试列表，教师: ${teacherId}`);
      exams = await prisma.exam.findMany({
        where: { ...whereClause, ...params },
        take: paginationOptions.limit! + 1,
        orderBy: { [paginationOptions.sortField!]: paginationOptions.sortOrder },
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

      // 判断是否有下一页
      const hasNext = exams.length > paginationOptions.limit!;
      const actualData = hasNext ? exams.slice(0, -1) : exams;

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
      exams = actualData;
    } else {
      // 偏移分页
      console.log(`📄 使用偏移分页查询考试列表，教师: ${teacherId}, page ${paginationOptions.page}`);
      const offset = OffsetPagination.calculateOffset(paginationOptions.page!, paginationOptions.limit!);
      
      exams = await prisma.exam.findMany({
        where: whereClause,
        skip: offset,
        take: paginationOptions.limit!,
        orderBy: { [paginationOptions.sortField!]: paginationOptions.sortOrder },
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

      paginationResult = OffsetPagination.buildResult(
        exams,
        totalCount,
        paginationOptions.page!,
        paginationOptions.limit!
      );
    }

    // 获取状态统计
    const getStatusCounts = async (): Promise<Record<string, number>> => {
      const counts = await prisma.exam.groupBy({
        by: ['status'],
        where: { teacherId },
        _count: { id: true },
      });
      
      const result = counts.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      // 计算非归档总数
      const nonArchivedTotal = Object.entries(result)
        .filter(([status]) => status !== ExamStatus.ARCHIVED)
        .reduce((sum, [, count]) => sum + count, 0);
      
      result.all = nonArchivedTotal;
      return result;
    };

    const statusCounts = await getStatusCounts();

    const formattedExams = exams.map(exam => {
      const questionSnapshot = exam.questionSnapshot as any;
      const questionIds = questionSnapshot?.questions?.map((q: any) => q.id) || [];
      
      return {
        id: exam.id,
        public_uuid: exam.publicUuid,
        title: exam.title,
        paper_title: exam.paper.title,
        duration_minutes: exam.durationMinutes,
        question_count: questionSnapshot?.total_count || questionIds.length,
        participant_count: exam._count.results,
        start_time: exam.startTime,
        end_time: exam.endTime,
        has_password: !!exam.password,
        shuffle_questions: exam.shuffleQuestions,
        allow_multiple_submissions: exam.allowMultipleSubmissions,
        status: exam.status,
        public_url: `${getPrimaryFrontendOrigin()}/exam/${exam.publicUuid}`,
        created_at: exam.createdAt,
        updated_at: exam.updatedAt,
        // 生命周期管理相关字段
        status_display: ExamStatusValidator.getStatusDisplayName(exam.status as ExamStatus),
        status_color: getStatusColor(exam.status as ExamStatus),
        available_actions: ExamStatusValidator.getAvailableActions(
          exam.status as ExamStatus,
          exam._count.results
        ),
      };
    });

    // 构建最终响应结果
    const result = {
      data: formattedExams,
      ...paginationResult,
      meta: {
        totalCount: strategy === 'offset' ? totalCount : undefined,
        strategy,
        // 状态统计
        status_counts: statusCounts,
        // 筛选条件
        current_status: status || 'all',
        include_archived: includeArchived,
        search_query: search || null,
      },
    };

    sendSuccess(res, result);
  } catch (error) {
    console.error('获取考试列表错误:', error);
    sendError(res, '获取考试列表失败', 500);
  }
};

// 获取归档考试列表 - 回收站功能
export const getArchivedExams = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 解析分页参数
    const paginationOptions: PaginationOptions = {
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
      cursor: req.query.cursor as string,
      sortField: (req.query.sort_field as string) || 'updatedAt',
      sortOrder: (req.query.sort_order as 'asc' | 'desc') || 'desc',
    };

    const search = req.query.search as string;

    // 构建查询条件
    const whereClause: any = {
      teacherId,
      status: ExamStatus.ARCHIVED,
    };

    // 添加搜索条件
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { paper: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // 获取总数量
    const totalCount = await prisma.exam.count({
      where: whereClause,
    });

    // 构建智能分页查询
    const { strategy, params } = SmartPagination.buildQuery(paginationOptions, totalCount);

    let exams: any[];
    let paginationResult: any;

    if (strategy === 'cursor') {
      // 游标分页
      console.log(`📄 使用游标分页查询归档考试，教师: ${teacherId}`);
      exams = await prisma.exam.findMany({
        where: { ...whereClause, ...params },
        take: paginationOptions.limit! + 1,
        orderBy: { [paginationOptions.sortField!]: paginationOptions.sortOrder },
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

      const hasNext = exams.length > paginationOptions.limit!;
      const actualData = hasNext ? exams.slice(0, -1) : exams;

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
      exams = actualData;
    } else {
      // 偏移分页
      console.log(`📄 使用偏移分页查询归档考试，教师: ${teacherId}, page ${paginationOptions.page}`);
      const offset = OffsetPagination.calculateOffset(paginationOptions.page!, paginationOptions.limit!);
      
      exams = await prisma.exam.findMany({
        where: whereClause,
        skip: offset,
        take: paginationOptions.limit!,
        orderBy: { [paginationOptions.sortField!]: paginationOptions.sortOrder },
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

      paginationResult = OffsetPagination.buildResult(
        exams,
        totalCount,
        paginationOptions.page!,
        paginationOptions.limit!
      );
    }

    // 格式化归档考试数据
    const formattedExams = exams.map(exam => {
      const questionSnapshot = exam.questionSnapshot as any;
      const questionIds = questionSnapshot?.questions?.map((q: any) => q.id) || [];
      
      return {
        id: exam.id,
        public_uuid: exam.publicUuid,
        title: exam.title,
        paper_title: exam.paper.title,
        duration_minutes: exam.durationMinutes,
        question_count: questionSnapshot?.total_count || questionIds.length,
        participant_count: exam._count.results,
        start_time: exam.startTime,
        end_time: exam.endTime,
        has_password: !!exam.password,
        shuffle_questions: exam.shuffleQuestions,
        allow_multiple_submissions: exam.allowMultipleSubmissions,
        status: exam.status,
        public_url: `${getPrimaryFrontendOrigin()}/exam/${exam.publicUuid}`,
        created_at: exam.createdAt,
        updated_at: exam.updatedAt,
        archived_at: exam.updatedAt,
        available_actions: ExamStatusValidator.getAvailableActions(
          exam.status as ExamStatus,
          exam._count.results
        ),
      };
    });

    const result = {
      data: formattedExams,
      ...paginationResult,
      meta: {
        totalCount: strategy === 'offset' ? totalCount : undefined,
        strategy,
        archivedCount: totalCount,
      },
    };

    sendSuccess(res, result);

    console.log(`✅ 获取归档考试列表: ${formattedExams.length} 个归档考试`);
  } catch (error) {
    console.error('获取归档考试列表错误:', error);
    sendError(res, '获取归档考试列表失败', 500);
  }
};

// 获取考试题目详情 - 用于答案展示
export const getExamQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证考试权限并获取题目快照
    const exam = await prisma.exam.findFirst({
      where: {
        id: examId,
        teacherId,
      },
      select: {
        id: true,
        title: true,
        questionSnapshot: true,
      },
    });

    if (!exam) {
      sendError(res, '考试不存在或无权限访问', 404);
      return;
    }

    // 安全处理questionSnapshot
    const questionSnapshot = exam.questionSnapshot as any;
    const questionIds = questionSnapshot?.questions?.map((q: any) => q.id) || [];
    if (questionIds.length === 0) {
      sendSuccess(res, []);
      return;
    }

    // 根据快照ID获取题目详情
    const questions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
      },
      orderBy: {
        questionOrder: 'asc',
      },
    });

    // 格式化题目数据，保持与其他接口一致的下划线命名风格
    const formattedQuestions = questions.map(question => ({
      id: question.id,
      question_order: question.questionOrder,
      title: question.title,
      options: question.options,
      question_type: question.questionType,
      display_condition: question.displayCondition,
      created_at: question.createdAt,
      updated_at: question.updatedAt,
    }));

    sendSuccess(res, formattedQuestions);
    console.log(`✅ 获取考试题目详情: ${examId}, 题目数: ${formattedQuestions.length}`);
  } catch (error) {
    console.error('获取考试题目失败:', error);
    sendError(res, '获取考试题目失败', 500);
  }
};
