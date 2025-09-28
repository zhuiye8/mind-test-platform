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

// 批量导入题目（文件上传版本）
export const batchImportQuestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { mode = 'append', preview_only = 'false' } = req.body;
    const teacherId = req.teacher?.id;
    const file = req.file;

    console.log('📋 批量导入请求:', { paperId, mode, preview_only, hasFile: !!file });

    // 基础验证
    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    if (!file) {
      sendError(res, '请上传文件', 400);
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
          where: { isDeleted: false },
          select: {
            id: true,
            questionOrder: true,
            title: true,
            questionType: true,
            options: true,
            isRequired: true,
            isScored: true,
            scoreValue: true,
            displayCondition: true,
          },
        },
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限操作', 404);
      return;
    }

    // 解析文件内容
    let questionsData: any[];
    try {
      const fileContent = file.buffer.toString('utf8');
      
      if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
        // 解析 JSON
        const jsonData = JSON.parse(fileContent);
        questionsData = Array.isArray(jsonData) ? jsonData : [jsonData];
      } else if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        // 解析 CSV
        const lines = fileContent.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          sendError(res, 'CSV 文件格式错误：至少需要标题行和一行数据', 400);
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        questionsData = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const item: any = {};
          headers.forEach((header, index) => {
            item[header] = values[index] || '';
          });
          return item;
        });
      } else {
        sendError(res, '不支持的文件格式', 400);
        return;
      }
    } catch (error) {
      console.error('文件解析错误:', error);
      sendError(res, '文件格式错误，无法解析', 400);
      return;
    }

    // 数据验证和预处理
    const validationErrors: string[] = [];
    type ProcessedQuestion = {
      data: {
        paperId: string;
        questionOrder: number;
        title: string;
        options: Record<string, any>;
        questionType: string;
        displayCondition: any;
        isRequired: boolean;
        isScored: boolean;
        scoreValue: number;
      };
      preview: {
        paper_id: string;
        question_order: number;
        title: string;
        options: Record<string, any>;
        question_type: string;
        display_condition: any;
        is_required: boolean;
        is_scored: boolean;
        score_value: number;
      };
      signature: string;
      existingId: string | null;
      operation: 'create' | 'update';
    };
    const processedQuestions: ProcessedQuestion[] = [];

    const normalizeOptions = (rawOptions: any): Record<string, any> => {
      if (!rawOptions) return {};
      if (Array.isArray(rawOptions)) {
        const result: Record<string, any> = {};
        rawOptions.forEach((option: any, index) => {
          if (option === undefined || option === null) return;
          const key = String.fromCharCode(65 + index);
          if (typeof option === 'object') {
            result[key] = option.label ?? option.text ?? option.value ?? '';
          } else {
            result[key] = option;
          }
        });
        return result;
      }
      if (typeof rawOptions === 'object') {
        const cloned: Record<string, any> = {};
        Object.entries(rawOptions).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          if (typeof value === 'object' && value !== null) {
            const val: any = value as any;
            cloned[key] = val.label ?? val.text ?? val.value ?? val;
          } else {
            cloned[key] = value as any;
          }
        });
        return cloned;
      }
      return {};
    };

    const buildSignature = (
      title: string,
      questionType: string,
      options: Record<string, any>,
      isRequired: boolean,
      isScored: boolean,
      scoreValue: number,
    ): string => {
      const normalizedOptions = Object.entries(options || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${typeof value === 'object' ? JSON.stringify(value) : value}`);
      return [
        title.trim(),
        questionType,
        isRequired ? '1' : '0',
        isScored ? '1' : '0',
        Number(scoreValue) || 0,
        normalizedOptions.join(';')
      ].join('|');
    };

    const existingSignatures = new Map<string, { id: string; questionOrder: number }[]>();
    for (const existing of paper.questions) {
      const normalizedOptions = normalizeOptions(existing.options as any);
      const signature = buildSignature(
        existing.title,
        existing.questionType,
        normalizedOptions,
        existing.isRequired,
        existing.isScored,
        existing.scoreValue ?? 0,
      );
      const list = existingSignatures.get(signature) ?? [];
      list.push({ id: existing.id, questionOrder: existing.questionOrder });
      existingSignatures.set(signature, list);
    }

    const existingQuestionOrders = paper.questions.map((q: any) => q.questionOrder);
    let nextOrder = 1;
    if (mode !== 'replace' && existingQuestionOrders.length > 0) {
      nextOrder = Math.max(...existingQuestionOrders) + 1;
    }
    const consumeNextOrder = () => nextOrder++;

    // 处理每个题目
    for (let i = 0; i < questionsData.length; i++) {
      const questionData = questionsData[i];
      
      // 支持多种字段名称（兼容性处理）
      const title = questionData.title || questionData.question_title || questionData.content || '';
      const questionType = questionData.question_type || questionData.type || 'single_choice';
      const options = questionData.options || questionData.choices || [];
      const displayCondition = questionData.display_condition || questionData.condition || null;
      const questionOrderInput = questionData.question_order ?? questionData.order;
      const isRequired = questionData.is_required !== undefined ? questionData.is_required : true;
      const isScored = questionData.is_scored !== undefined ? questionData.is_scored : false;
      const scoreValue = questionData.score_value || 1;

      // 验证标题
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        validationErrors.push(`第${i + 1}题：标题不能为空`);
        continue;
      }

      if (title.length > 500) {
        validationErrors.push(`第${i + 1}题：标题不能超过500个字符`);
        continue;
      }

      // 验证题目类型
      if (!['single_choice', 'multiple_choice', 'text_input'].includes(questionType)) {
        validationErrors.push(`第${i + 1}题：无效的题目类型 "${questionType}"`);
        continue;
      }

      // 处理选项
      let processedOptions: Record<string, any> = {};
      
      if (questionType !== 'text_input') {
        // 支持数组格式选项
        if (Array.isArray(options)) {
          options.forEach((option, index) => {
            if (option && option.toString().trim()) {
              const key = String.fromCharCode(65 + index); // A, B, C, D...
              if (typeof option === 'object' && option.label) {
                processedOptions[key] = option.label;
              } else {
                processedOptions[key] = option.toString();
              }
            }
          });
        } else if (typeof options === 'object' && options !== null) {
          // 支持对象格式选项
          processedOptions = { ...options };
        }

        // 验证选项数量
        const validOptionsCount = Object.keys(processedOptions).length;
        if (validOptionsCount < 2) {
          validationErrors.push(`第${i + 1}题：${questionType === 'single_choice' ? '单选题' : '多选题'}至少需要2个选项`);
          continue;
        }
      }

      const normalizedOptions = processedOptions;
      const signature = buildSignature(
        title,
        questionType,
        normalizedOptions,
        Boolean(isRequired),
        Boolean(isScored),
        Number(scoreValue) || 1,
      );

      let existingMatch: { id: string; questionOrder: number } | undefined;
      if (mode === 'merge') {
        const candidates = existingSignatures.get(signature);
        if (candidates && candidates.length > 0) {
          existingMatch = candidates.shift();
          if (candidates.length === 0) {
            existingSignatures.delete(signature);
          }
        }
      }

      let targetOrder: number;
      if (mode === 'replace') {
        targetOrder = typeof questionOrderInput === 'number' && Number.isFinite(questionOrderInput)
          ? questionOrderInput
          : i + 1;
      } else if (existingMatch) {
        targetOrder = existingMatch.questionOrder;
      } else {
        targetOrder = consumeNextOrder();
      }

      const questionPayload = {
        paperId,
        questionOrder: targetOrder,
        title: title.trim(),
        options: normalizedOptions,
        questionType,
        displayCondition: displayCondition as any,
        isRequired: Boolean(isRequired),
        isScored: Boolean(isScored),
        scoreValue: Number(scoreValue) || 1,
      };

      processedQuestions.push({
        data: questionPayload,
        preview: {
          paper_id: paperId,
          question_order: targetOrder,
          title: questionPayload.title,
          options: questionPayload.options,
          question_type: questionPayload.questionType,
          display_condition: questionPayload.displayCondition,
          is_required: questionPayload.isRequired,
          is_scored: questionPayload.isScored,
          score_value: questionPayload.scoreValue,
        },
        signature,
        existingId: existingMatch?.id ?? null,
        operation: existingMatch ? 'update' : 'create',
      });
    }

    // 验证结果
    if (questionsData.length === 0) {
      sendError(res, '文件中没有找到有效的题目数据', 400);
      return;
    }

    if (validationErrors.length > 0) {
      res.status(400).json({
        success: false,
        message: `数据验证失败`,
        data: {
          success: false,
          imported_count: 0,
          skipped_count: 0,
          error_count: validationErrors.length,
          errors: validationErrors.slice(0, 10), // 只返回前10个错误
        }
      });
      return;
    }

    // 如果是预览模式，返回预览数据
    if (preview_only === 'true') {
      sendSuccess(res, {
        success: true,
        message: `预览成功，将要导入 ${processedQuestions.length} 个题目`,
        imported_count: 0,
        skipped_count: 0,
        error_count: 0,
        errors: [],
        preview_data: processedQuestions.slice(0, 50).map(item => item.preview),
      });
      return;
    }

    // 执行实际导入
    const result = await prisma.$transaction(async (tx) => {
      let deletedCount = 0;
      let createdCount = 0;
      let updatedCount = 0;
      
      // 替换模式：删除现有题目
      if (mode === 'replace' && paper.questions.length > 0) {
        // 软删除现有题目
        await tx.question.updateMany({
          where: { paperId, isDeleted: false },
          data: { 
            isDeleted: true,
            deletedAt: new Date(),
          },
        });
        deletedCount = paper.questions.length;
      }

      const creates = processedQuestions.filter(item => item.operation === 'create');
      const updates = processedQuestions.filter(item => item.operation === 'update' && item.existingId);

      for (const createItem of creates) {
        await tx.question.create({
          data: createItem.data,
        });
        createdCount += 1;
      }

      for (const updateItem of updates) {
        await tx.question.update({
          where: { id: updateItem.existingId! },
          data: {
            title: updateItem.data.title,
            options: updateItem.data.options,
            questionType: updateItem.data.questionType,
            displayCondition: updateItem.data.displayCondition,
            isRequired: updateItem.data.isRequired,
            isScored: updateItem.data.isScored,
            scoreValue: updateItem.data.scoreValue,
          },
        });
        updatedCount += 1;
      }

      return {
        deleted_count: deletedCount,
        created_count: createdCount,
        updated_count: updatedCount,
      };
    });

    // 记录导入日志（如果需要）
    console.log(`📋 导入日志: ${paper.title} - ${mode}模式 - 新增${result.created_count}道，更新${result.updated_count}道题目 - 文件: ${file.originalname}`);

    // 返回成功结果
    let responseMessage = '';
    if (mode === 'replace') {
      responseMessage = `成功替换导入${result.created_count}道题目${result.deleted_count > 0 ? `（替换了${result.deleted_count}道旧题目）` : ''}`;
    } else if (mode === 'merge') {
      responseMessage = `合并完成：新增${result.created_count}道，更新${result.updated_count}道题目`;
    } else {
      responseMessage = `成功追加${result.created_count}道题目`;
    }

    sendSuccess(res, {
      success: true,
      message: responseMessage,
      imported_count: result.created_count + result.updated_count,
      created_count: result.created_count,
      updated_count: result.updated_count,
      skipped_count: 0,
      error_count: 0,
      errors: [],
    }, 201);

    console.log(`✅ 批量导入题目成功: ${paper.title} - ${mode}模式 - 新增${result.created_count}道，更新${result.updated_count}道题目`);
    
  } catch (error) {
    console.error('批量导入题目错误:', error);
    
    // 根据错误类型返回更具体的信息
    if (error instanceof SyntaxError) {
      sendError(res, '文件格式错误：JSON 解析失败', 400);
    } else if ((error as any)?.code === 'P2002') {
      sendError(res, '题目顺序冲突，请检查题目排序设置', 400);
    } else {
      const message = error instanceof Error && error.message ? error.message : '批量导入题目失败';
      sendError(res, `批量导入题目失败: ${message}`, 500);
    }
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
