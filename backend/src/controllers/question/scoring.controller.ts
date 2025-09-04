import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import prisma from '../../utils/database';

// 批量设置计分接口
export const batchSetScoring = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { mode, config } = req.body;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证试卷权限
    const paper = await prisma.paper.findFirst({
      where: {
        id: paperId,
        teacherId,
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限操作', 404);
      return;
    }

    // 获取试卷的所有题目
    const questions = await prisma.question.findMany({
      where: { paperId },
      orderBy: { questionOrder: 'asc' }
    });

    if (questions.length === 0) {
      sendError(res, '试卷中没有题目', 400);
      return;
    }

    let updatedQuestions = 0;

    if (mode === 'disable_all') {
      // 全部题目设为不计分
      const result = await prisma.question.updateMany({
        where: { paperId },
        data: { isScored: false }
      });
      updatedQuestions = result.count;

    } else if (mode === 'auto_fill') {
      if (!config || typeof config !== 'object') {
        sendError(res, 'auto_fill模式需要提供config参数', 400);
        return;
      }

      const { order = 'asc', initialScore = 1, step = 1 } = config;

      // 批量更新题目，给每个选项自动分配分值
      const updates = [];
      
      for (const question of questions) {
        // 跳过文本题，文本题无选项
        if (question.questionType === 'text') {
          continue;
        }

        const options = question.options as any;
        if (!options || typeof options !== 'object') {
          continue;
        }

        const optionKeys = Object.keys(options);
        if (optionKeys.length === 0) {
          continue;
        }

        // 根据升序或降序设置分值
        const newOptions: any = {};
        
        optionKeys.forEach((key, index) => {
          const currentOption = options[key];
          let score: number;

          if (order === 'desc') {
            // 降序：第一个选项分值最高
            score = initialScore + (optionKeys.length - 1 - index) * step;
          } else {
            // 升序：第一个选项分值最低
            score = initialScore + index * step;
          }

          newOptions[key] = {
            text: typeof currentOption === 'string' ? currentOption : currentOption?.text || currentOption?.label || '选项',
            score: score
          };
        });

        updates.push({
          where: { id: question.id },
          data: {
            isScored: true,
            options: newOptions
          }
        });
      }

      // 批量执行更新
      const promises = updates.map(update => 
        prisma.question.update(update)
      );
      
      await Promise.all(promises);
      updatedQuestions = updates.length;

    } else {
      sendError(res, '不支持的mode类型，支持: disable_all, auto_fill', 400);
      return;
    }

    sendSuccess(res, {
      message: `批量设置计分完成`,
      mode: mode,
      updatedQuestions: updatedQuestions,
      totalQuestions: questions.length,
      paperTitle: paper.title
    });

    console.log(`✅ 批量设置计分完成: ${paper.title}, 模式: ${mode}, 更新题目: ${updatedQuestions}/${questions.length}`);

  } catch (error) {
    console.error('批量设置计分失败:', error);
    sendError(res, '批量设置计分失败', 500);
  }
};

// 预览批量计分结果（不实际执行，只返回预览）
export const previewBatchScoring = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { mode, config } = req.body;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证试卷权限
    const paper = await prisma.paper.findFirst({
      where: {
        id: paperId,
        teacherId,
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限操作', 404);
      return;
    }

    // 获取试卷的所有题目
    const questions = await prisma.question.findMany({
      where: { paperId },
      orderBy: { questionOrder: 'asc' }
    });

    const previewResults: any[] = [];

    if (mode === 'disable_all') {
      // 预览：所有题目设为不计分
      questions.forEach(question => {
        previewResults.push({
          id: question.id,
          title: question.title.substring(0, 30) + (question.title.length > 30 ? '...' : ''),
          question_order: question.questionOrder,
          current_scored: question.isScored,
          new_scored: false,
          changes: question.isScored ? '计分 → 不计分' : '保持不计分'
        });
      });

    } else if (mode === 'auto_fill') {
      if (!config || typeof config !== 'object') {
        sendError(res, 'auto_fill模式需要提供config参数', 400);
        return;
      }

      const { order = 'asc', initialScore = 1, step = 1 } = config;

      questions.forEach(question => {
        if (question.questionType === 'text') {
          previewResults.push({
            id: question.id,
            title: question.title.substring(0, 30) + (question.title.length > 30 ? '...' : ''),
            question_order: question.questionOrder,
            current_scored: question.isScored,
            new_scored: false,
            changes: '文本题：保持不计分',
            options_preview: null
          });
          return;
        }

        const options = question.options as any;
        if (!options || typeof options !== 'object') {
          return;
        }

        const optionKeys = Object.keys(options);
        const optionsPreview: any = {};

        optionKeys.forEach((key, index) => {
          let score: number;
          if (order === 'desc') {
            score = initialScore + (optionKeys.length - 1 - index) * step;
          } else {
            score = initialScore + index * step;
          }

          const currentOption = options[key];
          const text = typeof currentOption === 'string' ? currentOption : currentOption?.text || currentOption?.label || '选项';

          optionsPreview[key] = `${text} (${score}分)`;
        });

        previewResults.push({
          id: question.id,
          title: question.title.substring(0, 30) + (question.title.length > 30 ? '...' : ''),
          question_order: question.questionOrder,
          current_scored: question.isScored,
          new_scored: true,
          changes: question.isScored ? '更新计分规则' : '不计分 → 计分',
          options_preview: optionsPreview
        });
      });
    }

    sendSuccess(res, {
      mode: mode,
      config: config,
      paperTitle: paper.title,
      totalQuestions: questions.length,
      previewResults: previewResults
    });

  } catch (error) {
    console.error('预览批量计分失败:', error);
    sendError(res, '预览批量计分失败', 500);
  }
};