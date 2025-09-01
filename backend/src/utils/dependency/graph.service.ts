/**
 * 依赖关系图构建服务
 * 负责构建和管理题目依赖关系图
 */

import { DisplayCondition, QuestionDependency } from './types';

export class DependencyGraphService {
  private questions: Map<string, QuestionDependency> = new Map();
  private dependencyGraph: Map<string, string[]> = new Map();

  constructor(questions: QuestionDependency[]) {
    // 构建题目映射
    this.questions = new Map(questions.map(q => [q.id, q]));
    // 构建依赖图
    this.buildDependencyGraph();
  }

  /**
   * 构建依赖关系图
   */
  buildDependencyGraph(): void {
    this.dependencyGraph.clear();
    
    for (const question of this.questions.values()) {
      const dependencies = this.extractDependencies(question.display_condition);
      this.dependencyGraph.set(question.id, dependencies);
    }
  }

  /**
   * 从条件中提取依赖的题目ID列表（支持嵌套条件）
   */
  extractDependencies(condition: DisplayCondition | null): string[] {
    if (!condition) return [];

    // 简单条件
    if ('question_id' in condition) {
      return [condition.question_id];
    }

    // 复杂条件 (AND/OR) - 递归处理嵌套条件
    if ('operator' in condition && condition.conditions) {
      const dependencies: string[] = [];
      for (const subCondition of condition.conditions) {
        if ('question_id' in subCondition) {
          // 简单子条件
          dependencies.push(subCondition.question_id);
        } else if ('operator' in subCondition) {
          // 嵌套复杂条件，递归提取
          dependencies.push(...this.extractDependencies(subCondition));
        }
      }
      return [...new Set(dependencies)]; // 去重
    }

    return [];
  }

  /**
   * 获取题目的所有依赖关系（直接和间接）
   */
  getQuestionDependencies(questionId: string): {
    directDependencies: string[];
    indirectDependencies: string[];
    totalDependencies: number;
    dependencyChain: string[];
  } {
    const directDependencies = this.dependencyGraph.get(questionId) || [];
    const visited = new Set<string>();
    const dependencyChain: string[] = [];

    // 递归收集所有间接依赖
    const collectIndirectDependencies = (currentId: string, depth: number = 0): Set<string> => {
      if (visited.has(currentId) || depth > 10) { // 防止深度过大
        return new Set();
      }

      visited.add(currentId);
      dependencyChain.push(currentId);

      const allDependencies = new Set<string>();
      const currentDependencies = this.dependencyGraph.get(currentId) || [];

      for (const depId of currentDependencies) {
        if (this.questions.has(depId)) {
          allDependencies.add(depId);
          const indirectDeps = collectIndirectDependencies(depId, depth + 1);
          indirectDeps.forEach(id => allDependencies.add(id));
        }
      }

      return allDependencies;
    };

    const allDependencies = collectIndirectDependencies(questionId);
    const indirectDependencies = Array.from(allDependencies).filter(
      id => !directDependencies.includes(id)
    );

    return {
      directDependencies,
      indirectDependencies,
      totalDependencies: allDependencies.size,
      dependencyChain: dependencyChain.slice(1), // 移除起始节点
    };
  }

  /**
   * 获取依赖关系图
   */
  getDependencyGraph(): Map<string, string[]> {
    return this.dependencyGraph;
  }

  /**
   * 获取题目映射
   */
  getQuestions(): Map<string, QuestionDependency> {
    return this.questions;
  }

  /**
   * 检测依赖关系集群
   */
  detectClusters(stronglyConnectedOnly: boolean = true): Array<{
    id: number;
    nodes: string[];
    isStronglyConnected: boolean;
  }> {
    const clusters: Array<{
      id: number;
      nodes: string[];
      isStronglyConnected: boolean;
    }> = [];
    const visited = new Set<string>();
    let clusterId = 0;

    // 使用Tarjan算法检测强连通分量（简化版）
    for (const questionId of this.questions.keys()) {
      if (!visited.has(questionId)) {
        const cluster = this.findConnectedComponent(questionId, visited);
        
        if (cluster.length > 1) {
          const isStronglyConnected = this.isStronglyConnectedComponent(cluster);
          
          if (!stronglyConnectedOnly || isStronglyConnected) {
            clusters.push({
              id: clusterId++,
              nodes: cluster,
              isStronglyConnected,
            });
          }
        }
      }
    }

    return clusters;
  }

  /**
   * 查找连通分量
   */
  private findConnectedComponent(startNode: string, visited: Set<string>): string[] {
    const component: string[] = [];
    const stack: string[] = [startNode];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (!visited.has(current)) {
        visited.add(current);
        component.push(current);

        // 添加所有依赖节点
        const dependencies = this.dependencyGraph.get(current) || [];
        for (const dep of dependencies) {
          if (this.questions.has(dep) && !visited.has(dep)) {
            stack.push(dep);
          }
        }

        // 添加所有依赖于当前节点的节点
        for (const [nodeId, deps] of this.dependencyGraph.entries()) {
          if (deps.includes(current) && !visited.has(nodeId)) {
            stack.push(nodeId);
          }
        }
      }
    }

    return component;
  }

  /**
   * 检查是否为强连通分量
   */
  private isStronglyConnectedComponent(nodes: string[]): boolean {
    if (nodes.length <= 1) return false;

    // 检查是否每个节点都能到达其他所有节点
    for (const startNode of nodes) {
      const reachable = new Set<string>();
      const queue: string[] = [startNode];
      reachable.add(startNode);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const dependencies = this.dependencyGraph.get(current) || [];

        for (const dep of dependencies) {
          if (nodes.includes(dep) && !reachable.has(dep)) {
            reachable.add(dep);
            queue.push(dep);
          }
        }
      }

      if (reachable.size !== nodes.length) {
        return false;
      }
    }

    return true;
  }
}