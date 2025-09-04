import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { CreateQuestionRequest } from '../../types';
import prisma from '../../utils/database';
import { DependencyValidator } from '../../utils/dependencyValidator';

// 创建题目
export const createQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const {
      question_order,
      title,
      options,
      question_type,
      display_condition,
      is_required = true,
      is_scored = false,
    }: CreateQuestionRequest = req.body;
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!title || !options || question_order === undefined) {
      sendError(res, '题目内容、选项和顺序不能为空', 400);
      return;
    }

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

    // 如果有条件逻辑，验证依赖的题目是否存在
    if (display_condition) {
      const dependentQuestion = await prisma.question.findFirst({
        where: {
          id: display_condition.question_id,
          paperId,
        },
      });

      if (!dependentQuestion) {
        sendError(res, '依赖的题目不存在', 400);
        return;
      }

      // 进行循环依赖检查 - 需要构建完整的题目依赖数据
      const allQuestions = await prisma.question.findMany({
        where: { paperId },
        select: {
          id: true,
          title: true,
          displayCondition: true,
        },
      });

      const questionDependencies = allQuestions.map(q => ({
        id: q.id,
        title: q.title,
        display_condition: q.displayCondition as any,
        paper_id: paperId,
      }));

      // 临时创建一个新的题目对象进行循环依赖检查
      const tempQuestionId = `temp_${Date.now()}`;
      const tempQuestionDependencies = [
        ...questionDependencies,
        {
          id: tempQuestionId,
          title: title.trim(),
          display_condition: display_condition,
          paper_id: paperId,
        }
      ];

      const validator = new DependencyValidator(tempQuestionDependencies);
      const validationResult = validator.validateQuestionCondition(tempQuestionId, display_condition);
      const hasCircularDependency = { 
        isCircular: !validationResult.isValid && validationResult.errors.some(e => e.includes('循环依赖')),
        path: validationResult.errors.filter(e => e.includes('循环依赖'))
      };

      if (hasCircularDependency.isCircular) {
        sendError(res, `检测到循环依赖: ${hasCircularDependency.path.join(' -> ')}`, 400);
        return;
      }
    }

    // 检查题目顺序是否重复
    const existingOrder = await prisma.question.findFirst({
      where: {
        paperId,
        questionOrder: question_order,
      },
    });

    if (existingOrder) {
      sendError(res, `题目顺序 ${question_order} 已存在，请使用其他顺序`, 400);
      return;
    }

    // 创建题目
    const question = await prisma.question.create({
      data: {
        paperId,
        questionOrder: question_order,
        title,
        options,
        questionType: question_type,
        displayCondition: display_condition as any,
        isRequired: is_required,
        isScored: is_scored,
      },
      include: {
        paper: {
          select: {
            title: true,
            teacherId: true,
          },
        },
      },
    });

    sendSuccess(res, question, 201);
  } catch (error) {
    console.error('创建题目失败:', error);
    sendError(res, '创建题目失败', 500);
  }
};

// 更新题目
export const updateQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { questionId } = req.params;
    const { 
      title, 
      options, 
      question_type, 
      display_condition,
      is_required,
      is_scored 
    }: CreateQuestionRequest = req.body;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证题目权限
    const question = await prisma.question.findFirst({
      where: {
        id: questionId,
        paper: {
          teacherId,
        },
      },
      include: {
        paper: true,
      },
    });

    if (!question) {
      sendError(res, '题目不存在或无权限操作', 404);
      return;
    }

    // 如果更新了条件逻辑，进行验证
    if (display_condition) {
      const dependentQuestion = await prisma.question.findFirst({
        where: {
          id: display_condition.question_id,
          paperId: question.paperId,
        },
      });

      if (!dependentQuestion) {
        sendError(res, '依赖的题目不存在', 400);
        return;
      }

      // 进行循环依赖检查 - 需要构建完整的题目依赖数据
      const allQuestions = await prisma.question.findMany({
        where: { paperId: question.paperId },
        select: {
          id: true,
          title: true,
          displayCondition: true,
        },
      });

      const questionDependencies = allQuestions.map(q => ({
        id: q.id,
        title: q.title,
        display_condition: q.displayCondition as any,
        paper_id: question.paperId,
      }));

      const validator = new DependencyValidator(questionDependencies);
      const validationResult = validator.validateQuestionCondition(questionId, display_condition);
      const hasCircularDependency = { 
        isCircular: !validationResult.isValid && validationResult.errors.some(e => e.includes('循环依赖')),
        path: validationResult.errors.filter(e => e.includes('循环依赖'))
      };

      if (hasCircularDependency.isCircular) {
        sendError(res, `检测到循环依赖: ${hasCircularDependency.path.join(' -> ')}`, 400);
        return;
      }
    }

    // 更新题目
    const updatedQuestion = await prisma.question.update({
      where: { id: questionId },
      data: {
        ...(title && { title }),
        ...(options && { options }),
        ...(question_type && { questionType: question_type }),
        displayCondition: display_condition as any,
        ...(is_required !== undefined && { isRequired: is_required }),
        ...(is_scored !== undefined && { isScored: is_scored }),
      },
      include: {
        paper: {
          select: {
            title: true,
          },
        },
      },
    });

    sendSuccess(res, updatedQuestion);
  } catch (error) {
    console.error('更新题目失败:', error);
    sendError(res, '更新题目失败', 500);
  }
};

// 删除题目
export const deleteQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { questionId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证题目权限
    const question = await prisma.question.findFirst({
      where: {
        id: questionId,
        paper: {
          teacherId,
        },
      },
      include: {
        paper: true,
      },
    });

    if (!question) {
      sendError(res, '题目不存在或无权限操作', 404);
      return;
    }

    // 检查是否有其他题目依赖于这个题目
    const dependentQuestions = await prisma.$queryRaw`
      SELECT id, title, question_order
      FROM questions 
      WHERE paper_id = ${question.paperId}
      AND display_condition IS NOT NULL
      AND display_condition::jsonb @> ${'{"question_id": "' + questionId + '"}'}::jsonb
    ` as any[];

    if (dependentQuestions.length > 0) {
      const dependentTitles = dependentQuestions.map((q: any) => `第${q.question_order}题: ${q.title}`);
      sendError(
        res, 
        `无法删除，以下题目依赖于此题目：${dependentTitles.join(', ')}`,
        400
      );
      return;
    }

    // 删除题目
    await prisma.question.delete({
      where: { id: questionId },
    });

    sendSuccess(res, { message: '题目删除成功' });
  } catch (error) {
    console.error('删除题目失败:', error);
    sendError(res, '删除题目失败', 500);
  }
};