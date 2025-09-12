import prisma from '../../utils/database';

export type EmotionPoint = {
  timestamp: Date;
  dominantEmotion?: string;
  confidence?: number | undefined;
  raw?: any;
};

export type HeartRatePoint = {
  timestamp: Date;
  heartRate?: number | undefined;
  confidence?: number | undefined;
  quality?: string | undefined;
  raw?: any;
};

export type QuestionEmotionMatch = {
  questionId: string;
  start: Date;
  end: Date;
  videoEmotions: EmotionPoint[];
  audioEmotions: EmotionPoint[];
  heartRates: HeartRatePoint[];
  stats: {
    video?: {
      main?: string | undefined;
      changes?: string[] | undefined;
      avgConfidence?: number | undefined;
    };
    audio?: {
      main?: string | undefined;
      changes?: string[] | undefined;
      avgConfidence?: number | undefined;
    };
    heartRate?: {
      avg?: number | undefined;
      trend?: 'up' | 'down' | 'stable' | undefined;
      diff?: number | undefined;
    };
    anomalies?: Array<{
      code?: string;
      severity?: 'LOW' | 'MEDIUM' | 'HIGH';
      from?: Date | undefined;
      to?: Date | undefined;
    }>;
  };
};

function toDate(d: any): Date | null {
  try {
    if (!d) return null;
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

function analyzeEmotion(points: EmotionPoint[]): { main?: string | undefined; changes?: string[] | undefined; avgConfidence?: number | undefined } {
  if (!points.length) return {};
  const emotions = points.map(p => p.dominantEmotion || 'neutral');
  const counts = new Map<string, number>();
  let prev: string | null = null;
  const changes: string[] = [];
  let confSum = 0;
  let confN = 0;
  for (const e of emotions) {
    counts.set(e, (counts.get(e) || 0) + 1);
    if (prev && prev !== e) changes.push(`${prev}→${e}`);
    prev = e;
  }
  for (const p of points) {
    if (typeof p.confidence === 'number') {
      confSum += p.confidence;
      confN += 1;
    }
  }
  const main = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const avgConfidence = confN ? confSum / confN : undefined;
  return { main, changes: changes.slice(0, 5), avgConfidence };
}

function analyzeHeartRate(points: HeartRatePoint[]): { avg?: number | undefined; trend?: 'up' | 'down' | 'stable' | undefined; diff?: number | undefined } {
  if (!points.length) return {};
  const hrs = points.map(p => p.heartRate).filter((hr): hr is number => typeof hr === 'number');
  if (!hrs.length) return {};
  const avg = hrs.reduce((a, b) => a + b, 0) / hrs.length;
  const first = hrs[0];
  const last = hrs[hrs.length - 1];
  const diff = last - first;
  const trend = Math.abs(diff) < 5 ? 'stable' : diff > 0 ? 'up' : 'down';
  return { avg: Math.round(avg * 10) / 10, trend, diff: Math.round(diff * 10) / 10 };
}

/**
 * 从JSON文件匹配AI数据到题目时间线（新架构）
 */
export async function matchAIDataForExamResult(examResultId: string, toleranceSeconds = 5): Promise<{
  sessionId?: string | undefined;
  matches: QuestionEmotionMatch[];
  aggregates: Array<{ model: string; key: string; value: any }>;
  anomalies: Array<{ code: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; from: Date; to: Date }>;
}> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  try {
    // 1. 从JSON文件读取AI数据
    const filePath = path.join(process.cwd(), 'storage', 'ai-sessions', `${examResultId}.json`);
    
    let emotionData: any;
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      emotionData = JSON.parse(fileContent);
      console.log(`[AI匹配] 从文件读取数据: ${examResultId}, 视频:${emotionData.video_emotions?.length || 0}, 音频:${emotionData.audio_emotions?.length || 0}, 心率:${emotionData.heart_rate_data?.length || 0}`);
    } catch (fileError) {
      console.log(`[AI匹配] 文件不存在: ${filePath}`);
      return { matches: [], aggregates: [], anomalies: [] };
    }
    
    // 2. 获取考试结果和题目时间线
    const examResult = await prisma.examResult.findUnique({
      where: { id: examResultId },
      include: {
        questionResponses: {
          orderBy: { questionOrder: 'asc' },
        },
      },
    });
    
    if (!examResult) {
      return { matches: [], aggregates: [], anomalies: [] };
    }
    
    // 3. 处理聚合数据
    const aggregates: Array<{ model: string; key: string; value: any }> = [];
    if (emotionData.aggregates) {
      for (const [modelKey, data] of Object.entries(emotionData.aggregates)) {
        const [model, key] = modelKey.split('.');
        aggregates.push({ 
          model: model || 'unknown', 
          key: key || modelKey, 
          value: data 
        });
      }
    }
    
    // 4. 处理异常数据
    const anomalies: Array<{ code: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; from: Date; to: Date }> = [];
    if (emotionData.anomalies_timeline) {
      for (const anomaly of emotionData.anomalies_timeline) {
        anomalies.push({
          code: anomaly.code,
          severity: anomaly.severity || 'LOW',
          from: new Date(anomaly.from),
          to: new Date(anomaly.to),
        });
      }
    }
    
    // 5. 转换情绪数据为统一格式
    const videoEmotions: Array<{ timestamp: Date; dominantEmotion: string; confidence?: number }> = [];
    const audioEmotions: Array<{ timestamp: Date; dominantEmotion: string; confidence?: number }> = [];
    const heartRateData: Array<{ timestamp: Date; heartRate?: number; confidence?: number; quality?: string }> = [];
    
    // 转换视频情绪数据
    if (emotionData.video_emotions) {
      for (const item of emotionData.video_emotions) {
        videoEmotions.push({
          timestamp: new Date(item.timestamp),
          dominantEmotion: item.dominant_emotion || 'neutral',
          confidence: item.confidence
        });
      }
    }
    
    // 转换音频情绪数据
    if (emotionData.audio_emotions) {
      for (const item of emotionData.audio_emotions) {
        audioEmotions.push({
          timestamp: new Date(item.timestamp),
          dominantEmotion: item.dominant_emotion || 'calm',
          confidence: item.confidence
        });
      }
    }
    
    // 转换心率数据
    if (emotionData.heart_rate_data) {
      for (const item of emotionData.heart_rate_data) {
        heartRateData.push({
          timestamp: new Date(item.timestamp),
          heartRate: item.heart_rate,
          confidence: item.confidence,
          quality: item.quality
        });
      }
    }
    
    // 6. 为每道题匹配时间窗口数据
    const matches: QuestionEmotionMatch[] = [];
    const tolMs = toleranceSeconds * 1000;
    
    for (const resp of examResult.questionResponses) {
      const start = toDate(resp.questionDisplayedAt) || examResult.startedAt || new Date();
      const end = toDate(resp.responseSubmittedAt) || examResult.submittedAt || new Date();
      const from = new Date(start.getTime() - tolMs);
      const to = new Date(end.getTime() + tolMs);
      
      // 匹配时间窗口内的数据
      const questionVideoEmotions: EmotionPoint[] = videoEmotions
        .filter(e => e.timestamp >= from && e.timestamp <= to)
        .map(e => ({
          timestamp: e.timestamp,
          dominantEmotion: e.dominantEmotion,
          confidence: e.confidence
        }));
      
      const questionAudioEmotions: EmotionPoint[] = audioEmotions
        .filter(e => e.timestamp >= from && e.timestamp <= to)
        .map(e => ({
          timestamp: e.timestamp,
          dominantEmotion: e.dominantEmotion,
          confidence: e.confidence
        }));
      
      const questionHeartRates: HeartRatePoint[] = heartRateData
        .filter(e => e.timestamp >= from && e.timestamp <= to)
        .map(e => ({
          timestamp: e.timestamp,
          heartRate: e.heartRate,
          confidence: e.confidence,
          quality: e.quality
        }));
      
      // 匹配异常数据
      const questionAnomalies = anomalies.filter(a => 
        (a.from >= from && a.from <= to) || (a.to >= from && a.to <= to)
      ).map(a => ({
        code: a.code,
        severity: a.severity,
        from: a.from,
        to: a.to
      }));
      
      // 分析统计数据
      const videoStats = analyzeEmotion(questionVideoEmotions);
      const audioStats = analyzeEmotion(questionAudioEmotions);
      const heartRateStats = analyzeHeartRate(questionHeartRates);
      
      matches.push({
        questionId: resp.questionId,
        start,
        end,
        videoEmotions: questionVideoEmotions,
        audioEmotions: questionAudioEmotions,
        heartRates: questionHeartRates,
        stats: {
          video: videoStats,
          audio: audioStats,
          heartRate: heartRateStats,
          anomalies: questionAnomalies
        }
      });
    }
    
    console.log(`[AI匹配] 匹配完成: ${examResultId}, 题目数=${matches.length}, 聚合数=${aggregates.length}, 异常数=${anomalies.length}`);
    
    return {
      sessionId: emotionData.session_id,
      matches,
      aggregates,
      anomalies
    };
    
  } catch (error) {
    console.error(`[AI匹配] 处理失败: ${examResultId}`, error);
    return { matches: [], aggregates: [], anomalies: [] };
  }
}