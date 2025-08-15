import { Router } from 'express';
import { aiReportService } from '../services/aiReportService';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * 生成AI分析报告
 */
router.post('/generate/:examResultId', authenticateToken, async (req, res) => {
  try {
    const { examResultId } = req.params;
    const { useMock = false } = req.query;
    
    if (!examResultId) {
      res.status(400).json({
        success: false,
        error: '缺少考试结果ID'
      });
      return;
    }

    console.log(`📊 开始生成AI报告: ${examResultId}`);
    
    let reportBuffer: Buffer;
    
    // 根据参数决定是否使用模拟报告
    if (useMock === 'true') {
      reportBuffer = await aiReportService.generateMockReport(examResultId);
    } else {
      reportBuffer = await aiReportService.generateReport(examResultId);
    }
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report_${examResultId}_${Date.now()}.txt"`);
    res.setHeader('Content-Length', reportBuffer.length);
    
    // 返回文件
    res.send(reportBuffer);
    
    console.log(`📊 AI报告生成完成: ${examResultId}`);
    
  } catch (error) {
    console.error('生成AI报告失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '报告生成失败'
    });
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