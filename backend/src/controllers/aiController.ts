/**
 * AI分析控制器
 * 处理教师端AI分析相关请求
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { aiAnalysisService } from '../services/aiAnalysisService';
import prisma from '../utils/database';

/**
 * 生成AI分析报告
 * POST /api/ai/exam-results/:examResultId/generate-report
 */
export const generateAIReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examResultId } = req.params;

    // 验证考试结果是否存在
    const examResult = await prisma.examResult.findUnique({
      where: { id: examResultId },
      include: {
        exam: {
          include: {
            teacher: true,
          },
        },
      },
    });

    if (!examResult) {
      sendError(res, '考试结果不存在', 404);
      return;
    }

    // 验证教师权限：只能查看自己创建的考试的结果
    const teacherId = (req as any).teacher.teacherId;
    if (examResult.exam.teacher.teacherId !== teacherId) {
      sendError(res, '无权限访问此考试结果', 403);
      return;
    }

    // 教师请求生成AI报告

    // 调用AI分析服务生成报告
    const result = await aiAnalysisService.generateReport(examResultId);

    if (result.success) {
      sendSuccess(res, {
        report: result.report,
        reportFile: result.reportFile,
        message: 'AI分析报告生成成功',
      });
    } else {
      sendError(res, result.error || '生成AI分析报告失败', 500);
    }
  } catch (error) {
    console.error('[AI控制器] 生成AI报告失败:', error);
    sendError(res, '生成AI分析报告失败', 500);
  }
};

/**
 * 获取AI报告状态
 * GET /api/ai/exam-results/:examResultId/report-status
 */
export const getAIReportStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examResultId } = req.params;

    // 验证考试结果是否存在并检查权限
    const examResult = await prisma.examResult.findUnique({
      where: { id: examResultId },
      include: {
        exam: {
          include: {
            teacher: true,
          },
        },
        aiReports: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!examResult) {
      sendError(res, '考试结果不存在', 404);
      return;
    }

    // 验证教师权限
    const teacherId = (req as any).teacher.teacherId;
    if (examResult.exam.teacher.teacherId !== teacherId) {
      sendError(res, '无权限访问此考试结果', 403);
      return;
    }

    // 检查是否有AI会话
    const hasAISession = !!examResult.aiSessionId;
    const latestReport = examResult.aiReports[0];

    sendSuccess(res, {
      hasAISession,
      aiSessionId: examResult.aiSessionId,
      latestReport: latestReport ? {
        id: latestReport.id,
        status: latestReport.status,
        progress: latestReport.progress,
        createdAt: latestReport.createdAt,
        completedAt: latestReport.completedAt,
        error: latestReport.error,
        downloadUrl: latestReport.downloadUrl,
        filename: latestReport.filename,
        content: latestReport.content,
      } : null,
    });
  } catch (error) {
    console.error('[AI控制器] 获取AI报告状态失败:', error);
    sendError(res, '获取AI报告状态失败', 500);
  }
};

/**
 * 手动结束AI分析会话
 * POST /api/ai/exam-results/:examResultId/end-session
 */
export const endAISession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examResultId } = req.params;

    // 验证考试结果是否存在并检查权限
    const examResult = await prisma.examResult.findUnique({
      where: { id: examResultId },
      include: {
        exam: {
          include: {
            teacher: true,
          },
        },
      },
    });

    if (!examResult) {
      sendError(res, '考试结果不存在', 404);
      return;
    }

    // 验证教师权限
    const teacherId = (req as any).teacher.teacherId;
    if (examResult.exam.teacher.teacherId !== teacherId) {
      sendError(res, '无权限访问此考试结果', 403);
      return;
    }

    // 检查是否有AI会话
    if (!examResult.aiSessionId) {
      sendError(res, '该考试结果没有关联的AI会话', 400);
      return;
    }

    // 教师请求手动结束AI会话

    // 调用AI分析服务结束会话
    const result = await aiAnalysisService.endSession(examResultId);

    if (result.success) {
      // AI会话手动结束成功
      sendSuccess(res, {
        success: true,
        message: 'AI分析会话已成功结束',
      });
    } else {
      // AI会话手动结束失败
      sendError(res, result.error || '结束AI分析会话失败', 500);
    }
  } catch (error) {
    console.error('[AI控制器] 手动结束AI会话失败:', error);
    sendError(res, '结束AI分析会话失败', 500);
  }
};

/**
 * 检查AI服务健康状态
 * GET /api/ai/service/health
 */
export const checkAIServiceHealth = async (_req: Request, res: Response): Promise<void> => {
  try {
    const isHealthy = await aiAnalysisService.checkHealth();
    const serviceInfo = aiAnalysisService.getServiceInfo();

    sendSuccess(res, {
      healthy: isHealthy,
      service: serviceInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AI控制器] AI服务健康检查失败:', error);
    sendError(res, 'AI服务健康检查失败', 500);
  }
};