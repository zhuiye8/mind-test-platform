/**
 * AI报告控制器
 * 处理AI报告生成相关的业务逻辑和权限验证
 */

import { Request, Response } from 'express';
import { aiReportService } from '../services/aiReportService';
import { sendError } from '../utils/response';
import prisma from '../utils/database';

/**
 * 验证考试结果权限
 */
async function validateExamResultAccess(examResultId: string, teacherId: string) {
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
    return { valid: false, error: '考试结果不存在', statusCode: 404 };
  }

  // 验证教师权限：只能访问自己创建的考试
  if (examResult.exam.teacher.teacherId !== teacherId) {
    return { valid: false, error: '无权限访问此考试结果', statusCode: 403 };
  }

  return { valid: true, examResult };
}

/**
 * 生成AI分析报告
 */
export const generateAIReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examResultId } = req.params;
    const { useMock = false } = req.query;
    
    if (!examResultId) {
      sendError(res, '缺少考试结果ID', 400);
      return;
    }

    // 验证教师权限
    const teacher = req.teacher;
    if (!teacher || !teacher.teacherId) {
      sendError(res, '未找到认证信息', 401);
      return;
    }
    
    const validation = await validateExamResultAccess(examResultId, teacher.teacherId);
    if (!validation.valid) {
      sendError(res, validation.error!, validation.statusCode!);
      return;
    }

    console.log(`📊 开始生成AI报告: ${examResultId} (教师: ${teacher.teacherId})`);
    
    let reportBuffer: Buffer;
    
    // 根据参数决定是否使用模拟报告
    if (useMock === 'true') {
      reportBuffer = await aiReportService.generateMockReport(examResultId);
    } else {
      reportBuffer = await aiReportService.generateReport(examResultId);
    }
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ai_report_${examResultId}_${Date.now()}.txt"`);
    res.setHeader('Content-Length', reportBuffer.length);
    
    // 返回文件
    res.send(reportBuffer);
    
    console.log(`✅ AI报告生成完成: ${examResultId}`);
    
  } catch (error) {
    console.error('生成AI报告失败:', error);
    sendError(res, error instanceof Error ? error.message : '报告生成失败', 500);
  }
};

/**
 * 检查考试结果是否存在
 */
export const checkExamResultExists = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examResultId } = req.params;
    
    // 验证教师权限
    const teacher = req.teacher;
    if (!teacher || !teacher.teacherId) {
      res.status(401).json({
        success: false,
        error: '未找到认证信息'
      });
      return;
    }
    
    const validation = await validateExamResultAccess(examResultId, teacher.teacherId);
    
    res.json({
      success: true,
      data: {
        exists: validation.valid,
        examResultId,
        accessible: validation.valid,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('检查考试结果失败:', error);
    res.status(500).json({
      success: false,
      error: '检查失败'
    });
  }
};

/**
 * 获取报告生成状态
 */
export const getReportStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examResultId } = req.params;
    
    // 验证教师权限
    const teacher = req.teacher;
    if (!teacher || !teacher.teacherId) {
      res.status(401).json({
        success: false,
        error: '未找到认证信息'
      });
      return;
    }
    
    const validation = await validateExamResultAccess(examResultId, teacher.teacherId);
    if (!validation.valid) {
      res.status(validation.statusCode!).json({
        success: false,
        error: validation.error
      });
      return;
    }

    // 检查是否有AI会话ID
    const hasAISession = !!validation.examResult?.aiSessionId;
    
    // 检查是否已有生成的报告
    const existingReport = await prisma.aIReport.findFirst({
      where: {
        examResultId: examResultId,
        status: 'completed',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    res.json({
      success: true,
      data: {
        examResultId,
        status: existingReport ? 'completed' : hasAISession ? 'ready' : 'no_session',
        hasAISession,
        hasReport: !!existingReport,
        reportId: existingReport?.id,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('获取报告状态失败:', error);
    res.status(500).json({
      success: false,
      error: '获取状态失败'
    });
  }
};