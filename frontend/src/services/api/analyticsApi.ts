/**
 * 分析和统计相关API
 */

import api from './base';
import type { ApiResponse, AnalyticsData } from '../../types';

export const analyticsApi = {
  // 获取分析数据
  getData: (timeRange: '7d' | '30d' | '90d' | '1y' = '30d'): Promise<ApiResponse<AnalyticsData>> => {
    return api.get('/teacher/analytics', { params: { timeRange } });
  },

  // 获取Dashboard综合数据
  getDashboard: (): Promise<ApiResponse<{
    overall_stats: {
      total_papers: number;
      total_exams: number;
      total_participants: number;
      avg_completion_rate: number;
    };
    activity_stats: {
      active_exams: number;
      recent_submissions: number;
    };
    recent_papers: Array<{
      id: string;
      title: string;
      description: string;
      question_count: number;
      exam_count: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>;
    recent_exams: Array<{
      id: string;
      public_uuid: string;
      title: string;
      paper_title: string;
      duration_minutes: number;
      question_count: number;
      result_count: number;
      participant_count: number;
      start_time: string | null;
      end_time: string | null;
      has_password: boolean;
      shuffle_questions: boolean;
      status: string;
      public_url: string;
      created_at: string;
      updated_at: string;
    }>;
  }>> => {
    return api.get('/teacher/analytics/dashboard');
  },
};