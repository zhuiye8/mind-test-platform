// 情感数据处理器 - 重构后版本
// 所有mock数据功能已移除，仅保留接口定义

export interface EmotionMetadata {
  examResultId: string;
  participantName: string;
  examTitle: string;
  sessionDuration: number;
  questionCount: number;
}

export interface EmotionDataPoint {
  timestamp: number;
  emotion: string;
  confidence: number;
  face_emotions?: Record<string, number>;
  voice_emotions?: Record<string, number>;
  heart_rate?: number;
}

export interface ProcessedEmotionData {
  session_id: string;
  face_emotions: EmotionDataPoint[];
  voice_emotions: EmotionDataPoint[];
  heart_rate_data: EmotionDataPoint[];
  summary: {
    total_duration: number;
    start_time: string;
    end_time: string;
    question_count: number;
  };
}

/**
 * 获取带时间戳的原始情感数据
 * @param examResultId 考试结果ID
 * @param metadata 元数据
 * @returns Promise<ProcessedEmotionData>
 */
export async function getRawEmotionDataWithTimestamp(
  _examResultId: string,
  _metadata: EmotionMetadata
): Promise<ProcessedEmotionData> {
  throw new Error('getRawEmotionDataWithTimestamp: 原始情感数据功能尚未实现，需要连接真实AI服务');
}

/**
 * 获取格式化的情感数据
 * @param examResultId 考试结果ID
 * @param metadata 元数据
 * @returns Promise<ProcessedEmotionData>
 */
export async function getFormattedEmotionData(
  _examResultId: string,
  _metadata: EmotionMetadata
): Promise<ProcessedEmotionData> {
  throw new Error('getFormattedEmotionData: 格式化情感数据功能尚未实现，需要连接真实AI服务');
}

/**
 * 生成情感数据统计摘要
 * @param emotionData 情感数据
 * @returns 统计摘要
 */
export function generateEmotionSummary(_emotionData: ProcessedEmotionData): {
  dominantEmotion: string;
  avgHeartRate: number;
  emotionChanges: number;
  stressLevel: 'low' | 'medium' | 'high';
} {
  return {
    dominantEmotion: 'unknown',
    avgHeartRate: 0,
    emotionChanges: 0,
    stressLevel: 'low'
  };
}

/**
 * 验证情感数据完整性
 * @param data 情感数据
 * @returns 验证结果
 */
export function validateEmotionData(data: ProcessedEmotionData): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!data.session_id) {
    errors.push('缺少会话ID');
  }
  
  if (!data.face_emotions || data.face_emotions.length === 0) {
    errors.push('缺少面部情感数据');
  }
  
  if (!data.voice_emotions || data.voice_emotions.length === 0) {
    errors.push('缺少语音情感数据');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}