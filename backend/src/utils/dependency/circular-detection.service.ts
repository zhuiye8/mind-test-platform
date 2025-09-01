/**
 * 循环依赖检测服务
 * 负责检测题目之间的循环依赖关系
 */

import { QuestionDependency } from './types';
import { DependencyGraphService } from './graph.service';

export class CircularDetectionService {
  private graphService: DependencyGraphService;
  private visitedNodes: Set<string> = new Set();
  private recursionStack: Set<string> = new Set();

  constructor(questions: QuestionDependency[]) {
    this.graphService = new DependencyGraphService(questions);
  }

  /**
   * 检测从指定节点开始的循环依赖
   * 使用深度优先搜索（DFS）算法
   */
  detectCircularDependency(startNodeId: string): string[] {
    this.visitedNodes.clear();
    this.recursionStack.clear();

    const cycle = this.dfsDetectCycle(startNodeId, []);
    return cycle;
  }

  /**
   * DFS检测循环依赖的核心算法
   */
  private dfsDetectCycle(nodeId: string, path: string[]): string[] {
    if (this.recursionStack.has(nodeId)) {
      // 找到循环，返回循环路径
      const cycleStartIndex = path.indexOf(nodeId);
      return [...path.slice(cycleStartIndex), nodeId];
    }

    if (this.visitedNodes.has(nodeId)) {
      return []; // 已访问过且无循环
    }

    // 标记当前节点
    this.visitedNodes.add(nodeId);
    this.recursionStack.add(nodeId);
    const currentPath = [...path, nodeId];

    // 检查所有依赖节点
    const dependencyGraph = this.graphService.getDependencyGraph();
    const questions = this.graphService.getQuestions();
    const dependencies = dependencyGraph.get(nodeId) || [];
    
    for (const dependentId of dependencies) {
      if (questions.has(dependentId)) {
        const cycle = this.dfsDetectCycle(dependentId, currentPath);
        if (cycle.length > 0) {
          return cycle; // 发现循环
        }
      }
    }

    // 回溯
    this.recursionStack.delete(nodeId);
    return [];
  }

  /**
   * 检测整个题目集合中的所有循环依赖
   */
  detectAllCircularDependencies(): Array<{
    cycle: string[];
    questionTitles: string[];
  }> {
    const allCycles: Array<{
      cycle: string[];
      questionTitles: string[];
    }> = [];
    const processedNodes = new Set<string>();
    const questions = this.graphService.getQuestions();

    for (const questionId of questions.keys()) {
      if (!processedNodes.has(questionId)) {
        const cycle = this.detectCircularDependency(questionId);
        if (cycle.length > 0) {
          // 将循环中的所有节点标记为已处理，避免重复检测
          cycle.forEach(nodeId => processedNodes.add(nodeId));

          // 获取题目标题
          const questionTitles = cycle
            .map(id => questions.get(id)?.title || `未知题目(${id})`)
            .filter(Boolean);

          allCycles.push({
            cycle,
            questionTitles,
          });
        }
      }
    }

    return allCycles;
  }

  /**
   * 检查两个题目之间是否存在相互依赖
   */
  hasMutualDependency(questionId1: string, questionId2: string): boolean {
    
    // 检查A是否依赖B
    const dependencies1 = this.getAllDependencies(questionId1);
    const hasDep1to2 = dependencies1.has(questionId2);
    
    // 检查B是否依赖A
    const dependencies2 = this.getAllDependencies(questionId2);
    const hasDep2to1 = dependencies2.has(questionId1);
    
    return hasDep1to2 && hasDep2to1;
  }

  /**
   * 获取题目的所有依赖（直接和间接）
   */
  private getAllDependencies(questionId: string): Set<string> {
    const visited = new Set<string>();
    const dependencies = new Set<string>();
    const dependencyGraph = this.graphService.getDependencyGraph();
    const questions = this.graphService.getQuestions();

    const collectDependencies = (currentId: string, depth: number = 0): void => {
      if (visited.has(currentId) || depth > 20) { // 防止无限递归
        return;
      }

      visited.add(currentId);
      const currentDeps = dependencyGraph.get(currentId) || [];

      for (const depId of currentDeps) {
        if (questions.has(depId)) {
          dependencies.add(depId);
          collectDependencies(depId, depth + 1);
        }
      }
    };

    collectDependencies(questionId);
    return dependencies;
  }

  /**
   * 验证添加新依赖是否会造成循环
   */
  wouldCreateCycle(fromQuestionId: string, toQuestionId: string): boolean {
    // 临时添加依赖关系
    const dependencyGraph = this.graphService.getDependencyGraph();
    const originalDeps = dependencyGraph.get(fromQuestionId) || [];
    
    // 如果已经存在依赖，不会创建新的循环
    if (originalDeps.includes(toQuestionId)) {
      return false;
    }
    
    // 临时添加依赖
    dependencyGraph.set(fromQuestionId, [...originalDeps, toQuestionId]);
    
    // 检测是否会产生循环
    const cycle = this.detectCircularDependency(fromQuestionId);
    const wouldCreate = cycle.length > 0;
    
    // 恢复原始依赖关系
    dependencyGraph.set(fromQuestionId, originalDeps);
    
    return wouldCreate;
  }
}