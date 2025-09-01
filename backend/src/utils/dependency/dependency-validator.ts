/**
 * 主要的依赖验证器类
 * 整合所有依赖验证相关的服务
 */

import { DisplayCondition, QuestionDependency, DependencyGraphData, DependencyAnalysis } from './types';
import { DependencyGraphService } from './graph.service';
import { CircularDetectionService } from './circular-detection.service';
import { ValidationService } from './validation.service';
import { VisualizationService } from './visualization.service';

/**
 * 循环依赖检测器 - 主类
 */
export class DependencyValidator {
  private graphService: DependencyGraphService;
  private circularDetector: CircularDetectionService;
  private validator: ValidationService;
  private visualizer: VisualizationService;

  constructor(questions: QuestionDependency[]) {
    this.graphService = new DependencyGraphService(questions);
    this.circularDetector = new CircularDetectionService(questions);
    this.validator = new ValidationService(questions);
    this.visualizer = new VisualizationService(questions);
  }

  /**
   * 检测从指定节点开始的循环依赖
   */
  detectCircularDependency(startNodeId: string): string[] {
    return this.circularDetector.detectCircularDependency(startNodeId);
  }

  /**
   * 检测整个题目集合中的所有循环依赖
   */
  detectAllCircularDependencies(): Array<{
    cycle: string[];
    questionTitles: string[];
  }> {
    return this.circularDetector.detectAllCircularDependencies();
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
    return this.validator.validateQuestionCondition(questionId, condition);
  }

  /**
   * 获取题目的所有依赖关系（直接和间接）
   */
  getQuestionDependencies(questionId: string): DependencyAnalysis {
    return this.graphService.getQuestionDependencies(questionId);
  }

  /**
   * 获取依赖关系图的可视化数据
   */
  getDependencyGraphData(): DependencyGraphData {
    return this.visualizer.getDependencyGraphData();
  }

  /**
   * 生成Mermaid图表代码
   */
  generateMermaidDiagram(): string {
    return this.visualizer.generateMermaidDiagram();
  }

  /**
   * 生成DOT图表代码（用于Graphviz）
   */
  generateDotDiagram(): string {
    return this.visualizer.generateDotDiagram();
  }

  /**
   * 获取依赖统计报告
   */
  getDependencyReport(): {
    summary: {
      totalQuestions: number;
      questionsWithConditions: number;
      simpleConditions: number;
      complexConditions: number;
      nestedConditions: number;
      circularDependencies: number;
      isolatedQuestions: number;
    };
    complexityAnalysis: {
      averageComplexity: number;
      maxComplexity: number;
      maxNestingLevel: number;
      highComplexityQuestions: Array<{
        id: string;
        title: string;
        complexity: number;
        nestingLevel: number;
      }>;
    };
    circularDependencies: Array<{
      cycle: string[];
      questionTitles: string[];
    }>;
    recommendations: string[];
  } {
    return this.visualizer.getDependencyReport();
  }

  /**
   * 检查两个题目之间是否存在相互依赖
   */
  hasMutualDependency(questionId1: string, questionId2: string): boolean {
    return this.circularDetector.hasMutualDependency(questionId1, questionId2);
  }

  /**
   * 验证添加新依赖是否会造成循环
   */
  wouldCreateCycle(fromQuestionId: string, toQuestionId: string): boolean {
    return this.circularDetector.wouldCreateCycle(fromQuestionId, toQuestionId);
  }

  /**
   * 验证条件中引用的所有题目是否存在
   */
  validateConditionReferences(condition: DisplayCondition | null): {
    missingQuestions: string[];
    crossPaperReferences: string[];
  } {
    return this.validator.validateConditionReferences(condition);
  }

  /**
   * 计算条件嵌套层级
   */
  calculateConditionNestingLevel(condition: DisplayCondition): number {
    return this.validator.calculateConditionNestingLevel(condition);
  }
}