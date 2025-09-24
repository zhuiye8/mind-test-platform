import { Request, Response } from 'express';

import { sendSuccess, sendError } from '../utils/response';
import { ExamStatus } from '../types';
import prisma from '../utils/database';
import { getPrimaryFrontendOrigin } from '../utils/env';

// 获取教师的分析数据
export const getTeacherAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacherId = req.teacher?.id;
    const { timeRange = '30d' } = req.query;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 计算时间范围
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // 获取基础统计数据
    const [totalExams, totalPapers, totalResults] = await Promise.all([
      // 总考试数
      prisma.exam.count({
        where: {
          teacherId,
          createdAt: {
            gte: startDate,
          },
        },
      }),
      // 总试卷数
      prisma.paper.count({
        where: {
          teacherId,
          createdAt: {
            gte: startDate,
          },
        },
      }),
      // 总参与人数（结果数）
      prisma.examResult.count({
        where: {
          exam: {
            teacherId,
          },
          submittedAt: {
            gte: startDate,
          },
        },
      }),
    ]);

    // 获取最热门的考试
    const mostPopularExam = await prisma.exam.findFirst({
      where: {
        teacherId,
        createdAt: {
          gte: startDate,
        },
      },
      include: {
        _count: {
          select: {
            results: true,
          },
        },
      },
      orderBy: {
        results: {
          _count: 'desc',
        },
      },
    });

    // 计算平均参与率（更适合心理测试场景）
    const examsWithResults = await prisma.exam.findMany({
      where: {
        teacherId,
        status: { in: [ExamStatus.PUBLISHED, ExamStatus.SUCCESS, ExamStatus.EXPIRED] },
        createdAt: {
          gte: startDate,
        },
      },
      include: {
        _count: {
          select: {
            results: true,
          },
        },
      },
    });

    // 计算平均参与率：有参与者的考试占所有考试的百分比
    const avgCompletionRate = examsWithResults.length > 0 
      ? (examsWithResults.filter(exam => exam._count.results > 0).length / examsWithResults.length) * 100
      : 0;

    // 获取月度趋势数据
    const monthlyTrends = await getMonthlyTrends(teacherId);

    // 获取考试表现数据
    const examPerformance = await getExamPerformance(teacherId, startDate);

    // 构建响应数据
    const analyticsData = {
      overall_stats: {
        total_exams: totalExams,
        total_participants: totalResults,
        total_papers: totalPapers,
        avg_completion_rate: Math.round(avgCompletionRate * 10) / 10,
        most_popular_exam: mostPopularExam ? {
          title: mostPopularExam.title,
          participant_count: mostPopularExam._count.results,
        } : null,
      },
      monthly_trends: monthlyTrends,
      exam_performance: examPerformance,
    };

    sendSuccess(res, analyticsData);
  } catch (error) {
    console.error('获取分析数据错误:', error);
    sendError(res, '获取分析数据失败', 500);
  }
};

