import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { CreateQuestionRequest } from '../../types';
import prisma from '../../utils/database';

// 批量创建题目
export const batchCreateQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { questions }: { questions: CreateQuestionRequest[] } = req.body;
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      sendError(res, '题目列表不能为空', 400);
      return;
    }

    if (questions.length > 100) {
      sendError(res, '单次最多创建100道题目', 400);
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