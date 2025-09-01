import { Request, Response } from 'express';

import { sendSuccess, sendError } from '../utils/response';
import { CreateQuestionRequest } from '../types';
import prisma from '../utils/database';
import { DependencyValidator, quickCircularDependencyCheck } from '../utils/dependencyValidator';
import { audioFileService } from '../services/audioFileService';

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
        sendError(res, '条件逻辑依赖的题目不存在', 400);
        return;
      }
    }

    // 创建题目
    const question = await prisma.question.create({
      data: {
        paperId,
        questionOrder: question_order,
        title,
        options: options,
        questionType: question_type || 'single_choice',
        displayCondition: display_condition as any,
      },
    });

    // 检查是否需要生成语音文件 (仅检查，不自动生成)
    const audioCheckResult = await audioFileService.updateAudioIfNeeded(question.id);
    
    // 在响应中包含语音状态信息，用于前端提醒
    const audioSuggestion = audioCheckResult.needsUpdate ? {
      shouldGenerateAudio: true,
      message: '建议为新题目生成语音文件'
    } : null;

    sendSuccess(res, {
      id: question.id,
      question_order: question.questionOrder,
      title: question.title,
      options: question.options,
      question_type: question.questionType,
      display_condition: question.displayCondition,
      created_at: question.createdAt,
      updated_at: question.updatedAt,
      // 语音生成建议
      audioSuggestion,
    }, 201);

    console.log(`✅ 在试卷 ${paper.title} 中创建题目: ${title}`);
  } catch (error) {
    console.error('创建题目错误:', error);
    sendError(res, '创建题目失败', 500);
  }
};

// 更新题目
export const updateQuestion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { questionId } = req.params;
    const {
      question_order,
      title,
      options,
      question_type,
      display_condition,
    }: CreateQuestionRequest = req.body;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 验证题目权限
    const existingQuestion = await prisma.question.findFirst({
      where: { id: questionId },
      include: {
        paper: {
          select: {
            teacherId: true,
            title: true,
          },
        },
      },
    });

    if (!existingQuestion || existingQuestion.paper.teacherId !== teacherId) {
      sendError(res, '题目不存在或无权限操作', 404);
      return;
    }

    // 如果有条件逻辑，验证依赖的题目是否存在
    if (display_condition) {
      const dependentQuestion = await prisma.question.findFirst({
        where: {
          id: display_condition.question_id,
          paperId: existingQuestion.paperId,
        },
      });

      if (!dependentQuestion) {
        sendError(res, '条件逻辑依赖的题目不存在', 400);
        return;
      }

      // 防止循环依赖
      if (display_condition.question_id === questionId) {
        sendError(res, '题目不能依赖自己', 400);
        return;
      }
    }

    // 更新题目
    const updatedQuestion = await prisma.question.update({
      where: { id: questionId },
      data: {
        questionOrder: question_order ?? existingQuestion.questionOrder,
        title: title ?? existingQuestion.title,
        options: options ?? existingQuestion.options,
        questionType: question_type ?? existingQuestion.questionType,
        displayCondition: display_condition !== undefined ? (display_condition as any) : existingQuestion.displayCondition,
      },
    });

    // 检查是否需要更新语音文件 (仅检查，不自动生成)
    const audioCheckResult = await audioFileService.updateAudioIfNeeded(questionId);
    
    // 在响应中包含语音状态信息，用于前端提醒
    const audioSuggestion = audioCheckResult.needsUpdate ? {
      shouldUpdateAudio: true,
      message: '题目内容已变化，建议更新语音文件'
    } : null;

    sendSuccess(res, {
      id: updatedQuestion.id,
      question_order: updatedQuestion.questionOrder,
      title: updatedQuestion.title,
      options: updatedQuestion.options,
      question_type: updatedQuestion.questionType,
      display_condition: updatedQuestion.displayCondition,
      created_at: updatedQuestion.createdAt,
      updated_at: updatedQuestion.updatedAt,
      // 语音生成建议
      audioSuggestion,
    });

    console.log(`✅ 题目已更新: ${updatedQuestion.title}${audioCheckResult.needsUpdate ? ' (语音需要更新)' : ''}`);
  } catch (error) {
    console.error('更新题目错误:', error);
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
    const existingQuestion = await prisma.question.findFirst({
      where: { id: questionId },
      include: {
        paper: {
          select: {
            teacherId: true,
            title: true,
          },
        },
      },
    });

    if (!existingQuestion || existingQuestion.paper.teacherId !== teacherId) {
      sendError(res, '题目不存在或无权限操作', 404);
      return;
    }

    // 检查是否有其他题目依赖此题目
    const dependentQuestions = await prisma.question.findMany({
      where: {
        paperId: existingQuestion.paperId,
        displayCondition: {
          path: ['question_id'],
          equals: questionId,
        },
      },
    });

    if (dependentQuestions.length > 0) {
      const dependentTitles = dependentQuestions.map(q => q.title).join(', ');
      sendError(res, `无法删除，以下题目依赖此题目: ${dependentTitles}`, 400);
      return;
    }

    // 先删除语音文件 (异步，不影响题目删除)
    audioFileService.deleteAudioFile(questionId)
      .then(success => {
        if (success) {
          console.log(`🗑️ 题目 ${questionId} 语音文件已清理`);
        }
      })
      .catch(error => {
        console.warn(`⚠️ 清理题目 ${questionId} 语音文件失败:`, error);
      });

    // 删除题目 (数据库级联删除会自动清理QuestionAudio记录)
    await prisma.question.delete({
      where: { id: questionId },
    });

    sendSuccess(res, {
      message: '题目删除成功',
      deleted_question: {
        id: existingQuestion.id,
        title: existingQuestion.title,
      },
    });

    console.log(`✅ 题目已删除: ${existingQuestion.title}`);
  } catch (error) {
    console.error('删除题目错误:', error);
    sendError(res, '删除题目失败', 500);
  }
};

