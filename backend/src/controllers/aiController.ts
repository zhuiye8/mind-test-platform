/**
 * AI分析控制器
 * 处理教师端AI分析相关请求
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { aiAnalysisService } from '../services/aiAnalysis';
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
    const teacher = req.teacher;
    if (!teacher || !teacher.teacherId) {
      sendError(res, '未找到认证信息', 401);
      return;
    }
    
    if (examResult.exam.teacher.teacherId !== teacher.teacherId) {
      sendError(res, '无权限访问此考试结果', 403);
      return;
    }

    // 教师请求生成AI报告
    const forceRegenerate = req.query.force === 'true' || req.body.force === true;

    // 调用AI分析服务生成报告（支持缓存和强制重新生成）
    const result = await aiAnalysisService.generateReport(examResultId, forceRegenerate);

    if (result.success) {
      sendSuccess(res, {
        report: result.report,
        reportFile: result.reportFile,
        cached: result.cached,
        message: result.cached ? 'AI分析报告获取成功（缓存）' : 'AI分析报告生成成功',
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
    const teacher = req.teacher;
    if (!teacher || !teacher.teacherId) {
      sendError(res, '未找到认证信息', 401);
      return;
    }
    const teacherId = teacher.teacherId;
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
    const teacher = req.teacher;
    if (!teacher || !teacher.teacherId) {
      sendError(res, '未找到认证信息', 401);
      return;
    }
    const teacherId = teacher.teacherId;
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
 * 获取AI服务配置（供前端动态获取连接地址）
 * GET /api/ai/config
 */
export const getAIServiceConfig = async (_req: Request, res: Response): Promise<void> => {
  try {
    const isHealthy = await aiAnalysisService.checkHealth();
    const webSocketHealth = await aiAnalysisService.checkWebSocketHealth();

    console.log(`[AI控制器] 服务配置查询:`);
    console.log(`  - HTTP健康状态: ${isHealthy}`);
    console.log(`  - WebSocket健康状态: ${webSocketHealth.available}`);
    console.log(`  - WebSocket URL: ${webSocketHealth.websocketUrl}`);
    if (webSocketHealth.error) {
      console.log(`  - WebSocket错误: ${webSocketHealth.error}`);
    }
    if (webSocketHealth.diagnostics) {
      console.log(`  - 诊断信息:`, webSocketHealth.diagnostics);
    }

    sendSuccess(res, {
      websocketUrl: webSocketHealth.websocketUrl, // 使用正确构建的WebSocket地址
      available: isHealthy && webSocketHealth.available, // 同时检查HTTP和WebSocket
      features: {
        sessionCreation: isHealthy,
        emotionAnalysis: isHealthy && webSocketHealth.available,
        reportGeneration: isHealthy,
      },
      diagnostics: {
        httpService: isHealthy,
        websocketService: webSocketHealth.available,
        websocketError: webSocketHealth.error,
        responseTime: webSocketHealth.diagnostics?.responseTime || 0,
        configValid: webSocketHealth.diagnostics?.configValid || false,
        serviceInfo: webSocketHealth.diagnostics?.serviceInfo,
      },
      error: webSocketHealth.error, // 传递具体错误信息给前端
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[AI控制器] 获取AI服务配置失败:', error);
    // AI服务不可用时不应该返回500，而是返回不可用状态
    sendSuccess(res, {
      websocketUrl: null,
      available: false,
      features: {
        sessionCreation: false,
        emotionAnalysis: false,
        reportGeneration: false,
      },
      error: 'AI服务暂时不可用',
      diagnostics: {
        httpService: false,
        websocketService: false,
        websocketError: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * 检查AI服务健康状态
 * GET /api/ai/service/health
 */
export const checkAIServiceHealth = async (_req: Request, res: Response): Promise<void> => {
  try {
    const isHealthy = await aiAnalysisService.checkHealth();
    const serviceConfig = aiAnalysisService.getServiceConfig();

    sendSuccess(res, {
      healthy: isHealthy,
      service: serviceConfig,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AI控制器] AI服务健康检查失败:', error);
    sendError(res, 'AI服务健康检查失败', 500);
  }
};

/**
 * 重新生成AI分析报告（强制覆盖）
 * POST /api/ai/exam-results/:examResultId/regenerate-report
 */
export const regenerateAIReport = async (req: Request, res: Response): Promise<void> => {
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
    const teacher = req.teacher;
    if (!teacher || !teacher.teacherId) {
      sendError(res, '未找到认证信息', 401);
      return;
    }
    
    if (examResult.exam.teacher.teacherId !== teacher.teacherId) {
      sendError(res, '无权限访问此考试结果', 403);
      return;
    }

    console.log(`[AI控制器] 教师请求重新生成AI报告: ${examResultId}`);

    // 先删除旧的AI报告记录（如果存在）
    try {
      await prisma.aIReport.deleteMany({
        where: { examResultId: examResultId },
      });
      console.log(`[AI控制器] 已清理旧的AI报告记录`);
    } catch (deleteError) {
      console.warn(`[AI控制器] 清理旧报告时出错: ${deleteError}`);
    }

    // 强制重新生成报告
    const result = await aiAnalysisService.generateReport(examResultId, true);

    if (result.success) {
      sendSuccess(res, {
        report: result.report,
        reportFile: result.reportFile,
        cached: false, // 重新生成的报告永远不是缓存
        message: 'AI分析报告重新生成成功',
      });
    } else {
      sendError(res, result.error || '重新生成AI分析报告失败', 500);
    }
  } catch (error) {
    console.error('[AI控制器] 重新生成AI报告失败:', error);
    sendError(res, '重新生成AI分析报告失败', 500);
  }
};

/**
 * 获取情绪分析数据预览
 * GET /api/ai/exam-results/:examResultId/emotion-preview
 */
export const getEmotionDataPreview = async (req: Request, res: Response): Promise<void> => {
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
    const teacher = req.teacher;
    if (!teacher || !teacher.teacherId) {
      sendError(res, '未找到认证信息', 401);
      return;
    }
    
    if (examResult.exam.teacher.teacherId !== teacher.teacherId) {
      sendError(res, '无权限访问此考试结果', 403);
      return;
    }

    console.log(`[AI控制器] 获取原始情绪分析数据: ${examResultId}`);

    // 获取原始Mock数据并同步时间戳（服务内部会获取examResult数据）
    const rawEmotionData = await aiAnalysisService.getRawEmotionDataWithTimestamp(examResultId, {
      examTitle: examResult.exam.title,
      participantName: examResult.participantName,
    });

    sendSuccess(res, rawEmotionData);
  } catch (error) {
    console.error('[AI控制器] 获取情绪数据失败:', error);
    sendError(res, '获取情绪分析数据失败', 500);
  }
};