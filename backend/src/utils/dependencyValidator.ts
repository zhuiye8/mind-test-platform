/**
 * 题目条件依赖关系验证工具
 * 用于检测循环依赖和复杂条件逻辑验证
 */

// 简单条件类型
interface SimpleCondition {
  question_id: string;
  selected_option: string;
}

// 复杂条件类型 (AND/OR逻辑) - 支持嵌套
interface ComplexCondition {
  operator: 'AND' | 'OR';
  conditions: (SimpleCondition | ComplexCondition)[];
}

// 统一条件类型
type DisplayCondition = SimpleCondition | ComplexCondition;

// 题目依赖信息
interface QuestionDependency {
  id: string;
  title: string;
  display_condition: DisplayCondition | null;
  paper_id: string;
}

/**
 * 循环依赖检测器
 */
export class DependencyValidator {
  private questions: Map<string, QuestionDependency> = new Map();
  private visitedNodes: Set<string> = new Set();
  private recursionStack: Set<string> = new Set();
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
  private buildDependencyGraph(): void {
    this.dependencyGraph.clear();
    
    for (const question of this.questions.values()) {
      const dependencies = this.extractDependencies(question.display_condition);
      this.dependencyGraph.set(question.id, dependencies);
    }
  }

  /**
   * 从条件中提取依赖的题目ID列表（支持嵌套条件）
   */
  private extractDependencies(condition: DisplayCondition | null): string[] {
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
   * 检测从指定节点开始的循环依赖
   * 使用深度优先搜索（DFS）算法
   */
  public detectCircularDependency(startNodeId: string): string[] {
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
    const dependencies = this.dependencyGraph.get(nodeId) || [];
    for (const dependentId of dependencies) {
      if (this.questions.has(dependentId)) {
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
  public detectAllCircularDependencies(): Array<{
    cycle: string[];
    questionTitles: string[];
  }> {
    const allCycles: Array<{
      cycle: string[];
      questionTitles: string[];
    }> = [];
    const processedNodes = new Set<string>();

    for (const questionId of this.questions.keys()) {
      if (!processedNodes.has(questionId)) {
        const cycle = this.detectCircularDependency(questionId);
        if (cycle.length > 0) {
          // 避免重复检测同一个循环
          const cycleKey = cycle.sort().join('->');
          if (!allCycles.some((c: any) => c.cycle.sort().join('->') === cycleKey)) {
            allCycles.push({
              cycle,
              questionTitles: cycle.map(id => {
                const question = this.questions.get(id);
                return question ? question.title : `未知题目(${id})`;
              }),
            });
          }
          
          // 标记循环中的所有节点为已处理
          cycle.forEach(id => processedNodes.add(id));
        }
        processedNodes.add(questionId);
      }
    }

    return allCycles;
  }

  /**
   * 验证单个题目的条件逻辑是否有效
   */
  public validateQuestionCondition(
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
    
    const tempValidator = new DependencyValidator(Array.from(tempQuestions.values()));
    const cycle = tempValidator.detectCircularDependency(questionId);
    
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

    if (condition.conditions.length < 2) {
      warnings.push(`${prefix}: ${condition.operator} 逻辑至少需要2个条件`);
    }

    if (condition.conditions.length > 5) {
      warnings.push(`${prefix}: 嵌套条件过多(${condition.conditions.length}个)，建议简化`);
    }

    // 检查嵌套深度
    const maxNestingDepth = 3;
    if (level > maxNestingDepth) {
      errors.push(`${prefix}: 嵌套深度超过限制(最大${maxNestingDepth}层)`);
      return;
    }

    // 递归验证嵌套子条件
    for (let i = 0; i < condition.conditions.length; i++) {
      const subCondition = condition.conditions[i];
      try {
        if ('question_id' in subCondition) {
          this.validateConditionRecursive(subCondition, paperId, errors, warnings);
        } else if ('operator' in subCondition) {
          this.validateNestedCondition(subCondition, paperId, errors, warnings, level + 1);
        }
      } catch (error) {
        errors.push(`${prefix}第${i + 1}个子条件验证失败: ${error}`);
      }
    }
  }

  /**
   * 获取题目的所有依赖关系（直接和间接）
   */
  public getQuestionDependencies(questionId: string): {
    directDependencies: string[];
    indirectDependencies: string[];
    allDependencies: string[];
  } {
    const directDependencies = this.dependencyGraph.get(questionId) || [];
    const indirectDependencies: string[] = [];
    const visited = new Set<string>();
    
    // 广度优先搜索找出所有间接依赖
    const queue = [...directDependencies];
    visited.add(questionId);
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      
      visited.add(currentId);
      const currentDependencies = this.dependencyGraph.get(currentId) || [];
      
      for (const depId of currentDependencies) {
        if (!visited.has(depId) && !directDependencies.includes(depId)) {
          indirectDependencies.push(depId);
          queue.push(depId);
        }
      }
    }

    return {
      directDependencies,
      indirectDependencies: [...new Set(indirectDependencies)],
      allDependencies: [...new Set([...directDependencies, ...indirectDependencies])],
    };
  }

  /**
   * 获取依赖关系图的可视化数据（增强版）
   */
  public getDependencyGraphData(): {
    nodes: Array<{
      id: string;
      title: string;
      hasCondition: boolean;
      dependencyCount: number;
      dependentCount: number; // 被依赖的数量
      conditionType: 'none' | 'simple' | 'complex' | 'nested';
      nestingLevel: number;
      complexity: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
      type: 'simple' | 'complex' | 'nested';
      weight: number; // 边的权重（用于布局）
    }>;
    clusters: Array<{
      id: string;
      label: string;
      nodeIds: string[];
      type: 'isolated' | 'chain' | 'tree' | 'complex';
    }>;
    metrics: {
      totalNodes: number;
      totalEdges: number;
      cycleCount: number;
      maxNestingLevel: number;
      averageComplexity: number;
      isolatedNodes: number;
    };
  } {
    // 构建反向依赖映射（谁依赖当前节点）
    const reverseDependencyGraph = new Map<string, string[]>();
    for (const [questionId, dependencies] of this.dependencyGraph.entries()) {
      for (const depId of dependencies) {
        if (!reverseDependencyGraph.has(depId)) {
          reverseDependencyGraph.set(depId, []);
        }
        reverseDependencyGraph.get(depId)!.push(questionId);
      }
    }

    // 构建节点数据
    const nodes = Array.from(this.questions.values()).map(question => {
      const dependencies = this.dependencyGraph.get(question.id) || [];
      const dependents = reverseDependencyGraph.get(question.id) || [];
      
      let conditionType: 'none' | 'simple' | 'complex' | 'nested' = 'none';
      let nestingLevel = 0;
      let complexity = 0;

      if (question.display_condition) {
        if ('question_id' in question.display_condition) {
          conditionType = 'simple';
          complexity = 1;
        } else if ('operator' in question.display_condition) {
          nestingLevel = this.calculateConditionNestingLevel(question.display_condition);
          conditionType = nestingLevel > 0 ? 'nested' : 'complex';
          complexity = this.calculateConditionComplexity(question.display_condition);
        }
      }

      return {
        id: question.id,
        title: question.title,
        hasCondition: !!question.display_condition,
        dependencyCount: dependencies.length,
        dependentCount: dependents.length,
        conditionType,
        nestingLevel,
        complexity,
      };
    });

    // 构建边数据
    const edges: Array<{
      from: string;
      to: string;
      type: 'simple' | 'complex' | 'nested';
      weight: number;
    }> = [];

    for (const [questionId, dependencies] of this.dependencyGraph.entries()) {
      const question = this.questions.get(questionId);
      if (!question || !question.display_condition) continue;

      let edgeType: 'simple' | 'complex' | 'nested' = 'simple';
      let edgeWeight = 1;

      if ('operator' in question.display_condition) {
        const nestingLevel = this.calculateConditionNestingLevel(question.display_condition);
        edgeType = nestingLevel > 0 ? 'nested' : 'complex';
        edgeWeight = 1 + nestingLevel * 0.5; // 嵌套越深权重越大
      }
      
      for (const depId of dependencies) {
        edges.push({
          from: depId,
          to: questionId,
          type: edgeType,
          weight: edgeWeight,
        });
      }
    }

    // 检测集群
    const clusters = this.detectClusters(nodes, edges);

    // 计算指标
    const cycles = this.detectAllCircularDependencies();
    const complexities = nodes.map(n => n.complexity);
    const nestingLevels = nodes.map(n => n.nestingLevel);
    const isolatedNodes = nodes.filter(n => n.dependencyCount === 0 && n.dependentCount === 0);

    const metrics = {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      cycleCount: cycles.length,
      maxNestingLevel: Math.max(...nestingLevels, 0),
      averageComplexity: complexities.length > 0 ? 
        complexities.reduce((sum, c) => sum + c, 0) / complexities.length : 0,
      isolatedNodes: isolatedNodes.length,
    };

    return { nodes, edges, clusters, metrics };
  }

  /**
   * 计算条件的嵌套层级
   */
  private calculateConditionNestingLevel(condition: DisplayCondition): number {
    if (!condition || 'question_id' in condition) {
      return 0;
    }

    if ('operator' in condition && condition.conditions) {
      let maxDepth = 0;
      for (const subCondition of condition.conditions) {
        if ('operator' in subCondition) {
          maxDepth = Math.max(maxDepth, this.calculateConditionNestingLevel(subCondition) + 1);
        }
      }
      return maxDepth;
    }

    return 0;
  }

  /**
   * 计算单个条件的复杂度
   */
  private calculateConditionComplexity(condition: DisplayCondition): number {
    if (!condition) return 0;

    if ('question_id' in condition) {
      return 1;
    }

    if ('operator' in condition && condition.conditions) {
      let totalComplexity = 1; // 基础复杂度
      for (const subCondition of condition.conditions) {
        totalComplexity += this.calculateConditionComplexity(subCondition);
      }
      
      // 嵌套惩罚
      const nestingLevel = this.calculateConditionNestingLevel(condition);
      totalComplexity += nestingLevel * 2;
      
      return totalComplexity;
    }

    return 0;
  }

  /**
   * 检测依赖关系集群
   */
  private detectClusters(
    nodes: any[], 
    edges: any[]
  ): Array<{
    id: string;
    label: string;
    nodeIds: string[];
    type: 'isolated' | 'chain' | 'tree' | 'complex';
  }> {
    const clusters: any[] = [];

    // 使用并查集算法检测连通分量
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    // 初始化并查集
    for (const node of nodes) {
      parent.set(node.id, node.id);
      rank.set(node.id, 0);
    }

    // 查找根节点
    const find = (x: string): string => {
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)!));
      }
      return parent.get(x)!;
    };

