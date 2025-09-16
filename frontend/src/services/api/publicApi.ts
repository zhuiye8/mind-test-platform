/**
 * 公开API（学生端使用，无需认证）
 */

import api from './base';
import type { ApiResponse, Question } from '../../types';

export const publicApi = {
  // 获取考试信息（不再支持通过查询参数传递密码）
  getExam: (uuid: string): Promise<ApiResponse<{
    id: string;
    title: string;
    duration_minutes: number;
    password_required: boolean;
    questions?: Question[];
    shuffle_questions: boolean;
    allow_multiple_submissions?: boolean;
  }>> => {
    return api.get(`/public/exams/${uuid}`);
  },

  // 验证考试密码
  verifyPassword: (uuid: string, password: string): Promise<ApiResponse<{
    id: string;
    title: string;
    duration_minutes: number;
    password_required: boolean;
    questions: Question[];
    shuffle_questions: boolean;
    description?: string;
    allow_multiple_submissions?: boolean;
  }>> => {
    return api.post(`/public/exams/${uuid}/verify`, { password });
  },

  // 检查重复提交
  checkDuplicateSubmission: (uuid: string, participant_id: string): Promise<ApiResponse<{ canSubmit: boolean }>> => {
    return api.post(`/public/exams/${uuid}/check-duplicate`, { participant_id });
  },

  // 创建AI分析会话
  createAISession: (uuid: string, data: {
    participant_id: string;
    participant_name: string;
    started_at?: string; // 考试开始时间（ISO格式）
  }): Promise<ApiResponse<{
    exam_result_id: string | null;
    ai_session_id: string | null;
    message: string;
    warning?: string;
  }>> => {
    return api.post(`/public/exams/${uuid}/create-ai-session`, data);
  },

  // 重试AI分析会话
  retryAISession: (uuid: string, data: {
    participant_id: string;
    participant_name: string;
  }): Promise<ApiResponse<{
    exam_result_id: string | null;
    ai_session_id: string | null;
    message: string;
    warning?: string;
  }>> => {
    return api.post(`/public/exams/${uuid}/retry-ai-session`, data);
  },

  // 提交考试答案
  submitExam: (uuid: string, data: {
    participant_id: string;
    participant_name: string;
    answers: Record<string, any>;
    started_at?: string; // 答题开始时间（ISO格式）
    submitted_at?: string; // 提交时间（ISO格式）
    // AI功能相关数据（已简化）
    timeline_data?: any;
    voice_interactions?: any;
    device_test_results?: any;
  }): Promise<ApiResponse<{ result_id: string }>> => {
    return api.post(`/public/exams/${uuid}/submit`, data);
  },

  // 获取AI服务配置（公开接口，学生端使用）
  getAIServiceConfig: (): Promise<ApiResponse<{
    websocketUrl: string | null;
    available: boolean;
    features: {
      sessionCreation: boolean;
      emotionAnalysis: boolean;
      reportGeneration: boolean;
    };
    error?: string;
    timestamp: string;
  }>> => {
    return api.get('/ai-service/config');
  },
};