// 批量创建题目
export const batchCreateQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { questions } = req.body; // 题目数组
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      sendError(res, '题目列表不能为空', 400);
      return;
    }

    if (questions.length > 50) {
      sendError(res, '单次最多创建50道题目', 400);
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

    // 获取当前最大排序号
    const maxOrder = await prisma.question.aggregate({
      where: { paperId },
      _max: { questionOrder: true },
    });

    let currentOrder = (maxOrder._max.questionOrder || 0) + 1;
    const validationErrors: string[] = [];
    const processedQuestions: any[] = [];

    // 批量验证题目数据
    for (let i = 0; i < questions.length; i++) {
      const questionData = questions[i];
      const {
        title,
        options,
        question_type,
        display_condition,
      } = questionData;

      // 基础验证
      if (!title || !options || title.trim().length === 0) {
        validationErrors.push(`第${i + 1}题：标题和选项不能为空`);
        continue;
      }

      if (title.length > 200) {
        validationErrors.push(`第${i + 1}题：标题不能超过200个字符`);
        continue;
      }

      // 选项验证
      if (question_type !== 'text') {
        const validOptions = Object.values(options).filter(v => 
          typeof v === 'string' && v.trim()
        );
        if (validOptions.length < 2) {
          validationErrors.push(`第${i + 1}题：至少需要设置2个选项`);
          continue;
        }
      }

      // 条件逻辑依赖验证（简化版，创建后再做深度验证）
      if (display_condition) {
        const dependentQuestion = await prisma.question.findFirst({
          where: {
            id: display_condition.question_id,
            paperId,
          },
        });

        if (!dependentQuestion) {
          validationErrors.push(`第${i + 1}题：条件逻辑依赖的题目不存在`);
          continue;
        }
      }

      // 通过验证的题目
      processedQuestions.push({
        paperId,
        questionOrder: currentOrder++,
        title: title.trim(),
        options: options,
        questionType: question_type || 'single_choice',
        displayCondition: display_condition as any,
      });
    }

    // 如果有验证错误，返回错误信息
    if (validationErrors.length > 0) {
      sendError(res, `数据验证失败：${validationErrors.join('; ')}`, 400);
      return;
    }

    // 执行批量创建（事务处理）
    const createdQuestions = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const questionData of processedQuestions) {
        const question = await tx.question.create({
          data: questionData,
        });
        results.push(question);
      }
      return results;
    });

    // 格式化返回结果
    const formattedQuestions = createdQuestions.map(question => ({
      id: question.id,
      question_order: question.questionOrder,
      title: question.title,
      options: question.options,
      question_type: question.questionType,
      display_condition: question.displayCondition,
      created_at: question.createdAt,
      updated_at: question.updatedAt,
    }));

    sendSuccess(res, {
      message: `成功创建${createdQuestions.length}道题目`,
      created_count: createdQuestions.length,
      questions: formattedQuestions,
    }, 201);

    console.log(`✅ 批量创建题目成功: ${paper.title} - ${createdQuestions.length}道题目`);
  } catch (error) {
    console.error('批量创建题目错误:', error);
    sendError(res, '批量创建题目失败', 500);
  }
};

// 批量更新题目
export const batchUpdateQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { updates } = req.body; // 更新数组，每个元素包含 {id, ...updateData}
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      sendError(res, '更新列表不能为空', 400);
      return;
    }

    if (updates.length > 100) {
      sendError(res, '单次最多更新100道题目', 400);
      return;
    }

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 提取所有题目ID进行权限验证
    const questionIds = updates.map(update => update.id).filter(Boolean);
    if (questionIds.length !== updates.length) {
      sendError(res, '所有更新项必须包含有效的题目ID', 400);
      return;
    }

    // 批量验证题目权限和存在性
    const existingQuestions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
      },
      include: {
        paper: {
          select: {
            teacherId: true,
            title: true,
          },
        },
      },
    });

    // 检查权限
    const unauthorizedQuestions = existingQuestions.filter(q => q.paper.teacherId !== teacherId);
    if (unauthorizedQuestions.length > 0) {
      sendError(res, '部分题目无权限操作', 403);
      return;
    }

    if (existingQuestions.length !== questionIds.length) {
      sendError(res, '部分题目不存在', 404);
      return;
    }

    const validationErrors: string[] = [];
    const processedUpdates: Array<{id: string, data: any}> = [];

    // 批量验证更新数据
    for (let i = 0; i < updates.length; i++) {
      const updateData = updates[i];
      const {
        id,
        title,
        options,
        question_type,
        display_condition,
        question_order,
      } = updateData;

      const existingQuestion = existingQuestions.find(q => q.id === id);
      if (!existingQuestion) continue;

      const updateFields: any = {};

      // 验证标题
      if (title !== undefined) {
        if (typeof title !== 'string' || title.trim().length === 0) {
          validationErrors.push(`题目${i + 1}：标题不能为空`);
          continue;
        }
        if (title.length > 200) {
          validationErrors.push(`题目${i + 1}：标题不能超过200个字符`);
          continue;
        }
        updateFields.title = title.trim();
      }

      // 验证选项
      if (options !== undefined) {
        const questionType = question_type || existingQuestion.questionType;
        if (questionType !== 'text') {
          const validOptions = Object.values(options).filter(v => 
            typeof v === 'string' && v.trim()
          );
          if (validOptions.length < 2) {
            validationErrors.push(`题目${i + 1}：至少需要设置2个选项`);
            continue;
          }
        }
        updateFields.options = options;
      }

      // 验证题目类型
      if (question_type !== undefined) {
        if (!['single_choice', 'multiple_choice', 'text'].includes(question_type)) {
          validationErrors.push(`题目${i + 1}：无效的题目类型`);
          continue;
        }
        updateFields.questionType = question_type;
      }

      // 验证排序
      if (question_order !== undefined) {
        if (typeof question_order !== 'number' || question_order < 1) {
          validationErrors.push(`题目${i + 1}：排序必须是大于0的数字`);
          continue;
        }
        updateFields.questionOrder = question_order;
      }

      // 验证条件逻辑
      if (display_condition !== undefined) {
        if (display_condition && display_condition.question_id) {
          // 防止自己依赖自己
          if (display_condition.question_id === id) {
            validationErrors.push(`题目${i + 1}：不能依赖自己`);
            continue;
          }

          const dependentQuestion = await prisma.question.findFirst({
            where: {
              id: display_condition.question_id,
              paperId: existingQuestion.paperId,
            },
          });

          if (!dependentQuestion) {
            validationErrors.push(`题目${i + 1}：条件逻辑依赖的题目不存在`);
            continue;
          }
        }
        updateFields.displayCondition = display_condition;
      }

      if (Object.keys(updateFields).length > 0) {
        processedUpdates.push({ id, data: updateFields });
      }
    }

    // 如果有验证错误，返回错误信息
    if (validationErrors.length > 0) {
      sendError(res, `数据验证失败：${validationErrors.join('; ')}`, 400);
      return;
    }

    // 执行批量更新（事务处理）
    const updatedQuestions = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const { id, data } of processedUpdates) {
        const question = await tx.question.update({
          where: { id },
          data,
        });
        results.push(question);
      }
      return results;
    });

    // 格式化返回结果
    const formattedQuestions = updatedQuestions.map(question => ({
      id: question.id,
      question_order: question.questionOrder,
      title: question.title,
      options: question.options,
      question_type: question.questionType,
      display_condition: question.displayCondition,
      created_at: question.createdAt,
      updated_at: question.updatedAt,
    }));

    sendSuccess(res, {
      message: `成功更新${updatedQuestions.length}道题目`,
      updated_count: updatedQuestions.length,
      questions: formattedQuestions,
    });

    console.log(`✅ 批量更新题目成功: ${updatedQuestions.length}道题目`);
  } catch (error) {
    console.error('批量更新题目错误:', error);
    sendError(res, '批量更新题目失败', 500);
  }
};

