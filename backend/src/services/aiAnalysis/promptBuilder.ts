import { QuestionData } from './types';
import { QuestionEmotionMatch } from './aiDataMatcher';

// 旧版本遗留函数，暂时移除以修复构建错误
// 如果其他地方需要使用这些函数，可以在需要时重新添加

// function fmt(dt: Date | string | undefined): string { ... }
// function summarizeChanges(changes?: string[]): string { ... }  
// function hrTrendText(hr?: {...}): string { ... }
// function anomalySummary(anoms?: Array<{...}>): string { ... }

/**
 * 分析情绪变化趋势
 * @param emotions - 情绪数组
 * @returns 情绪趋势描述
 */
function analyzeEmotionTrend(emotions: string[]): string {
  if (!emotions || emotions.length === 0) return '无数据';
  if (emotions.length === 1) return emotions[0];
  
  const emotionCounts: Record<string, number> = {};
  const transitions: string[] = [];
  
  // 统计情绪出现次数
  emotions.forEach(emotion => {
    emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
  });
  
  // 记录情绪转换
  for (let i = 1; i < emotions.length; i++) {
    if (emotions[i] !== emotions[i - 1]) {
      transitions.push(`${emotions[i - 1]}→${emotions[i]}`);
    }
  }
  
  // 主要情绪
  const dominant = Object.entries(emotionCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || emotions[0];
  
  if (transitions.length === 0) {
    return `主要为${dominant}`;
  }
  
  // 限制显示的转换数量
  const transitionText = transitions.length > 3 
    ? `${transitions.slice(0, 3).join('，')}等${transitions.length}次变化`
    : transitions.join('，');
    
  return `主要为${dominant}，变化：${transitionText}`;
}

/**
 * 分析心率变化趋势
 * @param hrValues - 心率值数组
 * @returns 心率趋势描述
 */
function analyzeHeartRateTrend(hrValues: number[]): string {
  if (!hrValues || hrValues.length === 0) return '无数据';
  if (hrValues.length === 1) return '单次记录';
  
  const validHR = hrValues.filter(hr => typeof hr === 'number' && hr > 0);
  if (validHR.length < 2) return '数据不足';
  
  const first = validHR.slice(0, Math.max(1, Math.floor(validHR.length / 3)));
  const last = validHR.slice(-Math.max(1, Math.floor(validHR.length / 3)));
  
  const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
  const lastAvg = last.reduce((a, b) => a + b, 0) / last.length;
  const diff = lastAvg - firstAvg;
  
  if (Math.abs(diff) < 5) {
    return '相对稳定';
  } else if (diff > 0) {
    return `上升趋势(+${diff.toFixed(1)}bpm)`;
  } else {
    return `下降趋势(${diff.toFixed(1)}bpm)`;
  }
}

export function buildReportPrompt(options: {
  studentId?: string;
  examId?: string;
  questions: QuestionData[];
  matches: QuestionEmotionMatch[];
  aggregates?: Array<{ model: string; key: string; value: any }>;
  anomalies?: Array<{ code: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; from: Date; to: Date }>;
  aiDataAvailable?: boolean;
}): string {
  const { studentId = '学生', examId = '心理测试', questions, matches, aiDataAvailable = true } = options;
  // aggregates 和 anomalies 在当前版本未使用，但保留接口向后兼容
  // const { aggregates = [], anomalies = [] } = options;

  // 专业心理评估专家身份定位
  let prompt = '';
  if (aiDataAvailable) {
    prompt += `你是一个心理测评结果分析专家，需要基于学生进行心理测评答题过程中通过模型获得的情绪变化参数、时间戳以及心率数据，为心理教师提供对学生心理状态的分析和调整建议。\n\n`;
  } else {
    prompt += `你是一个心理测评结果分析专家。本次考试未采集到 AI 情绪与生理数据，需要仅基于学生的作答内容、题目选项与答题时间等可用信息，为心理教师提供对学生心理状态的分析和调整建议。请在报告中明确说明没有实时情绪与心率数据，重点分析作答表现。\n\n`;
  }
  
  // 学生基本信息
  prompt += `【学生信息】学生: ${studentId}考试: ${examId}\n\n`;
  
  // 逐题心理状态分析数据
  prompt += `【逐题心理状态分析数据】\n`;

  const matchMap = new Map(matches.map(m => [m.questionId, m] as const));
  questions.forEach((q, index) => {
    const matchData = matchMap.get(q.question_id);
    prompt += `题目 ${index + 1}: ${q.content}\n`;
    prompt += `答题时间段: ${q.start_time} 至 ${q.end_time}\n`;
    
    if (matchData) {
      // 详细情绪分析 - 面部表情
      const videoEmotions = matchData.videoEmotions;
      if (videoEmotions && videoEmotions.length > 0) {
        const emotions = videoEmotions.map(e => e.dominantEmotion || 'neutral');
        const emotionTrend = analyzeEmotionTrend(emotions);
        const avgConfidence = videoEmotions.reduce((sum, e) => sum + (e.confidence || 0), 0) / videoEmotions.length;
        prompt += `  面部表情变化: ${emotionTrend}\n`;
        prompt += `  情绪识别可信度: ${avgConfidence.toFixed(2)}\n`;
      }
      
      // 语音情绪变化
      const audioEmotions = matchData.audioEmotions;
      if (audioEmotions && audioEmotions.length > 0) {
        const emotions = audioEmotions.map(e => e.dominantEmotion || 'calm');
        const emotionTrend = analyzeEmotionTrend(emotions);
        prompt += `  语音情绪变化: ${emotionTrend}\n`;
      }
      
      // 心率状况
      const heartRates = matchData.heartRates;
      if (heartRates && heartRates.length > 0) {
        const hrValues = heartRates.map(hr => hr.heartRate).filter((hr): hr is number => typeof hr === 'number');
        if (hrValues.length > 0) {
          const avgHr = hrValues.reduce((sum, hr) => sum + hr, 0) / hrValues.length;
          const minHr = Math.min(...hrValues);
          const maxHr = Math.max(...hrValues);
          const hrTrend = analyzeHeartRateTrend(hrValues);
          prompt += `  心率状况: 平均${avgHr.toFixed(1)}bpm, 波动${minHr}-${maxHr}bpm\n`;
          prompt += `  心率趋势: ${hrTrend}\n`;
        }
      }
    } else {
      prompt += `  无匹配到对应时间段的情绪/生理数据\n`;
    }
    prompt += `\n`;
  });
  
  // 分析要求
  prompt += `【分析要求】结合以上的数据，为这位学生撰写个性化的心理分析报告，包含：1.结合各题目选项中，负面情绪较大的情况进行分析（如有），2.基于情绪和心率变化较大的区域进行分析。\n`;

  return prompt;
}
