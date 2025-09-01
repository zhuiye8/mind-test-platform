/**
 * 依赖验证工具函数
 */

import { DisplayCondition, QuestionDependency, CircularDependencyResult } from './types';
import { DependencyValidator } from './dependency-validator';

/**
 * 快速检测单个题目是否会形成循环依赖
 */
export const quickCircularDependencyCheck = async (
  questionId: string,
  condition: DisplayCondition | null,
  paperId: string,
  prisma: any
): Promise<CircularDependencyResult> => {
  try {
    if (!condition) {
      return { hasCircularDependency: false, cyclePath: [] };
    }

    // 获取试卷中所有题目的依赖信息
    const questions = await prisma.question.findMany({
      where: { paperId },
      select: {
        id: true,
        title: true,
        displayCondition: true,
      },
    });

    // 构建题目依赖数据
    const questionDependencies: QuestionDependency[] = questions.map((q: any) => ({
      id: q.id,
      title: q.title,
      display_condition: q.displayCondition,
      paper_id: paperId,
    }));

    // 如果是新题目或更新条件，需要添加/更新对应的依赖信息
    const existingIndex = questionDependencies.findIndex(q => q.id === questionId);
    if (existingIndex >= 0) {
      questionDependencies[existingIndex].display_condition = condition;
    } else {
      questionDependencies.push({
        id: questionId,
        title: '新题目',
        display_condition: condition,
        paper_id: paperId,
      });
    }

    const validator = new DependencyValidator(questionDependencies);
    const cycle = validator.detectCircularDependency(questionId);

    const hasCircularDependency = cycle.length > 0;
    const result: CircularDependencyResult = {
      hasCircularDependency,
      cyclePath: cycle,
    };
    
    if (hasCircularDependency) {
      result.errorMessage = `检测到循环依赖: ${cycle.join(' -> ')}`;
    }
    
    return result;
  } catch (error) {
    console.error('循环依赖检测错误:', error);
    return {
      hasCircularDependency: false,
      cyclePath: [],
      errorMessage: '依赖检测失败',
    };
  }
};