// 批量删除题目
export const batchDeleteQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { question_ids } = req.body; // 题目ID数组
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
      sendError(res, '题目ID列表不能为空', 400);
      return;
    }

    if (question_ids.length > 100) {
      sendError(res, '单次最多删除100道题目', 400);
      return;
    }

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 批量验证题目权限和存在性
    const existingQuestions = await prisma.question.findMany({
      where: {
        id: { in: question_ids },
      },
      include: {
        paper: {
          select: {
            teacherId: true,
            title: true,
          },
        },
      },
    });

    // 检查权限
    const unauthorizedQuestions = existingQuestions.filter(q => q.paper.teacherId !== teacherId);
    if (unauthorizedQuestions.length > 0) {
      sendError(res, '部分题目无权限操作', 403);
      return;
    }

    if (existingQuestions.length !== question_ids.length) {
      const notFound = question_ids.filter(id => !existingQuestions.find(q => q.id === id));
      sendError(res, `部分题目不存在: ${notFound.join(', ')}`, 404);
      return;
    }

    // 检查依赖关系 - 批量查找所有被依赖的题目
    const dependentQuestions = await prisma.question.findMany({
      where: {
        OR: question_ids.map(questionId => ({
          displayCondition: {
            path: ['question_id'],
            equals: questionId,
          },
        })),
      },
      select: {
        id: true,
        title: true,
        displayCondition: true,
      },
    });

    // 构建依赖关系错误信息
    const dependencyErrors: string[] = [];
    for (const questionId of question_ids) {
      const dependents = dependentQuestions.filter(q => {
        const condition = q.displayCondition as any;
        return condition && condition.question_id === questionId;
      });

      if (dependents.length > 0) {
        const questionTitle = existingQuestions.find(q => q.id === questionId)?.title || questionId;
        const dependentTitles = dependents.map(q => q.title).join(', ');
        dependencyErrors.push(`题目"${questionTitle}"被以下题目依赖: ${dependentTitles}`);
      }
    }

    if (dependencyErrors.length > 0) {
      sendError(res, `无法删除，存在依赖关系：${dependencyErrors.join('; ')}`, 400);
      return;
    }

    // 执行批量删除（事务处理）
    const deletedQuestions = await prisma.$transaction(async (tx) => {
      // 记录被删除的题目信息
      const toDelete = existingQuestions.map(q => ({
        id: q.id,
        title: q.title,
        paper_title: q.paper.title,
      }));

      // 批量删除
      await tx.question.deleteMany({
        where: {
          id: { in: question_ids },
        },
      });

      return toDelete;
    });

    sendSuccess(res, {
      message: `成功删除${deletedQuestions.length}道题目`,
      deleted_count: deletedQuestions.length,
      deleted_questions: deletedQuestions,
    });

    console.log(`✅ 批量删除题目成功: ${deletedQuestions.length}道题目`);
  } catch (error) {
    console.error('批量删除题目错误:', error);
    sendError(res, '批量删除题目失败', 500);
  }
};

// 批量导入题目（从JSON数据）
export const batchImportQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { questions, import_mode = 'append' } = req.body; // append: 追加, replace: 替换
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      sendError(res, '导入的题目列表不能为空', 400);
      return;
    }

    if (questions.length > 200) {
      sendError(res, '单次最多导入200道题目', 400);
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
      include: {
        questions: {
          select: { id: true },
        },
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限操作', 404);
      return;
    }

    // 如果是替换模式，需要先检查是否有考试使用该试卷
    if (import_mode === 'replace') {
      const relatedExams = await prisma.exam.count({
        where: { paperId },
      });

      if (relatedExams > 0) {
        sendError(res, '该试卷已被考试使用，不能执行替换导入', 400);
        return;
      }
    }

    // 数据验证和预处理
    const validationErrors: string[] = [];
    const processedQuestions: any[] = [];
    let startOrder = 1;

    // 如果是追加模式，获取当前最大排序号
    if (import_mode === 'append') {
      const maxOrder = await prisma.question.aggregate({
        where: { paperId },
        _max: { questionOrder: true },
      });
      startOrder = (maxOrder._max.questionOrder || 0) + 1;
    }

    // 验证导入数据格式
    for (let i = 0; i < questions.length; i++) {
      const questionData = questions[i];
      
      // 支持多种导入格式
      const {
        title,
        question_title,
        content,
        options,
        choices,
        question_type = 'single_choice',
        type,
        display_condition,
        condition,
        order,
        question_order,
      } = questionData;

      // 标题字段兼容性处理
      const questionTitle = title || question_title || content;
      if (!questionTitle || typeof questionTitle !== 'string' || questionTitle.trim().length === 0) {
        validationErrors.push(`第${i + 1}题：标题不能为空`);
        continue;
      }

      if (questionTitle.length > 200) {
        validationErrors.push(`第${i + 1}题：标题不能超过200个字符`);
        continue;
      }

      // 题目类型兼容性处理
      const questionType = question_type || type || 'single_choice';
      if (!['single_choice', 'multiple_choice', 'text'].includes(questionType)) {
        validationErrors.push(`第${i + 1}题：无效的题目类型 "${questionType}"`);
        continue;
      }

      // 选项处理
      let processedOptions = {};
      
      if (questionType !== 'text') {
        const rawOptions = options || choices || {};
        
        // 支持不同的选项格式
        if (Array.isArray(rawOptions)) {
          // 数组格式: ["选项1", "选项2", ...]
          rawOptions.forEach((option, index) => {
            const key = String.fromCharCode(65 + index); // A, B, C, D...
            (processedOptions as Record<string, string>)[key] = String(option);
          });
        } else if (typeof rawOptions === 'object' && rawOptions !== null) {
          // 对象格式: {A: "选项1", B: "选项2", ...} 或 {1: "选项1", 2: "选项2", ...}
          const entries = Object.entries(rawOptions);
          entries.forEach(([key, value]) => {
            // 如果键是数字，转换为字母
            const optionKey = /^\d+$/.test(key) ? String.fromCharCode(64 + parseInt(key)) : key;
            (processedOptions as Record<string, string>)[optionKey] = String(value);
          });
        } else {
          validationErrors.push(`第${i + 1}题：选项格式不正确`);
          continue;
        }

        // 验证选项数量
        const validOptionsCount = Object.values(processedOptions).filter(v => 
          typeof v === 'string' && v.trim()
        ).length;
        
        if (validOptionsCount < 2) {
          validationErrors.push(`第${i + 1}题：至少需要设置2个选项`);
          continue;
        }
      }

      // 条件逻辑处理
      const displayCondition = display_condition || condition || null;
      
      // 排序处理
      const questionOrder = order || question_order || startOrder + i;

      processedQuestions.push({
        paperId,
        questionOrder: typeof questionOrder === 'number' ? questionOrder : startOrder + i,
        title: questionTitle.trim(),
        options: processedOptions,
        questionType,
        displayCondition: displayCondition as any,
      });
    }

    // 如果有验证错误，返回错误信息
    if (validationErrors.length > 0) {
      sendError(res, `数据验证失败：${validationErrors.join('; ')}`, 400);
      return;
    }

    // 执行导入操作（事务处理）
    const result = await prisma.$transaction(async (tx) => {
      let deletedCount = 0;
      
      // 如果是替换模式，先删除现有题目
      if (import_mode === 'replace' && paper.questions.length > 0) {
        const deleteResult = await tx.question.deleteMany({
          where: { paperId },
        });
        deletedCount = deleteResult.count;
      }

      // 批量创建新题目
      const createdQuestions = [];
      for (const questionData of processedQuestions) {
        const question = await tx.question.create({
          data: questionData,
        });
        createdQuestions.push(question);
      }

      return {
        deleted_count: deletedCount,
        created_questions: createdQuestions,
      };
    });

    // 格式化返回结果
    const formattedQuestions = result.created_questions.map(question => ({
      id: question.id,
      question_order: question.questionOrder,
      title: question.title,
      options: question.options,
      question_type: question.questionType,
      display_condition: question.displayCondition,
      created_at: question.createdAt,
      updated_at: question.updatedAt,
    }));

    const responseMessage = import_mode === 'replace' 
      ? `成功替换导入${result.created_questions.length}道题目（删除${result.deleted_count}道旧题目）`
      : `成功导入${result.created_questions.length}道题目`;

    sendSuccess(res, {
      message: responseMessage,
      import_mode,
      deleted_count: result.deleted_count,
      created_count: result.created_questions.length,
      questions: formattedQuestions,
    }, 201);

    console.log(`✅ 批量导入题目成功: ${paper.title} - ${import_mode}模式 - ${result.created_questions.length}道题目`);
  } catch (error) {
    console.error('批量导入题目错误:', error);
    sendError(res, '批量导入题目失败', 500);
  }
};

