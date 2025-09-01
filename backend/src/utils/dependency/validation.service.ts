/**
 * 条件验证服务
 * 负责验证题目条件逻辑的有效性
 */

import { DisplayCondition, ComplexCondition, QuestionDependency } from './types';
import { CircularDetectionService } from './circular-detection.service';

export class ValidationService {
  private questions: Map<string, QuestionDependency> = new Map();

  constructor(questions: QuestionDependency[]) {
    this.questions = new Map(questions.map(q => [q.id, q]));
  }

  /**
   * 验证单个题目的条件逻辑是否有效
   */
  validateQuestionCondition(
    questionId: string, 
    condition: DisplayCondition | null
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!condition) {
      return { isValid: true, errors, warnings };
    }

    const question = this.questions.get(questionId);
    if (!question) {
      errors.push('题目不存在');
      return { isValid: false, errors, warnings };
    }

    // 递归验证条件
    this.validateConditionRecursive(condition, question.paper_id, errors, warnings);

    // 检查是否会形成循环依赖
    const tempQuestions = new Map(this.questions);
    tempQuestions.set(questionId, { ...question, display_condition: condition });
    
    const tempDetector = new CircularDetectionService(Array.from(tempQuestions.values()));
    const cycle = tempDetector.detectCircularDependency(questionId);
    
