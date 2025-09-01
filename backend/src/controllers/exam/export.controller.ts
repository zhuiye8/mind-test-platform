/**
 * 考试结果导出控制器
 * 负责CSV格式的单个和批量考试结果导出
 */

import { Request, Response } from 'express';
import { sendError } from '../../utils/response';
import prisma from '../../utils/database';

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