// 批量调整题目排序
export const batchReorderQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { question_orders } = req.body; // 数组: [{id: string, question_order: number}, ...]
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!question_orders || !Array.isArray(question_orders) || question_orders.length === 0) {
      sendError(res, '排序列表不能为空', 400);
      return;
    }

    if (question_orders.length > 200) {
      sendError(res, '单次最多调整200道题目的排序', 400);
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

    // 验证数据格式
    const validationErrors: string[] = [];
    const questionIds = question_orders.map(item => item.id).filter(Boolean);
    
    if (questionIds.length !== question_orders.length) {
      sendError(res, '所有排序项必须包含有效的题目ID', 400);
      return;
    }

    // 验证排序值
    for (let i = 0; i < question_orders.length; i++) {
      const { id, question_order } = question_orders[i];
      
      if (!id || typeof id !== 'string') {
        validationErrors.push(`第${i + 1}项：题目ID无效`);
        continue;
      }
      
      if (typeof question_order !== 'number' || question_order < 1) {
        validationErrors.push(`第${i + 1}项：排序值必须是大于0的数字`);
        continue;
      }
    }

    if (validationErrors.length > 0) {
      sendError(res, `数据验证失败：${validationErrors.join('; ')}`, 400);
      return;
    }

    // 验证题目存在性和权限
    const existingQuestions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
        paperId,
      },
      select: {
        id: true,
        title: true,
        questionOrder: true,
      },
    });

    if (existingQuestions.length !== questionIds.length) {
      const notFound = questionIds.filter(id => !existingQuestions.find(q => q.id === id));
      sendError(res, `部分题目不存在或不属于该试卷: ${notFound.join(', ')}`, 404);
      return;
    }

    // 检查排序值是否有重复
    const orderValues = question_orders.map(item => item.question_order);
    const duplicateOrders = orderValues.filter((value, index) => orderValues.indexOf(value) !== index);
    
    if (duplicateOrders.length > 0) {
      sendError(res, `排序值不能重复: ${[...new Set(duplicateOrders)].join(', ')}`, 400);
      return;
    }

    // 检查是否与其他题目的排序冲突
    const otherQuestions = await prisma.question.findMany({
      where: {
        paperId,
        id: { notIn: questionIds },
      },
      select: {
        id: true,
        questionOrder: true,
        title: true,
      },
    });

    const conflictOrders = orderValues.filter(order => 
      otherQuestions.some(q => q.questionOrder === order)
    );

    if (conflictOrders.length > 0) {
      // 自动调整冲突的题目排序
      console.log(`⚠️ 检测到排序冲突，将自动调整其他题目的排序: ${conflictOrders.join(', ')}`);
    }

    // 执行批量排序更新（事务处理）
    const updatedQuestions = await prisma.$transaction(async (tx) => {
      // 先将所有相关题目的排序设置为负数（临时值），避免约束冲突
      const maxTempOrder = Math.max(...orderValues, ...otherQuestions.map(q => q.questionOrder)) + 1000;
      
      // 设置临时排序值
      await tx.question.updateMany({
        where: {
          paperId,
        },
        data: {
          questionOrder: { increment: maxTempOrder },
        },
      });

      // 更新目标题目的排序
      const results = [];
      for (const { id, question_order } of question_orders) {
        const question = await tx.question.update({
          where: { id },
          data: { questionOrder: question_order },
        });
        results.push(question);
      }

      // 重新整理其他题目的排序（填充空隙）
      const usedOrders = new Set(orderValues);
      let nextAvailableOrder = 1;
      
      for (const otherQuestion of otherQuestions) {
        // 找到下一个可用的排序号
        while (usedOrders.has(nextAvailableOrder)) {
          nextAvailableOrder++;
        }
        
        await tx.question.update({
          where: { id: otherQuestion.id },
          data: { questionOrder: nextAvailableOrder },
        });
        
        usedOrders.add(nextAvailableOrder);
        nextAvailableOrder++;
      }

      return results;
    });

    // 获取更新后的所有题目（用于返回完整排序结果）
    const allQuestions = await prisma.question.findMany({
      where: { paperId },
      orderBy: { questionOrder: 'asc' },
      select: {
        id: true,
        title: true,
        questionOrder: true,
        updatedAt: true,
      },
    });

    sendSuccess(res, {
      message: `成功调整${updatedQuestions.length}道题目的排序`,
      updated_count: updatedQuestions.length,
      reordered_questions: updatedQuestions.map(q => ({
        id: q.id,
        question_order: q.questionOrder,
        title: q.title,
      })),
      all_questions_order: allQuestions.map(q => ({
        id: q.id,
        question_order: q.questionOrder,
        title: q.title.substring(0, 50) + (q.title.length > 50 ? '...' : ''),
      })),
    });

    console.log(`✅ 批量调整题目排序成功: ${paper.title} - ${updatedQuestions.length}道题目`);
  } catch (error) {
    console.error('批量调整题目排序错误:', error);
    sendError(res, '批量调整排序失败', 500);
  }
};