    // 合并集合
    const union = (x: string, y: string): void => {
      const rootX = find(x);
      const rootY = find(y);
      
      if (rootX !== rootY) {
        if (rank.get(rootX)! < rank.get(rootY)!) {
          parent.set(rootX, rootY);
        } else if (rank.get(rootX)! > rank.get(rootY)!) {
          parent.set(rootY, rootX);
        } else {
          parent.set(rootY, rootX);
          rank.set(rootX, rank.get(rootX)! + 1);
        }
      }
    };

    // 将有边连接的节点归并到同一集群
    for (const edge of edges) {
      union(edge.from, edge.to);
    }

    // 收集集群
    const clusterMap = new Map<string, string[]>();
    for (const node of nodes) {
      const root = find(node.id);
      if (!clusterMap.has(root)) {
        clusterMap.set(root, []);
      }
      clusterMap.get(root)!.push(node.id);
    }

    // 分析集群类型
    let clusterIndex = 0;
    for (const [_root, nodeIds] of clusterMap.entries()) {
      if (nodeIds.length === 1) {
        clusters.push({
          id: `cluster-${clusterIndex++}`,
          label: `孤立节点`,
          nodeIds,
          type: 'isolated',
        });
      } else {
        const clusterEdges = edges.filter(e => 
          nodeIds.includes(e.from) && nodeIds.includes(e.to)
        );
        
        let clusterType: 'chain' | 'tree' | 'complex' = 'complex';
        
        // 判断是否为链状结构
        if (clusterEdges.length === nodeIds.length - 1) {
          const inDegree = new Map<string, number>();
          const outDegree = new Map<string, number>();
          
          for (const nodeId of nodeIds) {
            inDegree.set(nodeId, 0);
            outDegree.set(nodeId, 0);
          }
          
          for (const edge of clusterEdges) {
            outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
            inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
          }
          
          const hasChainStructure = nodeIds.every(nodeId => 
            (inDegree.get(nodeId)! <= 1 && outDegree.get(nodeId)! <= 1)
          );
          
          if (hasChainStructure) {
            clusterType = 'chain';
          } else {
            clusterType = 'tree';
          }
        }

        clusters.push({
          id: `cluster-${clusterIndex++}`,
          label: `${clusterType === 'chain' ? '链式' : clusterType === 'tree' ? '树形' : '复杂'}结构 (${nodeIds.length}题)`,
          nodeIds,
          type: clusterType,
        });
      }
    }

    return clusters;
  }
}

/**
 * 快速检测单个题目是否会形成循环依赖
 */
export const quickCircularDependencyCheck = async (
  questionId: string,
  condition: DisplayCondition | null,
  paperId: string,
  prisma: any
): Promise<{
  hasCircularDependency: boolean;
  cyclePath: string[];
  errorMessage?: string;
}> => {
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
    const result: {
      hasCircularDependency: boolean;
      cyclePath: string[];
      errorMessage?: string;
    } = {
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