    if (cycle.length > 0) {
      errors.push(`会形成循环依赖: ${cycle.map(id => {
        const q = tempQuestions.get(id);
        return q ? q.title : id;
      }).join(' -> ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 递归验证条件逻辑
   */
  private validateConditionRecursive(
    condition: DisplayCondition,
    paperId: string,
    errors: string[],
    warnings: string[]
  ): void {
    // 简单条件验证
    if ('question_id' in condition) {
      const dependentQuestion = this.questions.get(condition.question_id);
      
      if (!dependentQuestion) {
        errors.push(`依赖的题目不存在: ${condition.question_id}`);
        return;
      }

      if (dependentQuestion.paper_id !== paperId) {
        errors.push(`不能依赖其他试卷的题目: ${dependentQuestion.title}`);
        return;
      }

      // 验证选项是否存在（这里需要题目的选项信息，暂时跳过）
      if (!condition.selected_option || condition.selected_option.trim() === '') {
        warnings.push(`依赖题目"${dependentQuestion.title}"的选项值为空`);
      }

      return;
    }

    // 复杂条件验证 (AND/OR)
    if ('operator' in condition) {
      if (!condition.operator || !['AND', 'OR'].includes(condition.operator)) {
        errors.push('无效的逻辑操作符，只支持 AND 和 OR');
        return;
      }

      if (!condition.conditions || !Array.isArray(condition.conditions)) {
        errors.push('复杂条件必须包含条件数组');
        return;
      }

      if (condition.conditions.length < 2) {
        warnings.push(`${condition.operator} 逻辑至少需要2个条件，当前只有 ${condition.conditions.length} 个`);
      }

      if (condition.conditions.length > 10) {
        warnings.push(`${condition.operator} 逻辑包含太多条件(${condition.conditions.length}个)，可能影响性能`);
      }

      // 递归验证子条件（支持嵌套）
      for (let i = 0; i < condition.conditions.length; i++) {
        const subCondition = condition.conditions[i];
        try {
          if ('question_id' in subCondition) {
            // 简单子条件验证
            this.validateConditionRecursive(subCondition, paperId, errors, warnings);
          } else if ('operator' in subCondition) {
            // 嵌套复杂条件验证
            this.validateNestedCondition(subCondition, paperId, errors, warnings, i + 1);
          }
        } catch (error) {
          errors.push(`第${i + 1}个子条件验证失败: ${error}`);
        }
      }

      return;
    }

    errors.push('无效的条件格式');
  }

  /**
   * 验证嵌套复杂条件
   */
  private validateNestedCondition(
    condition: ComplexCondition,
    paperId: string,
    errors: string[],
    warnings: string[],
    level: number
  ): void {
    const prefix = `第${level}层嵌套条件`;

    if (!condition.operator || !['AND', 'OR'].includes(condition.operator)) {
      errors.push(`${prefix}: 无效的逻辑操作符`);
      return;
    }

    if (!condition.conditions || !Array.isArray(condition.conditions)) {
      errors.push(`${prefix}: 必须包含条件数组`);
      return;
    }

    if (condition.conditions.length === 0) {
      errors.push(`${prefix}: 条件数组不能为空`);
      return;
    }

    if (level > 5) {
      warnings.push(`${prefix}: 嵌套层级过深(${level}层)，建议简化条件逻辑`);
    }

    // 检查条件复杂度
    const complexityScore = this.calculateConditionComplexity(condition);
    if (complexityScore > 50) {
      warnings.push(`${prefix}: 条件复杂度过高(${complexityScore})，可能影响性能和可维护性`);
    }

    // 递归验证嵌套条件的子条件
    for (let i = 0; i < condition.conditions.length; i++) {
      const subCondition = condition.conditions[i];
      if ('operator' in subCondition) {
        this.validateNestedCondition(subCondition, paperId, errors, warnings, level + 1);
      } else if ('question_id' in subCondition) {
        this.validateConditionRecursive(subCondition, paperId, errors, warnings);
      }
    }
  }

  /**
   * 计算条件复杂度评分
   */
  private calculateConditionComplexity(condition: DisplayCondition): number {
    if ('question_id' in condition) {
      return 1; // 简单条件复杂度为1
    }

    if ('operator' in condition && condition.conditions) {
      let complexity = 1; // 基础复杂度

      for (const subCondition of condition.conditions) {
        if ('operator' in subCondition) {
          // 嵌套条件增加额外复杂度
          complexity += this.calculateConditionComplexity(subCondition) * 2;
        } else {
          complexity += this.calculateConditionComplexity(subCondition);
        }
      }

      // AND 操作比 OR 操作复杂度略高
      if (condition.operator === 'AND') {
        complexity *= 1.2;
      }

      return Math.round(complexity);
    }

    return 0;
  }

  /**
   * 计算条件嵌套层级
   */
  calculateConditionNestingLevel(condition: DisplayCondition): number {
    if ('question_id' in condition) {
      return 0; // 简单条件没有嵌套
    }

    if ('operator' in condition && condition.conditions) {
      let maxNesting = 0;

      for (const subCondition of condition.conditions) {
        if ('operator' in subCondition) {
          const nesting = this.calculateConditionNestingLevel(subCondition) + 1;
          maxNesting = Math.max(maxNesting, nesting);
        }
      }

      return maxNesting;
    }

    return 0;
  }

  /**
   * 验证条件中引用的所有题目是否存在
   */
  validateConditionReferences(condition: DisplayCondition | null): {
    missingQuestions: string[];
    crossPaperReferences: string[];
  } {
    const missingQuestions: string[] = [];
    const crossPaperReferences: string[] = [];

    if (!condition) {
      return { missingQuestions, crossPaperReferences };
    }

    const collectReferences = (cond: DisplayCondition, paperId?: string): void => {
      if ('question_id' in cond) {
        const referencedQuestion = this.questions.get(cond.question_id);
        if (!referencedQuestion) {
          missingQuestions.push(cond.question_id);
        } else if (paperId && referencedQuestion.paper_id !== paperId) {
          crossPaperReferences.push(cond.question_id);
        }
      } else if ('operator' in cond && cond.conditions) {
        for (const subCond of cond.conditions) {
          collectReferences(subCond, paperId);
        }
      }
    };

    collectReferences(condition);

    return {
      missingQuestions: [...new Set(missingQuestions)],
      crossPaperReferences: [...new Set(crossPaperReferences)]
    };
  }
}