// 获取题目列表（按试卷）
export const getQuestionsByPaper = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
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
      sendError(res, '试卷不存在或无权限访问', 404);
      return;
    }

    // 获取题目列表（包含语音文件信息）
    const questions = await prisma.question.findMany({
      where: { paperId },
      orderBy: { questionOrder: 'asc' },
      include: {
        audio: {
          select: {
            id: true,
            status: true,
            fileUrl: true,
            duration: true,
            contentHash: true,
            generatedAt: true,
            error: true,
          }
        }
      }
    });

    const formattedQuestions = questions.map(question => {
      // 计算当前题目内容哈希
      const currentHash = audioFileService.calculateContentHash({
        id: question.id,
        title: question.title,
        options: question.options,
        question_type: question.questionType,
      });
      
      // 判断语音是否需要更新
      const audioNeedsUpdate = question.audio ? 
        (question.audio.contentHash !== currentHash) : false;

      return {
        id: question.id,
        question_order: question.questionOrder,
        title: question.title,
        options: question.options,
        question_type: question.questionType,
        display_condition: question.displayCondition,
        created_at: question.createdAt,
        updated_at: question.updatedAt,
        // 语音文件状态
        audio_status: question.audio?.status || 'none',
        audio_url: question.audio?.fileUrl || null,
        audio_duration: question.audio?.duration || null,
        audio_needs_update: audioNeedsUpdate,
        audio_error: question.audio?.error || null,
        audio_generated_at: question.audio?.generatedAt || null,
      };
    });

    sendSuccess(res, formattedQuestions);
  } catch (error) {
    console.error('获取题目列表错误:', error);
    sendError(res, '获取题目列表失败', 500);
  }
};

// 批量生成试卷语音文件
export const batchGenerateAudio = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { voiceSettings, forceRegenerate = false } = req.body;
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

    console.log(`📋 开始批量生成试卷 ${paper.title} 的语音文件`);

    // 获取需要生成语音的题目
    let questions;
    if (forceRegenerate) {
      // 强制重新生成所有题目的语音
      questions = await prisma.question.findMany({
        where: { paperId },
        orderBy: { questionOrder: 'asc' }
      });
    } else {
      // 只生成没有语音或需要更新的题目
      questions = await prisma.question.findMany({
        where: { paperId },
        include: { audio: true },
        orderBy: { questionOrder: 'asc' }
      });

      // 过滤出需要生成/更新的题目
      const questionsToGenerate = [];
      for (const question of questions) {
        if (!question.audio) {
          // 没有语音文件
          questionsToGenerate.push(question);
        } else {
          // 检查是否需要更新
          const currentHash = audioFileService.calculateContentHash({
            id: question.id,
            title: question.title,
            options: question.options,
            question_type: question.questionType,
          });
          
          if (question.audio.contentHash !== currentHash || question.audio.status === 'error') {
            questionsToGenerate.push(question);
          }
        }
      }
      questions = questionsToGenerate;
    }

    if (questions.length === 0) {
      sendSuccess(res, {
        message: '所有题目的语音文件都是最新的',
        totalQuestions: 0,
        successCount: 0,
        failedCount: 0,
        errors: []
      });
      return;
    }

    // 执行批量生成
    const result = await audioFileService.batchGenerateAudio(
      paperId,
      voiceSettings,
      (current: number, total: number, questionId: string) => {
        console.log(`📊 生成进度: ${current}/${total} - ${questionId}`);
      }
    );

    sendSuccess(res, {
      message: `批量语音生成完成`,
      totalQuestions: questions.length,
      successCount: result.success,
      failedCount: result.failed,
      errors: result.errors
    });

    console.log(`✅ 试卷 ${paper.title} 批量语音生成完成: 成功 ${result.success}, 失败 ${result.failed}`);

  } catch (error) {
    console.error('批量生成语音失败:', error);
    sendError(res, '批量生成语音失败', 500);
  }
};

// 获取试卷语音状态概览
export const getPaperAudioStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
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

    // 获取所有题目及其语音状态
    const questions = await prisma.question.findMany({
      where: { paperId },
      include: { 
        audio: {
          select: {
            status: true,
            contentHash: true,
            generatedAt: true,
            duration: true,
          }
        }
      },
      orderBy: { questionOrder: 'asc' }
    });

    // 统计各状态的题目数量
    const statusCount = {
      none: 0,        // 无语音文件
      pending: 0,     // 生成中
      generating: 0,  // 生成中
      ready: 0,       // 已完成
      error: 0,       // 生成失败
      needUpdate: 0   // 需要更新
    };

    let totalDuration = 0;
    let hasAudioCount = 0;

    for (const question of questions) {
      if (!question.audio) {
        statusCount.none++;
      } else {
        // 检查是否需要更新
        const currentHash = audioFileService.calculateContentHash({
          id: question.id,
          title: question.title,
          options: question.options,
          question_type: question.questionType,
        });

        if (question.audio.contentHash !== currentHash) {
          statusCount.needUpdate++;
        } else {
          const status = question.audio.status;
          if (status in statusCount) {
            statusCount[status as keyof typeof statusCount]++;
          }
          
          if (status === 'ready' && question.audio.duration) {
            totalDuration += question.audio.duration;
            hasAudioCount++;
          }
        }
      }
    }

    // 计算完成率
    const totalQuestions = questions.length;
    const completedCount = statusCount.ready;
    const completionRate = totalQuestions > 0 ? Math.round((completedCount / totalQuestions) * 100) : 0;

    sendSuccess(res, {
      paperId,
      paperTitle: paper.title,
      totalQuestions,
      statusCount,
      completionRate,
      totalDuration: Math.round(totalDuration * 10) / 10, // 保留1位小数
      averageDuration: hasAudioCount > 0 ? Math.round((totalDuration / hasAudioCount) * 10) / 10 : 0,
      lastGenerated: questions
        .map(q => q.audio?.generatedAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] || null
    });

  } catch (error) {
    console.error('获取试卷语音状态失败:', error);
    sendError(res, '获取语音状态失败', 500);
  }
};

// 获取试卷的题目依赖关系图
export const getPaperDependencyGraph = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
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
      sendError(res, '试卷不存在或无权限访问', 404);
      return;
    }

    // 获取试卷中所有题目
    const questions = await prisma.question.findMany({
      where: { paperId },
      orderBy: { questionOrder: 'asc' },
      select: {
        id: true,
        title: true,
        displayCondition: true,
        questionOrder: true,
        questionType: true,
      },
    });

    // 构建依赖验证器
    const questionDependencies = questions.map(q => ({
      id: q.id,
      title: q.title,
      display_condition: q.displayCondition as any,
      paper_id: paperId,
    }));

    const validator = new DependencyValidator(questionDependencies);

    // 检测所有循环依赖
    const circularDependencies = validator.detectAllCircularDependencies();

    // 获取依赖关系图数据
    const graphData = validator.getDependencyGraphData();

    // 为每个题目获取详细的依赖信息
    const questionDetails = questions.map(question => {
      const dependencies = validator.getQuestionDependencies(question.id);
      
      return {
        id: question.id,
        title: question.title,
        question_order: question.questionOrder,
        question_type: question.questionType,
        has_condition: !!question.displayCondition,
        display_condition: question.displayCondition,
        dependencies: {
          direct: dependencies.directDependencies,
          indirect: dependencies.indirectDependencies,
          total_count: dependencies.totalDependencies,
        },
        dependent_questions: graphData.edges
          .filter(edge => edge.from === question.id)
          .map(edge => edge.to),
      };
    });

    sendSuccess(res, {
      paper_info: {
        id: paperId,
        title: paper.title,
        total_questions: questions.length,
      },
      dependency_graph: graphData,
      circular_dependencies: circularDependencies,
      questions: questionDetails,
      statistics: {
        questions_with_conditions: questions.filter(q => q.displayCondition).length,
        total_dependencies: graphData.edges.length,
        circular_dependency_count: circularDependencies.length,
        complex_conditions: questions.filter(q => 
          q.displayCondition && typeof q.displayCondition === 'object' && 'operator' in q.displayCondition
        ).length,
      },
    });

    console.log(`✅ 获取题目依赖关系图: ${paper.title} - ${questions.length}道题目`);
  } catch (error) {
    console.error('获取依赖关系图错误:', error);
    sendError(res, '获取依赖关系图失败', 500);
  }
};

