import { Request, Response } from 'express';
import { sendError } from '../../utils/response';
import prisma from '../../utils/database';

// CSV转换函数
function convertToCSV(questions: any[]): string {
  const headers = ['序号', '题目内容', '题目类型', '选项A', '选项B', '选项C', '选项D', '选项E', '是否必填', '是否计分', '量表分组'];
  
  const rows = questions.map((q, index) => {
    const options = q.options || {};
    return [
      index + 1,
      `"${q.title.replace(/"/g, '""')}"`, // CSV转义双引号
      q.type,
      options.A?.text || options.A || '',
      options.B?.text || options.B || '',
      options.C?.text || options.C || '',
      options.D?.text || options.D || '',
      options.E?.text || options.E || '',
      q.required ? '是' : '否',
      q.scored ? '是' : '否',
      q.scale || ''
    ].join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

// 导出题目API
export const exportQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { format = 'json' } = req.query as { format?: 'json' | 'csv' | 'excel' };
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 权限验证
    const paper = await prisma.paper.findFirst({
      where: { id: paperId, teacherId },
      include: {
        questions: {
          where: { isDeleted: false }, // 只导出未删除的题目
          orderBy: { questionOrder: 'asc' },
          include: { scale: true }
        },
        scales: { orderBy: { scaleOrder: 'asc' } }
      }
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限', 404);
      return;
    }

    // 格式化题目数据
    const exportData = {
      paper: {
        title: paper.title,
        description: paper.description,
        scale_type: paper.scaleType,
        scales: paper.scales.map(s => ({
          name: s.scaleName,
          order: s.scaleOrder
        }))
      },
      questions: paper.questions.map(q => ({
        order: q.questionOrder,
        title: q.title,
        type: q.questionType,
        options: q.options,
        required: q.isRequired,
        scored: q.isScored,
        score_value: q.scoreValue,
        scale: q.scale?.scaleName,
        display_condition: q.displayCondition,
        version: q.version
      })),
      metadata: {
        export_date: new Date(),
        question_count: paper.questions.length,
        version: '2.0'
      }
    };

    // 根据格式返回
    switch (format) {
      case 'csv':
        const csv = convertToCSV(exportData.questions);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(paper.title)}_questions.csv"`);
        res.send('\uFEFF' + csv); // BOM for UTF-8
        break;
        
      default: // json
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(paper.title)}_questions.json"`);
        res.json(exportData);
    }

    // 记录导出日志
    await prisma.importExportLog.create({
      data: {
        teacherId,
        paperId,
        operation: 'export',
        fileName: `${paper.title}_questions.${format}`,
        fileFormat: format as string,
        itemCount: paper.questions.length,
        successCount: paper.questions.length,
        failedCount: 0,
        result: { 
          success: true, 
          exported_count: paper.questions.length,
          format 
        }
      }
    });

    console.log(`✅ 导出题目成功: ${paper.title} - ${format}格式 - ${paper.questions.length}道题目`);

  } catch (error) {
    console.error('导出题目失败:', error);
    sendError(res, '导出失败', 500);
  }
};