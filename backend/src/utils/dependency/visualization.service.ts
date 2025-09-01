/**
 * 依赖关系可视化服务
 * 负责生成依赖关系图的可视化数据
 */

import { DisplayCondition, QuestionDependency, DependencyGraphData, VisualizationNode } from './types';
import { DependencyGraphService } from './graph.service';
import { CircularDetectionService } from './circular-detection.service';
import { ValidationService } from './validation.service';

export class VisualizationService {
  private graphService: DependencyGraphService;
  private circularDetector: CircularDetectionService;
  private validator: ValidationService;

  constructor(questions: QuestionDependency[]) {
    this.graphService = new DependencyGraphService(questions);
    this.circularDetector = new CircularDetectionService(questions);
    this.validator = new ValidationService(questions);
  }

  /**
   * 获取依赖关系图的可视化数据（增强版）
   */
  getDependencyGraphData(): DependencyGraphData {
    const questions = this.graphService.getQuestions();
    const dependencyGraph = this.graphService.getDependencyGraph();

    // 构建反向依赖映射（谁依赖当前节点）
    const reverseDependencyGraph = new Map<string, string[]>();
    for (const [questionId, dependencies] of dependencyGraph.entries()) {
      for (const depId of dependencies) {
        if (!reverseDependencyGraph.has(depId)) {
          reverseDependencyGraph.set(depId, []);
        }
        reverseDependencyGraph.get(depId)!.push(questionId);
      }
    }

    // 构建节点数据
    const nodes: VisualizationNode[] = Array.from(questions.values()).map((question, index) => {
      const dependencies = dependencyGraph.get(question.id) || [];
      const dependents = reverseDependencyGraph.get(question.id) || [];
      
      let conditionType: 'simple' | 'complex' | 'none' = 'none';
      let nestingLevel = 0;
      let complexity = 0;

      if (question.display_condition) {
        if ('question_id' in question.display_condition) {
          conditionType = 'simple';
          complexity = 1;
        } else if ('operator' in question.display_condition) {
          nestingLevel = this.validator.calculateConditionNestingLevel(question.display_condition);
          conditionType = 'complex';
          complexity = this.calculateConditionComplexity(question.display_condition);
        }
      }

      return {
        id: question.id,
        title: question.title,
        dependencies,
        incomingDependencies: dependents,
        level: index, // 简化的层级计算
        complexityScore: complexity,
        nestingLevel,
        hasCondition: !!question.display_condition,
        conditionType,
      };
    });

    // 构建边数据
    const edges: Array<{
      from: string;
      to: string;
      type: 'simple' | 'complex';
    }> = [];

    for (const node of nodes) {
      for (const depId of node.dependencies) {
        const sourceQuestion = questions.get(node.id);
        let edgeType: 'simple' | 'complex' = 'simple';
        
        if (sourceQuestion?.display_condition && 'operator' in sourceQuestion.display_condition) {
          edgeType = 'complex';
        }

        edges.push({
          from: node.id,
          to: depId,
          type: edgeType,
        });
      }
    }

    // 检测集群
    const clusters = this.graphService.detectClusters().map(cluster => ({
      id: cluster.id,
      nodes: cluster.nodes,
      isStronglyConnected: cluster.isStronglyConnected,
    }));

    // 检测循环依赖
    const allCycles = this.circularDetector.detectAllCircularDependencies();

    // 计算统计信息
    const statistics = {
      totalQuestions: nodes.length,
      questionsWithConditions: nodes.filter(n => n.hasCondition).length,
      totalDependencies: edges.length,
      circularDependencies: allCycles.length,
      maxNestingLevel: Math.max(...nodes.map(n => n.nestingLevel), 0),
      avgComplexity: nodes.length > 0 
        ? Math.round(nodes.reduce((sum, n) => sum + n.complexityScore, 0) / nodes.length * 100) / 100 
        : 0,
    };

    return {
      nodes,
      edges,
      clusters,
      statistics,
    };
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
   * 生成Mermaid图表代码
   */
  generateMermaidDiagram(): string {
    const questions = this.graphService.getQuestions();
    const dependencyGraph = this.graphService.getDependencyGraph();
    const allCycles = this.circularDetector.detectAllCircularDependencies();

    let mermaidCode = 'graph TD\n';
    
    // 添加节点
    for (const question of questions.values()) {
      const hasCondition = !!question.display_condition;
      const nodeStyle = hasCondition ? '[条件题目]' : '[普通题目]';
      const shortTitle = question.title.length > 15 
        ? question.title.substring(0, 15) + '...' 
        : question.title;
      
      mermaidCode += `  ${question.id}${nodeStyle.replace('[条件题目]', `["📋 ${shortTitle}"]`).replace('[普通题目]', `["📝 ${shortTitle}"]`)}\n`;
    }

    // 添加边
    for (const [questionId, dependencies] of dependencyGraph.entries()) {
      for (const depId of dependencies) {
        if (questions.has(depId)) {
          mermaidCode += `  ${questionId} --> ${depId}\n`;
        }
      }
    }

    // 标记循环依赖
    if (allCycles.length > 0) {
      mermaidCode += '\n  %% 循环依赖警告\n';
      for (const { cycle } of allCycles) {
        mermaidCode += `  %% 循环: ${cycle.join(' -> ')}\n`;
      }
    }

    // 添加样式
    mermaidCode += '\n  %% 样式定义\n';
    mermaidCode += '  classDef conditionNode fill:#e1f5fe,stroke:#0277bd,stroke-width:2px\n';
    mermaidCode += '  classDef cycleNode fill:#ffebee,stroke:#c62828,stroke-width:3px\n';

    return mermaidCode;
  }

  /**
   * 生成DOT图表代码（用于Graphviz）
   */
  generateDotDiagram(): string {
    const questions = this.graphService.getQuestions();
    const dependencyGraph = this.graphService.getDependencyGraph();
    const allCycles = this.circularDetector.detectAllCircularDependencies();
    const cycleNodes = new Set(allCycles.flatMap(c => c.cycle));

    let dotCode = 'digraph DependencyGraph {\n';
    dotCode += '  rankdir=TB;\n';
    dotCode += '  node [shape=box, style=rounded];\n\n';

    // 添加节点
    for (const question of questions.values()) {
      const hasCondition = !!question.display_condition;
      const inCycle = cycleNodes.has(question.id);
      const shortTitle = question.title.length > 20 
        ? question.title.substring(0, 20) + '...' 
        : question.title;

      let nodeAttrs = 'label="' + shortTitle.replace('"', '\\"') + '"';
      
      if (inCycle) {
        nodeAttrs += ', fillcolor="#ffebee", style="filled,rounded"';
      } else if (hasCondition) {
        nodeAttrs += ', fillcolor="#e1f5fe", style="filled,rounded"';
      }

      dotCode += `  "${question.id}" [${nodeAttrs}];\n`;
    }

    dotCode += '\n';

    // 添加边
    for (const [questionId, dependencies] of dependencyGraph.entries()) {
      for (const depId of dependencies) {
        if (questions.has(depId)) {
          dotCode += `  "${questionId}" -> "${depId}";\n`;
        }
      }
    }

    dotCode += '}\n';

    return dotCode;
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
    const graphData = this.getDependencyGraphData();
    const allCycles = this.circularDetector.detectAllCircularDependencies();
    
    const simpleConditions = graphData.nodes.filter(n => n.conditionType === 'simple').length;
    const complexConditions = graphData.nodes.filter(n => n.conditionType === 'complex').length;
    const nestedConditions = graphData.nodes.filter(n => n.nestingLevel > 0).length;
    const isolatedQuestions = graphData.nodes.filter(n => 
      n.dependencies.length === 0 && n.incomingDependencies.length === 0
    ).length;

    const complexities = graphData.nodes.map(n => n.complexityScore).filter(c => c > 0);
    const maxComplexity = Math.max(...complexities, 0);
    const averageComplexity = complexities.length > 0 
      ? Math.round(complexities.reduce((sum, c) => sum + c, 0) / complexities.length * 100) / 100
      : 0;

    const highComplexityQuestions = graphData.nodes
      .filter(n => n.complexityScore > 10)
      .sort((a, b) => b.complexityScore - a.complexityScore)
      .slice(0, 5)
      .map(n => ({
        id: n.id,
        title: n.title,
        complexity: n.complexityScore,
        nestingLevel: n.nestingLevel
      }));

    // 生成建议
    const recommendations: string[] = [];
    
    if (allCycles.length > 0) {
      recommendations.push(`发现${allCycles.length}个循环依赖，建议立即修复以避免逻辑错误`);
    }

    if (maxComplexity > 20) {
      recommendations.push('存在高复杂度条件逻辑，建议简化或拆分复杂条件');
    }

    if (graphData.statistics.maxNestingLevel > 3) {
      recommendations.push('条件嵌套层级过深，建议减少嵌套以提高可读性');
    }

    if (isolatedQuestions > graphData.nodes.length * 0.3) {
      recommendations.push('存在较多独立题目，考虑添加适当的条件逻辑增强题目间的关联');
    }

    if (recommendations.length === 0) {
      recommendations.push('依赖关系结构良好，无需特别优化');
    }

    return {
      summary: {
        totalQuestions: graphData.statistics.totalQuestions,
        questionsWithConditions: graphData.statistics.questionsWithConditions,
        simpleConditions,
        complexConditions,
        nestedConditions,
        circularDependencies: graphData.statistics.circularDependencies,
        isolatedQuestions,
      },
      complexityAnalysis: {
        averageComplexity,
        maxComplexity,
        maxNestingLevel: graphData.statistics.maxNestingLevel,
        highComplexityQuestions,
      },
      circularDependencies: allCycles,
      recommendations,
    };
  }
}