// 验证题目条件逻辑
export const validateQuestionCondition = async (req: Request, res: Response): Promise<void> => {
  try {
    const { questionId } = req.params;
    const { display_condition } = req.body;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 获取题目信息
    const question = await prisma.question.findFirst({
      where: { id: questionId },
      include: {
        paper: {
          select: {
            teacherId: true,
            title: true,
          },
        },
      },
    });

    if (!question || question.paper.teacherId !== teacherId) {
      sendError(res, '题目不存在或无权限访问', 404);
      return;
    }

    // 使用快速检测方法
    const circularCheck = await quickCircularDependencyCheck(
      questionId,
      display_condition,
      question.paperId,
      prisma
    );

    // 获取试卷中所有题目进行详细验证
    const questions = await prisma.question.findMany({
      where: { paperId: question.paperId },
      select: {
        id: true,
        title: true,
        displayCondition: true,
      },
    });

    const questionDependencies = questions.map(q => ({
      id: q.id,
      title: q.title,
      display_condition: q.displayCondition as any,
      paper_id: question.paperId,
    }));

    const validator = new DependencyValidator(questionDependencies);
    const validationResult = validator.validateQuestionCondition(questionId, display_condition);

    sendSuccess(res, {
      question_info: {
        id: question.id,
        title: question.title,
        paper_title: question.paper.title,
      },
      condition_to_validate: display_condition,
      validation_result: {
        is_valid: validationResult.isValid && !circularCheck.hasCircularDependency,
        errors: [
          ...validationResult.errors,
          ...(circularCheck.hasCircularDependency ? [circularCheck.errorMessage!] : []),
        ],
        warnings: validationResult.warnings,
      },
      circular_dependency_check: {
        has_circular_dependency: circularCheck.hasCircularDependency,
        cycle_path: circularCheck.cyclePath,
      },
      recommendations: generateConditionRecommendations(display_condition, validationResult),
    });

    console.log(`✅ 验证题目条件逻辑: ${question.title} - ${validationResult.isValid ? '有效' : '无效'}`);
  } catch (error) {
    console.error('验证条件逻辑错误:', error);
    sendError(res, '验证条件逻辑失败', 500);
  }
};

// 生成条件逻辑建议
function generateConditionRecommendations(condition: any, validationResult: any): string[] {
  const recommendations: string[] = [];

  if (!condition) {
    recommendations.push('题目无条件限制，将始终显示');
    return recommendations;
  }

  if ('question_id' in condition) {
    recommendations.push('使用简单条件逻辑，性能较好');
    if (!condition.selected_option) {
      recommendations.push('建议明确指定选项值，避免逻辑错误');
    }
  }

  if ('operator' in condition) {
    recommendations.push('使用复杂条件逻辑，请确保逻辑清晰');
    
    if (condition.operator === 'AND') {
      recommendations.push('AND条件要求所有子条件都满足，适用于严格筛选');
    } else if (condition.operator === 'OR') {
      recommendations.push('OR条件只要满足任一子条件即可，适用于多选场景');
    }

    if (condition.conditions && condition.conditions.length > 5) {
      recommendations.push('条件数量较多，建议简化逻辑以提高用户体验');
    }
  }

  if (validationResult.warnings.length > 0) {
    recommendations.push('注意处理警告信息，避免潜在问题');
  }

  if (validationResult.errors.length === 0) {
    recommendations.push('条件逻辑验证通过，可以安全使用');
  }

  return recommendations;
}

// ==================== 第二阶段：增强条件逻辑API ====================

/**
 * 获取条件逻辑模板和预设
 */
export const getConditionTemplates = async (_req: Request, res: Response): Promise<void> => {
  try {
    const templates = {
      common_patterns: [
        {
          name: "基础筛选",
          description: "根据单个前置题目的选择显示后续题目",
          template: {
            question_id: "${QUESTION_ID}",
            selected_option: "${OPTION_KEY}"
          },
          example: {
            question_id: "q1",
            selected_option: "A"
          }
        },
        {
          name: "多选组合(AND)",
          description: "需要满足多个条件才显示",
          template: {
            operator: "AND",
            conditions: [
              { question_id: "${QUESTION_ID_1}", selected_option: "${OPTION_KEY_1}" },
              { question_id: "${QUESTION_ID_2}", selected_option: "${OPTION_KEY_2}" }
            ]
          },
          example: {
            operator: "AND",
            conditions: [
              { question_id: "q1", selected_option: "A" },
              { question_id: "q2", selected_option: "B" }
            ]
          }
        },
        {
          name: "多选分支(OR)",
          description: "满足任一条件即可显示",
          template: {
            operator: "OR",
            conditions: [
              { question_id: "${QUESTION_ID_1}", selected_option: "${OPTION_KEY_1}" },
              { question_id: "${QUESTION_ID_2}", selected_option: "${OPTION_KEY_2}" }
            ]
          },
          example: {
            operator: "OR",
            conditions: [
              { question_id: "q1", selected_option: "A" },
              { question_id: "q3", selected_option: "C" }
            ]
          }
        }
      ],
      psychological_patterns: [
        {
          name: "焦虑症筛查模式",
          description: "基于GAD-7量表的条件逻辑",
          conditions: {
            operator: "AND",
            conditions: [
              { question_id: "anxiety_1", selected_option: "C" },
              { question_id: "anxiety_2", selected_option: "D" }
            ]
          }
        },
        {
          name: "抑郁症进阶评估",
          description: "基于PHQ-9量表的分级筛查",
          conditions: {
            operator: "OR",
            conditions: [
              { question_id: "depression_base", selected_option: "C" },
              { question_id: "depression_base", selected_option: "D" }
            ]
          }
        }
      ]
    };

    sendSuccess(res, {
      message: "获取条件逻辑模板成功",
      templates
    });
  } catch (error) {
    console.error('获取条件逻辑模板错误:', error);
    sendError(res, '获取条件逻辑模板失败', 500);
  }
};

/**
 * 条件逻辑预览 - 模拟不同答案下的题目显示情况
 */
