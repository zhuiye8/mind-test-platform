import { Router } from 'express';
import { aiReportService } from '../services/aiReportService';
import { authenticateToken } from '../middleware/auth';
import prisma from '../utils/database';
import { sendError } from '../utils/response';

const router = Router();

/**
 * 生成AI分析报告（需要教师权限）
 */
router.post('/generate/:examResultId', authenticateToken, async (req, res): Promise<void> => {
  try {
    const { examResultId } = req.params;
    const { useMock = false } = req.query;
    
    if (!examResultId) {
      sendError(res, '缺少考试结果ID', 400);
      return;
    }

    // 验证考试结果是否存在并检查教师权限
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

    // 验证教师权限：只能生成自己创建的考试的报告
    const teacher = req.teacher;
    if (!teacher || !teacher.teacherId) {
      sendError(res, '未找到认证信息', 401);
      return;
    }
    
    if (examResult.exam.teacher.teacherId !== teacher.teacherId) {
      sendError(res, '无权限访问此考试结果', 403);
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
});

/**
 * 检查考试结果是否存在
 */
router.get('/check/:examResultId', authenticateToken, async (req, res) => {
  try {
    const { examResultId } = req.params;
    
    // 这里可以添加检查逻辑
    // const exists = await checkExamResultExists(examResultId);
    
    res.json({
      success: true,
      data: {
        exists: true, // 简化实现
        examResultId,
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
});

/**
 * 获取报告生成状态
 */
router.get('/status/:examResultId', authenticateToken, async (req, res) => {
  try {
    const { examResultId } = req.params;
    
    res.json({
      success: true,
      data: {
        examResultId,
        status: 'ready', // 简化实现
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
});

export default router;