import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import prisma from '../../utils/database';
import { DependencyValidator } from '../../utils/dependencyValidator';

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

// 获取条件逻辑模板和预设
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

// 条件逻辑预览 - 模拟不同答案下的题目显示情况
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

// 批量设置条件逻辑
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
    const updatedQuestions = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const setting of condition_settings) {
        const updated = await tx.question.update({
          where: { id: setting.question_id },
          data: { displayCondition: setting.display_condition }
        });
        results.push(updated);
      }
      return results;
    });

    sendSuccess(res, {
      message: `成功设置${updatedQuestions.length}个题目的条件逻辑`,
      updated_count: updatedQuestions.length,
      validation_results: validationResults
    });

    console.log(`✅ 批量设置条件逻辑: ${updatedQuestions.length}个题目`);
  } catch (error) {
    console.error('批量设置条件逻辑错误:', error);
    sendError(res, '批量设置条件逻辑失败', 500);
  }
};

// 辅助函数：生成条件逻辑建议
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

// 辅助函数：快速循环依赖检查
async function quickCircularDependencyCheck(
  questionId: string,
  displayCondition: any,
  paperId: string,
  prismaClient: any
): Promise<{ hasCircularDependency: boolean; cyclePath?: string[]; errorMessage?: string }> {
  if (!displayCondition) {
    return { hasCircularDependency: false };
  }

  try {
    // 简化的BFS循环依赖检查
    const visited = new Set<string>();
    const path = [questionId];
    
    const checkDependency = async (currentQuestionId: string, condition: any): Promise<boolean> => {
      if (!condition) return false;
      
      // 简单条件检查
      if ('question_id' in condition) {
        const dependentId = condition.question_id;
        if (dependentId === questionId) return true; // 找到循环
        if (visited.has(dependentId)) return false; // 已访问过，无循环
        
        visited.add(dependentId);
        path.push(dependentId);
        
        // 获取依赖题目的条件
        const dependentQuestion = await prismaClient.question.findFirst({
          where: { id: dependentId, paperId },
          select: { displayCondition: true }
        });
        
        if (dependentQuestion?.displayCondition) {
          return await checkDependency(dependentId, dependentQuestion.displayCondition);
        }
        return false;
      }
      
      // 复杂条件检查
      if ('operator' in condition && condition.conditions) {
        for (const subCondition of condition.conditions) {
          if (await checkDependency(currentQuestionId, subCondition)) {
            return true;
          }
        }
      }
      
      return false;
    };

    const hasCircular = await checkDependency(questionId, displayCondition);
    
    if (hasCircular) {
      return {
        hasCircularDependency: true,
        cyclePath: path,
        errorMessage: `检测到循环依赖: ${path.join(' -> ')}`
      };
    } else {
      return {
        hasCircularDependency: false
      };
    }
    
  } catch (error) {
    console.error('循环依赖检查错误:', error);
    return {
      hasCircularDependency: false,
      errorMessage: '循环依赖检查失败'
    };
  }
}

// 辅助函数：模拟条件逻辑计算
function simulateConditionLogic(questions: any[], answers: Record<string, string>) {
  const visibleQuestions = [];
  const hiddenQuestions = [];

  for (const question of questions) {
    const shouldShow = evaluateDisplayCondition(question.display_condition, answers);
    
    if (shouldShow) {
      visibleQuestions.push({
        id: question.id,
        title: question.title,
        question_order: question.question_order,
        reason: question.display_condition ? '满足显示条件' : '无显示条件限制'
      });
    } else {
      hiddenQuestions.push({
        id: question.id,
        title: question.title,
        question_order: question.question_order,
        reason: '不满足显示条件',
        condition: question.display_condition
      });
    }
  }

  return {
    visible_questions: visibleQuestions,
    hidden_questions: hiddenQuestions,
    simulation_answers: answers
  };
}

// 辅助函数：评估显示条件
function evaluateDisplayCondition(condition: any, answers: Record<string, string>): boolean {
  if (!condition) return true; // 无条件限制，始终显示

  // 简单条件
  if ('question_id' in condition) {
    const questionId = condition.question_id;
    const selectedOption = condition.selected_option;
    return answers[questionId] === selectedOption;
  }

  // 复杂条件
  if ('operator' in condition && condition.conditions) {
    const { operator, conditions } = condition;
    
    if (operator === 'AND') {
      return conditions.every((cond: any) => evaluateDisplayCondition(cond, answers));
    } else if (operator === 'OR') {
      return conditions.some((cond: any) => evaluateDisplayCondition(cond, answers));
    }
  }

  return false;
}

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
        const { DependencyValidator } = await import('../../utils/dependencyValidator');
        
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
 * 计算条件逻辑复杂度
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
 * 计算条件总数
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

/**
 * 计算嵌套层级
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