export const previewConditionLogic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { simulation_answers } = req.body; // 模拟答案: { question_id: selected_option }
    const teacherId = req.teacher?.id;

    // 验证试卷权限
    const paper = await prisma.paper.findFirst({
      where: { 
        id: paperId, 
        teacherId: teacherId as string 
      },
      include: { 
        questions: {
          orderBy: { questionOrder: 'asc' }
        }
      }
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限访问', 404);
      return;
    }

    // 构建问题依赖数据
    const questionDependencies = paper.questions.map((q: any) => ({
      id: q.id,
      title: q.title,
      question_order: q.questionOrder,
      display_condition: q.displayCondition as any,
      paper_id: paperId,
    }));

    // 模拟条件逻辑计算
    const previewResult = simulateConditionLogic(questionDependencies, simulation_answers || {});

    sendSuccess(res, {
      message: "条件逻辑预览成功",
      preview_result: previewResult,
      total_questions: paper.questions.length,
      visible_questions: previewResult.visible_questions.length,
      hidden_questions: previewResult.hidden_questions.length,
    });

    console.log(`✅ 条件逻辑预览: ${paper.title} - 显示${previewResult.visible_questions.length}题`);
  } catch (error) {
    console.error('条件逻辑预览错误:', error);
    sendError(res, '条件逻辑预览失败', 500);
  }
};

/**
 * 批量设置条件逻辑
 */
export const batchSetConditionLogic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { condition_settings } = req.body; // [{ question_id, display_condition }]
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!condition_settings || !Array.isArray(condition_settings) || condition_settings.length === 0) {
      sendError(res, '条件设置列表不能为空', 400);
      return;
    }

    if (condition_settings.length > 100) {
      sendError(res, '单次最多设置100个题目的条件逻辑', 400);
      return;
    }

    // 验证所有题目权限
    const questionIds = condition_settings.map(setting => setting.question_id);
    const questions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
        paper: { teacherId: teacherId as string }
      },
      include: { paper: true }
    });

    if (questions.length !== questionIds.length) {
      sendError(res, '部分题目不存在或无权限访问', 403);
      return;
    }

    // 批量条件逻辑验证
    const validationResults = [];
    for (const setting of condition_settings) {
      const question = questions.find(q => q.id === setting.question_id);
      if (!question) continue;

      const { DependencyValidator } = await import('../utils/dependencyValidator');
      
      // 获取试卷所有题目用于依赖验证
      const paperQuestions = await prisma.question.findMany({
        where: { paperId: question.paperId },
        select: {
          id: true,
          title: true,
          displayCondition: true,
        },
      });

      const questionDependencies = paperQuestions.map((q: any) => ({
        id: q.id,
        title: q.title,
        display_condition: q.displayCondition as any,
        paper_id: question.paperId,
      }));

      const validator = new DependencyValidator(questionDependencies);
      const result = validator.validateQuestionCondition(setting.question_id, setting.display_condition);
      
      validationResults.push({
        question_id: setting.question_id,
        question_title: question.title,
        validation_result: result
      });
    }

    // 检查是否有验证失败的条件
    const failedValidations = validationResults.filter(r => !r.validation_result.isValid);
    if (failedValidations.length > 0) {
      sendError(res, `条件逻辑验证失败: ${failedValidations.map(f => 
        `${f.question_title}: ${f.validation_result.errors.join(', ')}`
      ).join('; ')}`, 400);
      return;
    }

    // 执行批量更新
    const updateResults = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const setting of condition_settings) {
        const updated = await tx.question.update({
          where: { id: setting.question_id },
          data: { displayCondition: setting.display_condition as any },
        });
        results.push(updated);
      }
      return results;
    });

    sendSuccess(res, {
      message: `成功设置${updateResults.length}个题目的条件逻辑`,
      updated_count: updateResults.length,
      validation_results: validationResults,
      updated_questions: updateResults.map(q => ({
        id: q.id,
        title: q.title,
        display_condition: q.displayCondition,
      })),
    });

    console.log(`✅ 批量设置条件逻辑成功: ${updateResults.length}个题目`);
  } catch (error) {
    console.error('批量设置条件逻辑错误:', error);
    sendError(res, '批量设置条件逻辑失败', 500);
  }
};

/**
 * 导出条件逻辑配置
 */
export const exportConditionLogicConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { format = 'json' } = req.query; // 支持 json, yaml 格式
    const teacherId = req.teacher?.id;

    // 验证试卷权限
    const paper = await prisma.paper.findFirst({
      where: { 
        id: paperId, 
        teacherId: teacherId as string 
      },
      include: {
        questions: {
          where: { displayCondition: { not: null as any } },
          orderBy: { questionOrder: 'asc' }
        }
      }
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限访问', 404);
      return;
    }

    // 构建导出数据
    const conditionConfig = {
      paper_info: {
        id: paper.id,
        title: paper.title,
        description: paper.description,
        exported_at: new Date().toISOString(),
      },
      condition_logic: paper.questions.map((q: any) => ({
        question_id: q.id,
        question_order: q.questionOrder,
        question_title: q.title,
        display_condition: q.displayCondition,
      })),
      statistics: {
        total_conditional_questions: paper.questions.length,
        logic_complexity: calculateLogicComplexity(paper.questions),
      }
    };

    // 根据格式返回数据
    if (format === 'yaml') {
      // 这里可以集成 yaml 库，暂时返回 JSON
      res.setHeader('Content-Type', 'text/yaml');
      res.setHeader('Content-Disposition', `attachment; filename="${paper.title}_conditions.yaml"`);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${paper.title}_conditions.json"`);
    }

    res.json(conditionConfig);

    console.log(`✅ 导出条件逻辑配置: ${paper.title} - ${paper.questions.length}个条件`);
  } catch (error) {
    console.error('导出条件逻辑配置错误:', error);
    sendError(res, '导出条件逻辑配置失败', 500);
  }
};

/**
 * 导入条件逻辑配置
 */
