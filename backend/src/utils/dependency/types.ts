/**
 * 依赖验证器类型定义
 */

// 简单条件类型
export interface SimpleCondition {
  question_id: string;
  selected_option: string;
}

// 复杂条件类型 (AND/OR逻辑) - 支持嵌套
export interface ComplexCondition {
  operator: 'AND' | 'OR';
  conditions: (SimpleCondition | ComplexCondition)[];
}

// 统一条件类型
export type DisplayCondition = SimpleCondition | ComplexCondition;

// 题目依赖信息
export interface QuestionDependency {
  id: string;
  title: string;
  display_condition: DisplayCondition | null;
  paper_id: string;
}

// 循环依赖检测结果
export interface CircularDependencyResult {
  hasCircularDependency: boolean;
  cyclePath: string[];
  errorMessage?: string;
}

// 依赖分析结果
export interface DependencyAnalysis {
  directDependencies: string[];
  indirectDependencies: string[];
  totalDependencies: number;
  dependencyChain: string[];
}

// 可视化节点
export interface VisualizationNode {
  id: string;
  title: string;
  dependencies: string[];
  incomingDependencies: string[];
  level: number;
  complexityScore: number;
  nestingLevel: number;
  hasCondition: boolean;
  conditionType: 'simple' | 'complex' | 'none';
  clusterId?: number;
}

// 可视化数据
export interface DependencyGraphData {
  nodes: VisualizationNode[];
  edges: Array<{
    from: string;
    to: string;
    type: 'simple' | 'complex';
  }>;
  clusters: Array<{
    id: number;
    nodes: string[];
    isStronglyConnected: boolean;
  }>;
  statistics: {
    totalQuestions: number;
    questionsWithConditions: number;
    totalDependencies: number;
    circularDependencies: number;
    maxNestingLevel: number;
    avgComplexity: number;
  };
}