// 获取仪表盘统计数据
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 并行获取所有数据
    const [
      totalExams,
      totalPapers, 
      totalParticipants,
      activeExams,
      recentSubmissions,
      recentPapers,
      recentExams,
      avgCompletionData
    ] = await Promise.all([
      // 总考试数
      prisma.exam.count({
        where: { teacherId },
      }),
      // 总试卷数  
      prisma.paper.count({
        where: { teacherId },
      }),
      // 总参与人数（去重）
      prisma.examResult.findMany({
        where: {
          exam: { teacherId },
        },
        distinct: ['participantId'],
        select: { participantId: true },
      }),
      // 进行中的考试数
      prisma.exam.count({
        where: {
          teacherId,
          status: ExamStatus.PUBLISHED,
        },
      }),
      // 最近24小时的提交数
      prisma.examResult.count({
        where: {
          exam: { teacherId },
          submittedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      // 最近5个试卷
      prisma.paper.findMany({
        where: { teacherId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          _count: {
            select: {
              questions: true,
              exams: true,
            },
          },
        },
      }),
      // 最近5个考试
      prisma.exam.findMany({
        where: { teacherId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
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
      }),
      // 平均完成率计算数据
      prisma.exam.findMany({
        where: {
          teacherId,
          status: ExamStatus.PUBLISHED,
        },
        include: {
          _count: {
            select: {
              results: true,
            },
          },
        },
      }),
    ]);

    // 计算平均完成率
    let avgCompletionRate = 0;
    if (avgCompletionData.length > 0) {
      const totalResults = avgCompletionData.reduce((sum, exam) => sum + exam._count.results, 0);
      const totalExamsWithResults = avgCompletionData.filter(exam => exam._count.results > 0).length;
      avgCompletionRate = totalExamsWithResults > 0 ? (totalResults / totalExamsWithResults) * 10 : 0; // 假设满分100，简化为*10
    }

    // 格式化最近试卷数据
    const formattedRecentPapers = recentPapers.map(paper => ({
      id: paper.id,
      title: paper.title,
      description: paper.description,
      question_count: paper._count.questions,
      exam_count: paper._count.exams,
      is_active: true, // 简化处理
      created_at: paper.createdAt,
      updated_at: paper.updatedAt,
    }));

    // 格式化最近考试数据  
    const formattedRecentExams = recentExams.map(exam => {
      const questionIds = exam.questionIdsSnapshot as string[];
      return {
        id: exam.id,
        public_uuid: exam.publicUuid,
        title: exam.title,
        paper_title: exam.paper.title,
        duration_minutes: exam.durationMinutes,
        question_count: questionIds.length,
        result_count: exam._count.results, // 前端期望的字段名
        participant_count: exam._count.results,
        start_time: exam.startTime,
        end_time: exam.endTime,
        has_password: !!exam.password,
        shuffle_questions: exam.shuffleQuestions,
        status: exam.status,
        public_url: `${getPrimaryFrontendOrigin()}/exam/${exam.publicUuid}`,
        created_at: exam.createdAt,
        updated_at: exam.updatedAt,
      };
    });

    // 构建综合响应数据
    const dashboardData = {
      overall_stats: {
        total_exams: totalExams,
        total_papers: totalPapers,
        total_participants: totalParticipants.length,
        avg_completion_rate: Math.round(avgCompletionRate * 10) / 10, // 保留1位小数
      },
      activity_stats: {
        active_exams: activeExams,
        recent_submissions: recentSubmissions,
      },
      recent_papers: formattedRecentPapers,
      recent_exams: formattedRecentExams,
    };

    sendSuccess(res, dashboardData);
    console.log(`✅ 获取Dashboard数据: ${totalPapers}个试卷, ${totalExams}个考试, ${totalParticipants.length}个参与者`);
  } catch (error) {
    console.error('获取仪表盘统计数据错误:', error);
    sendError(res, '获取仪表盘统计数据失败', 500);
  }
};

// 获取月度趋势数据
async function getMonthlyTrends(teacherId: string) {
  const months = [];
  const now = new Date();
  const monthsCount = 6; // 获取最近6个月的数据

  // 生成最近6个月的月份列表
  for (let i = monthsCount - 1; i >= 0; i--) {
    const date = new Date();
    date.setMonth(now.getMonth() - i);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
    
    months.push({
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      start: monthStart,
      end: monthEnd,
    });
  }

  // 获取每个月的数据
  const monthlyData = await Promise.all(
    months.map(async ({ month, start, end }) => {
      const [examsCreated, participants] = await Promise.all([
        // 当月创建的考试数
        prisma.exam.count({
          where: {
            teacherId,
            createdAt: {
              gte: start,
              lte: end,
            },
          },
        }),
        // 当月参与人数
        prisma.examResult.count({
          where: {
            exam: {
              teacherId,
            },
            submittedAt: {
              gte: start,
              lte: end,
            },
          },
        }),
      ]);

      // 计算当月参与率（考试平均参与人数）
      const completionRate = examsCreated > 0 && participants > 0
        ? Math.round((participants / examsCreated) * 10) / 10  // 每个考试的平均参与人数
        : 0;

      return {
        month,
        exams_created: examsCreated,
        participants,
        completion_rate: completionRate,
      };
    })
  );

  return monthlyData;
}

// 获取考试表现数据
async function getExamPerformance(teacherId: string, startDate: Date) {
  const exams = await prisma.exam.findMany({
    where: {
      teacherId,
      createdAt: {
        gte: startDate,
      },
    },
    include: {
      paper: {
        select: {
          title: true,
        },
      },
      results: {
        select: {
          score: true,
          startedAt: true,
          submittedAt: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 20, // 限制返回最近20个考试
  });

  return exams.map(exam => {
    const results = exam.results;
    const participantCount = results.length;
    
    // 计算平均分
    const avgScore = participantCount > 0 
      ? results.reduce((sum, result) => sum + (result.score || 0), 0) / participantCount
      : 0;

    // 计算平均用时
    const validDurations = results
      .filter(result => result.startedAt)
      .map(result => {
        const start = new Date(result.startedAt!).getTime();
        const end = new Date(result.submittedAt).getTime();
        return (end - start) / 60000; // 转换为分钟
      })
      .filter(duration => duration > 0 && duration < 600); // 过滤异常数据（超过10小时的）

    const avgDuration = validDurations.length > 0
      ? validDurations.reduce((sum, duration) => sum + duration, 0) / validDurations.length
      : 0;

    return {
      exam_id: exam.id,
      exam_title: exam.title,
      paper_title: exam.paper.title,
      status: exam.status, // 添加考试状态字段
      participant_count: participantCount,
      completion_rate: 0, // 心理测试场景下不使用完成率概念
      avg_score: Math.round(avgScore * 10) / 10,
      avg_duration: Math.round(avgDuration * 10) / 10,
      created_at: exam.createdAt.toISOString(),
    };
  });
}