export const importConditionLogicConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { condition_config, import_mode = 'merge' } = req.body; // merge 或 replace
    const teacherId = req.teacher?.id;

    // 验证试卷权限
    const paper = await prisma.paper.findFirst({
      where: { 
        id: paperId, 
        teacherId: teacherId as string 
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限访问', 404);
      return;
    }

    // 验证导入配置格式
    if (!condition_config || !condition_config.condition_logic || !Array.isArray(condition_config.condition_logic)) {
      sendError(res, '条件逻辑配置格式不正确', 400);
      return;
    }

    // 验证和处理导入的条件逻辑
    const validConditions: Array<{ question_id: string; display_condition: any }> = [];
    const validationErrors: string[] = [];

    for (const conditionItem of condition_config.condition_logic) {
      const { question_id, display_condition } = conditionItem;

      // 验证题目是否存在
      const existingQuestion = await prisma.question.findFirst({
        where: { id: question_id, paperId }
      });

      if (!existingQuestion) {
        validationErrors.push(`题目不存在: ${question_id}`);
        continue;
      }

      // 验证条件逻辑
      if (display_condition) {
        const { DependencyValidator } = await import('../utils/dependencyValidator');
        
        const paperQuestions = await prisma.question.findMany({
          where: { paperId },
          select: { id: true, title: true, displayCondition: true },
        });

        const questionDependencies = paperQuestions.map((q: any) => ({
          id: q.id,
          title: q.title,
          display_condition: q.displayCondition as any,
          paper_id: paperId,
        }));

        const validator = new DependencyValidator(questionDependencies);
        const validationResult = validator.validateQuestionCondition(question_id, display_condition);

        if (!validationResult.isValid) {
          validationErrors.push(`题目${existingQuestion.title}的条件逻辑无效: ${validationResult.errors.join(', ')}`);
          continue;
        }
      }

      validConditions.push({
        question_id,
        display_condition,
      });
    }

    // 如果有验证错误，返回错误信息
    if (validationErrors.length > 0) {
      sendError(res, `导入验证失败: ${validationErrors.join('; ')}`, 400);
      return;
    }

    // 执行导入操作
    const importResult = await prisma.$transaction(async (tx) => {
      let updatedCount = 0;
      let clearedCount = 0;

      // 如果是替换模式，先清除所有现有条件逻辑
      if (import_mode === 'replace') {
        const clearResult = await tx.question.updateMany({
          where: { paperId },
          data: { displayCondition: null as any },
        });
        clearedCount = clearResult.count;
      }

      // 应用新的条件逻辑
      for (const condition of validConditions) {
        await tx.question.update({
          where: { id: condition.question_id },
          data: { displayCondition: condition.display_condition as any },
        });
        updatedCount++;
      }

      return { updatedCount, clearedCount };
    });

    sendSuccess(res, {
      message: `成功导入条件逻辑配置`,
      import_mode,
      updated_count: importResult.updatedCount,
      cleared_count: importResult.clearedCount,
      total_conditions: validConditions.length,
    });

    console.log(`✅ 导入条件逻辑配置成功: ${paper.title} - 更新${importResult.updatedCount}个条件`);
  } catch (error) {
    console.error('导入条件逻辑配置错误:', error);
    sendError(res, '导入条件逻辑配置失败', 500);
  }
};

// ==================== 辅助函数 ====================

/**
 * 模拟条件逻辑执行，返回题目显示情况
 */
function simulateConditionLogic(questions: any[], answers: Record<string, string>) {
  const visibleQuestions = [];
  const hiddenQuestions = [];
  const logicTrace = []; // 逻辑执行轨迹

  for (const question of questions) {
    const shouldShow = evaluateDisplayCondition(question.display_condition, answers);
    
    const traceItem = {
      question_id: question.id,
      question_title: question.title,
      question_order: question.question_order,
      display_condition: question.display_condition,
      should_show: shouldShow,
      evaluation_trace: getEvaluationTrace(question.display_condition, answers),
    };

    if (shouldShow) {
      visibleQuestions.push(traceItem);
    } else {
      hiddenQuestions.push(traceItem);
    }

    logicTrace.push(traceItem);
  }

  return {
    visible_questions: visibleQuestions,
    hidden_questions: hiddenQuestions,
    logic_trace: logicTrace,
  };
}

/**
 * 评估显示条件是否满足（支持嵌套条件）
 */
function evaluateDisplayCondition(condition: any, answers: Record<string, string>): boolean {
  if (!condition) return true;

  // 简单条件
  if ('question_id' in condition) {
    const answer = answers[condition.question_id];
    return answer === condition.selected_option;
  }

  // 复杂条件 (AND/OR) - 支持嵌套递归
  if ('operator' in condition && condition.conditions) {
    const results = condition.conditions.map((subCondition: any) => {
      // 递归处理嵌套条件
      return evaluateDisplayCondition(subCondition, answers);
    });

    if (condition.operator === 'AND') {
      return results.every((result: boolean) => result);
    } else if (condition.operator === 'OR') {
      return results.some((result: boolean) => result);
    }
  }

  return false;
}

/**
 * 获取条件评估轨迹（用于调试和预览，支持嵌套）
 */
function getEvaluationTrace(condition: any, answers: Record<string, string>): any {
  if (!condition) {
    return { type: 'no_condition', result: true };
  }

  // 简单条件
  if ('question_id' in condition) {
    const answer = answers[condition.question_id];
    return {
      type: 'simple',
      condition: condition,
      answer: answer,
      expected: condition.selected_option,
      result: answer === condition.selected_option,
    };
  }

  // 复杂条件（支持嵌套递归）
  if ('operator' in condition && condition.conditions) {
    const subTraces = condition.conditions.map((subCondition: any) => {
      // 递归处理嵌套条件轨迹
      return getEvaluationTrace(subCondition, answers);
    });

    const results = subTraces.map((trace: any) => trace.result);
    let finalResult;

    if (condition.operator === 'AND') {
      finalResult = results.every((result: boolean) => result);
    } else if (condition.operator === 'OR') {
      finalResult = results.some((result: boolean) => result);
    }

    return {
      type: 'complex',
      operator: condition.operator,
      nesting_level: calculateNestingLevel(condition),
      sub_traces: subTraces,
      sub_results: results,
      result: finalResult,
    };
  }

  return { type: 'invalid', result: false };
}

/**
 * 计算条件嵌套层级
 */
function calculateNestingLevel(condition: any): number {
  if (!condition || 'question_id' in condition) {
    return 0; // 简单条件无嵌套
  }

  if ('operator' in condition && condition.conditions) {
    let maxDepth = 0;
    for (const subCondition of condition.conditions) {
      if ('operator' in subCondition) {
        maxDepth = Math.max(maxDepth, calculateNestingLevel(subCondition) + 1);
      }
    }
    return maxDepth;
  }

  return 0;
}

/**
 * 计算逻辑复杂度分数（支持嵌套）
 */
function calculateLogicComplexity(questions: any[]): number {
  let totalComplexity = 0;

  for (const question of questions) {
    if (!question.displayCondition) continue;

    // 简单条件：复杂度 1
    if ('question_id' in question.displayCondition) {
      totalComplexity += 1;
      continue;
    }

    // 复杂条件：基础复杂度 2 + 子条件数量 + 嵌套层级惩罚
    if ('operator' in question.displayCondition && question.displayCondition.conditions) {
      const baseComplexity = 2;
      const conditionCount = countTotalConditions(question.displayCondition);
      const nestingLevel = calculateNestingLevel(question.displayCondition);
      const nestingPenalty = nestingLevel * 2; // 每层嵌套增加2点复杂度

      totalComplexity += baseComplexity + conditionCount + nestingPenalty;
    }
  }

  return totalComplexity;
}

/**
 * 递归计算条件总数（包括嵌套条件中的所有子条件）
 */
function countTotalConditions(condition: any): number {
  if (!condition) return 0;

  if ('question_id' in condition) {
    return 1; // 简单条件计为1
  }

  if ('operator' in condition && condition.conditions) {
    let total = 0;
    for (const subCondition of condition.conditions) {
      total += countTotalConditions(subCondition);
    }
    return total;
  }

  return 0;
}