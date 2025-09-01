/**
 * 公开控制器工具函数
 */

// 工具函数：打乱数组顺序
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 工具函数：智能计分（支持选项分数）
export function calculateScore(answers: Record<string, string | string[]>, questions: any[]): number {
  if (!questions || questions.length === 0) return 0;
  
  let totalScore = 0;
  let scoredQuestionCount = 0;
  
  for (const question of questions) {
    // 检查题目是否计分
    if (question.is_scored === false) {
      continue; // 跳过不计分的题目
    }
    
    const answer = answers[question.id];
    if (!answer) {
      continue; // 跳过未回答的题目
    }
    
    // 统一处理答案格式：支持字符串和数组
    let normalizedAnswer: string;
    if (Array.isArray(answer)) {
      // 数组格式：转换为逗号分隔字符串
      normalizedAnswer = answer.join(',');
    } else {
      // 字符串格式：直接使用
      normalizedAnswer = answer.toString();
    }
    
    if (normalizedAnswer.trim() === '') {
      continue; // 跳过空答案
    }
    
    // 获取题目选项配置
    const options = question.options || {};
    let questionScore = 0;
    
    // 检查选项是否有分数配置
    let hasOptionScores = false;
    for (const [, optionValue] of Object.entries(options)) {
      if (typeof optionValue === 'object' && (optionValue as any).score !== undefined) {
        hasOptionScores = true;
        break;
      }
    }
    
    if (hasOptionScores) {
      // 基于选项分数计分
      if (question.question_type === 'multiple_choice') {
        // 多选题：答案已经标准化为逗号分隔字符串
        const selectedOptions = normalizedAnswer.split(',').map(opt => opt.trim());
        for (const selectedOption of selectedOptions) {
          const optionData = options[selectedOption];
          if (typeof optionData === 'object' && (optionData as any).score !== undefined) {
            questionScore += (optionData as any).score;
          }
        }
      } else {
        // 单选题或文本题
        const optionData = options[normalizedAnswer];
        if (typeof optionData === 'object' && (optionData as any).score !== undefined) {
          questionScore = (optionData as any).score;
        }
      }
      
      totalScore += questionScore;
      scoredQuestionCount++;
    } else {
      // 传统计分：回答即得分（向后兼容）
      scoredQuestionCount++;
    }
  }
  
  // 如果没有计分题目，返回0
  if (scoredQuestionCount === 0) {
    return 0;
  }
  
  // 如果有选项分数，直接返回累计分数；否则按传统方式计算
  if (totalScore > 0) {
    return totalScore;
  } else {
    // 传统计分方式：100分平均分配
    const scorePerQuestion = Math.floor(100 / scoredQuestionCount);
    return Math.min(100, scoredQuestionCount * scorePerQuestion);
  }
}