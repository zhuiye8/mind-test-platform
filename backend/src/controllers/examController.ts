import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { 
  CreateExamRequest, 
  ExamStatus, 
  GetExamSubmissionsRequest,
  ExamSubmissionResult,
  ExamSubmissionStats
} from '../types';
import prisma from '../utils/database';
// import cache, { CacheManager } from '../utils/cache'; // 已移除缓存
import { SmartPagination, OffsetPagination, PaginationOptions } from '../utils/pagination';
import { ExamStatusValidator, getStatusColor } from '../utils/examStatusValidator';

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
        password: password || null,
        shuffleQuestions: shuffle_questions || false,
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
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100), // 最大100条
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
      // 默认排除归档考试
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
        take: paginationOptions.limit! + 1, // 多查一条判断是否有下一页
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
      const questionIds = exam.questionIdsSnapshot as string[];
      
      return {
        id: exam.id,
        public_uuid: exam.publicUuid,
        title: exam.title,
        paper_title: exam.paper.title,
        duration_minutes: exam.durationMinutes,
        question_count: questionIds.length,
        participant_count: exam._count.results,
        start_time: exam.startTime,
        end_time: exam.endTime,
        has_password: !!exam.password,
        shuffle_questions: exam.shuffleQuestions,
        status: exam.status,
        public_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/exam/${exam.publicUuid}`,
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

// 获取考试详情
export const getExamById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 缓存已移除，直接查询数据库

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
        // submittedAt默认有值，所以实际上所有记录都是已提交的
      },
    });

    const examDetail = {
      id: exam.id,
      public_uuid: exam.publicUuid,
      title: exam.title,
      description: exam.paper.description || '', // 从paper获取描述
      paper_title: exam.paper.title, // 统一为字符串格式，与列表接口保持一致
      paper_id: exam.paperId, // 🔧 添加缺失的paper_id字段，用于前端编辑时回显试卷选择
      duration_minutes: exam.durationMinutes,
      question_count: questionIds.length,
      participant_count: exam._count.results,
      completion_count: completedResults,
      start_time: exam.startTime,
      end_time: exam.endTime,
      has_password: !!exam.password,
      password: exam.password, // 🔧 返回实际password值，用于前端编辑时回显密码
      max_attempts: 1, // 目前系统默认1次
      show_results: true, // 目前系统默认显示结果
      shuffle_questions: exam.shuffleQuestions,
      status: exam.status,
      public_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/exam/${exam.publicUuid}`,
      created_at: exam.createdAt,
      updated_at: exam.updatedAt,
      teacher_id: teacherId, // 用于权限验证
      teacher: {
        id: teacherId,
        name: exam.paper.title, // 临时用paper title，实际应该查询teacher表
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
    
    // 返回具体错误信息帮助调试
    sendError(res, `获取考试详情失败: ${error.message || '未知错误'}`, 500);
  }
};

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
      limit: Math.min(parseInt(req.query.limit as string) || 50, 200), // 考试结果最大200条
      cursor: req.query.cursor as string,
      sortField: (req.query.sortField as string) || 'submittedAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    // 缓存已移除，直接查询数据库

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
      // 游标分页 - 适用于大量考试结果
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
    const updatedExam = await prisma.exam.update({
      where: { id: examId },
      data: {
        title: title ?? existingExam.title,
        durationMinutes: duration_minutes ?? existingExam.durationMinutes,
        startTime: start_time ? new Date(start_time) : (start_time === null ? null : existingExam.startTime),
        endTime: end_time ? new Date(end_time) : (end_time === null ? null : existingExam.endTime),
        password: password !== undefined ? (password || null) : existingExam.password,
        shuffleQuestions: shuffle_questions ?? existingExam.shuffleQuestions,
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
    // 如果是其他状态但无提交，也可以删除
    if (ExamStatusValidator.canDelete(currentStatus, submissionCount)) {
      // 在事务中删除考试和相关数据
      await prisma.$transaction(async (tx) => {
        // 如果有提交结果，先删除提交结果
        if (submissionCount > 0) {
          await tx.examResult.deleteMany({
            where: { examId },
          });
          console.log(`🗑️ 已删除 ${submissionCount} 条提交记录`);
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

// 导出考试结果
export const exportExamResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证考试权限
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
          orderBy: {
            submittedAt: 'desc',
          },
        },
      },
    });

    if (!exam) {
      sendError(res, '考试不存在或无权访问', 404);
      return;
    }

    // 获取题目信息用于导出
    const questionIds = exam.questionIdsSnapshot as string[];
    const questions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
      },
      orderBy: {
        questionOrder: 'asc',
      },
    });

    // 构建CSV内容
    const csvRows = [];
    
    // CSV标题行
    const headers = [
      '序号',
      '学号',
      '姓名',
      '总分',
      'IP地址',
      '开始时间',
      '提交时间',
      '用时(分钟)',
      ...questions.map(q => `题目${q.questionOrder}: ${q.title.substring(0, 20)}...`)
    ];
    csvRows.push(headers.join(','));

    // 数据行
    exam.results.forEach((result: any, index: number) => {
      const answers = result.answers as Record<string, string>;
      const startTime = new Date(result.startedAt || result.submittedAt);
      const endTime = new Date(result.submittedAt);
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

      const row = [
        index + 1,
        `"${result.participantId}"`, // 用引号包围避免CSV解析问题
        `"${result.participantName}"`,
        result.score || 0,
        `"${result.ipAddress || 'N/A'}"`,
        `"${startTime.toLocaleString('zh-CN')}"`,
        `"${endTime.toLocaleString('zh-CN')}"`,
        durationMinutes,
        ...questions.map(q => {
          const answer = answers[q.id] || '';
          // 如果有选项，显示选项内容
          if (answer && q.options && typeof q.options === 'object') {
            const optionContent = (q.options as Record<string, string>)[answer];
            return `"${answer}: ${optionContent || answer}"`;
          }
          return `"${answer}"`;
        })
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    
    // 设置响应头
    const fileName = `${exam.title.replace(/[^\w\s-]/g, '')}-考试结果.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    
    // UTF-8 BOM 让Excel正确识别中文
    res.write('\uFEFF');
    res.end(csvContent);

    console.log(`✅ 考试结果已导出: ${exam.title} (${exam.results.length}条记录)`);
  } catch (error) {
    console.error('导出考试结果错误:', error);
    sendError(res, '导出结果失败', 500);
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

// 批量导出考试结果
export const batchExportExamResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { exam_ids } = req.body;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    if (!exam_ids || !Array.isArray(exam_ids) || exam_ids.length === 0) {
      sendError(res, '考试ID列表不能为空', 400);
      return;
    }

    // 验证所有考试权限并获取考试数据
    const exams = await prisma.exam.findMany({
      where: {
        id: { in: exam_ids },
        teacherId,
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
        results: {
          orderBy: {
            submittedAt: 'desc',
          },
        },
      },
    });

    if (exams.length === 0) {
      sendError(res, '没有找到可访问的考试', 404);
      return;
    }

    if (exams.length !== exam_ids.length) {
      sendError(res, '部分考试不存在或无权访问', 403);
      return;
    }

    // 构建所有考试的CSV内容
    const csvRows = [];
    
    // 添加表头说明
    csvRows.push('# 批量导出考试结果');
    csvRows.push(`# 导出时间: ${new Date().toLocaleString('zh-CN')}`);
    csvRows.push(`# 考试数量: ${exams.length}`);
    csvRows.push(''); // 空行分隔

    // 为每个考试生成CSV内容
    for (const exam of exams) {
      csvRows.push(`## 考试: ${exam.title} (基于试卷: ${exam.paper.title})`);
      csvRows.push(`## 参与人数: ${exam.results.length}`);
      csvRows.push(''); // 空行

      if (exam.results.length === 0) {
        csvRows.push('暂无考试结果');
        csvRows.push(''); // 空行分隔
        continue;
      }

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

      // CSV标题行
      const headers = [
        '序号',
        '学号',
        '姓名',
        '总分',
        'IP地址',
        '开始时间',
        '提交时间',
        '用时(分钟)',
        ...questions.map(q => `题目${q.questionOrder}: ${q.title.substring(0, 20)}...`)
      ];
      csvRows.push(headers.join(','));

      // 数据行
      exam.results.forEach((result: any, index: number) => {
        const answers = result.answers as Record<string, string>;
        const startTime = new Date(result.startedAt || result.submittedAt);
        const endTime = new Date(result.submittedAt);
        const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

        const row = [
          index + 1,
          `"${result.participantId}"`,
          `"${result.participantName}"`,
          result.score || 0,
          `"${result.ipAddress || 'N/A'}"`,
          `"${startTime.toLocaleString('zh-CN')}"`,
          `"${endTime.toLocaleString('zh-CN')}"`,
          durationMinutes,
          ...questions.map(q => {
            const answer = answers[q.id] || '';
            if (answer && q.options && typeof q.options === 'object') {
              const optionContent = (q.options as Record<string, string>)[answer];
              return `"${answer}: ${optionContent || answer}"`;
            }
            return `"${answer}"`;
          })
        ];
        csvRows.push(row.join(','));
      });

      csvRows.push(''); // 考试间空行分隔
    }

    const csvContent = csvRows.join('\n');
    
    // 设置响应头
    const fileName = `批量导出_考试结果_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    
    // UTF-8 BOM 让Excel正确识别中文
    res.write('\uFEFF');
    res.end(csvContent);

    const totalResults = exams.reduce((sum, exam) => sum + exam.results.length, 0);
    console.log(`✅ 批量导出考试结果完成: ${exams.length}个考试, ${totalResults}条记录`);
  } catch (error) {
    console.error('批量导出考试结果错误:', error);
    sendError(res, '批量导出失败', 500);
  }
};

// ==================== 考试生命周期管理 API ====================

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
      status: updatedExam.status,
      public_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/exam/${updatedExam.publicUuid}`,
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
      status: updatedExam.status,
      public_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/exam/${updatedExam.publicUuid}`,
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
      status: updatedExam.status,
      public_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/exam/${updatedExam.publicUuid}`,
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
 * 获取归档考试列表 - 回收站功能
 */
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
      sortField: (req.query.sort_field as string) || 'updatedAt', // 归档时间排序
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
      const questionIds = exam.questionIdsSnapshot as string[];
      
      return {
        id: exam.id,
        public_uuid: exam.publicUuid,
        title: exam.title,
        paper_title: exam.paper.title,
        duration_minutes: exam.durationMinutes,
        question_count: questionIds.length,
        participant_count: exam._count.results,
        start_time: exam.startTime,
        end_time: exam.endTime,
        has_password: !!exam.password,
        shuffle_questions: exam.shuffleQuestions,
        status: exam.status,
        public_url: `${process.env.CORS_ORIGIN || 'http://localhost:3000'}/exam/${exam.publicUuid}`,
        created_at: exam.createdAt,
        updated_at: exam.updatedAt,
        archived_at: exam.updatedAt, // 归档时间
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
        archivedCount: totalCount, // 归档总数
      },
    };

    sendSuccess(res, result);

    console.log(`✅ 获取归档考试列表: ${formattedExams.length} 个归档考试`);
  } catch (error) {
    console.error('获取归档考试列表错误:', error);
    sendError(res, '获取归档考试列表失败', 500);
  }
};

/**
 * 获取考试题目详情 - 用于答案展示
 */
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
        questionIdsSnapshot: true,
      },
    });

    if (!exam) {
      sendError(res, '考试不存在或无权限访问', 404);
      return;
    }

    // 安全处理questionIdsSnapshot
    const questionIds = (exam.questionIdsSnapshot as string[]) || [];
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

/**
 * 获取考试提交学生列表 - 删除前预览功能
 */
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
      limit: Math.min(parseInt(String(limit)), 200), // 最大200条
      sortField: mapApiFieldToPrismaField(sort_field as string), // 字段名转换
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
      unique_participants: allSubmissions.length, // 每个提交都是唯一参与者（因为有唯一约束）
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