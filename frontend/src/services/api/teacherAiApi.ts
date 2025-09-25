/**
 * AI分析相关API（教师端使用）
 */

import api from './base';
import type { ApiResponse } from '../../types';

export const teacherAiApi = {
  // 生成AI分析报告
  generateReport: (examResultId: string): Promise<ApiResponse<{
    report: string;
    reportFile?: string;
    message: string;
    aiDataAvailable?: boolean;
    warnings?: string[];
  }>> => {
    return api.post(`/teacher/ai/exam-results/${examResultId}/generate-report`);
  },

  // 获取AI报告状态
  getReportStatus: (examResultId: string): Promise<ApiResponse<{
    hasAISession: boolean;
    aiSessionId: string | null;
    latestReport: any | null;
  }>> => {
    return api.get(`/teacher/ai/exam-results/${examResultId}/report-status`);
  },

  // 检查AI服务健康状态
  checkServiceHealth: (): Promise<ApiResponse<{
    healthy: boolean;
    service: any;
    timestamp: string;
  }>> => {
    return api.get('/teacher/ai/service/health');
  },

  // 手动结束AI分析会话
  endAISession: (examResultId: string): Promise<ApiResponse<{
    success: boolean;
    message: string;
  }>> => {
    return api.post(`/teacher/ai/exam-results/${examResultId}/end-session`);
  },

  // 重新生成AI分析报告
  regenerateAIReport: (examResultId: string): Promise<ApiResponse<{
    report: string;
    reportFile?: string;
    cached: boolean;
    message: string;
  }>> => {
    return api.post(`/teacher/ai/exam-results/${examResultId}/regenerate-report`);
  },

  // 获取情绪分析数据预览
  getEmotionDataPreview: (examResultId: string): Promise<ApiResponse<{
    examResultId: string;
    analysisMetadata: {
      totalDuration: number;
      dataQuality: string;
      analysisMethod: string;
      capturedFrames: number;
      heartRatePoints: number;
    };
    faceEmotion: Array<{
      time: string;
      emotion: string;
      confidence: number;
      timestamp: number;
    }>;
    voiceEmotion: Array<{
      emotion: string;
      count: number;
      percentage: number;
    }>;
    heartRate: Array<{
      time: string;
      heartRate: number;
      timestamp: number;
    }>;
    summary: {
      dominantFaceEmotion: string;
      dominantVoiceEmotion: string;
      averageHeartRate: number;
      stressLevel: string;
    };
    message: string;
  }>> => {
    return api.get(`/teacher/ai/exam-results/${examResultId}/emotion-preview`);
  },
};
