/**
 * 试卷相关API
 */

import api from './base';
import type { ApiResponse, Paper, CreatePaperForm, Question } from '../../types';

export const paperApi = {
  // 获取试卷列表
  getList: (): Promise<ApiResponse<Paper[]>> => {
    return api.get('/teacher/papers');
  },

  // 获取试卷详情
  getDetail: (paperId: string): Promise<ApiResponse<Paper & { questions: Question[] }>> => {
    return api.get(`/teacher/papers/${paperId}`);
  },
  // 兼容别名：getPaper -> getDetail
  getPaper: (paperId: string): Promise<ApiResponse<Paper & { questions: Question[] }>> => {
    return api.get(`/teacher/papers/${paperId}`);
  },

  // 创建试卷
  create: (data: CreatePaperForm): Promise<ApiResponse<Paper>> => {
    return api.post('/teacher/papers', data);
  },

  // 更新试卷
  update: (paperId: string, data: Partial<CreatePaperForm>): Promise<ApiResponse<Paper>> => {
    return api.put(`/teacher/papers/${paperId}`, data);
  },

  // 删除试卷
  delete: (paperId: string): Promise<ApiResponse<void>> => {
    return api.delete(`/teacher/papers/${paperId}`);
  },

  // 批量设置计分
  batchSetScoring: (paperId: string, data: {
    mode: 'disable_all' | 'auto_fill',
    config?: {
      order: 'asc' | 'desc',
      initialScore: number,
      step: number
    }
  }): Promise<ApiResponse<{
    message: string,
    mode: string,
    updated_questions: number,
    total_questions: number,
    paper_title: string
  }>> => {
    return api.post(`/teacher/papers/${paperId}/batch-scoring`, data);
  },

  // 预览批量计分
  previewBatchScoring: (paperId: string, data: {
    mode: 'disable_all' | 'auto_fill',
    config?: {
      order: 'asc' | 'desc',
      initialScore: number,
      step: number
    }
  }): Promise<ApiResponse<{
    mode: string,
    config?: any,
    paperTitle: string,
    totalQuestions: number,
    previewResults: any[]
  }>> => {
    return api.post(`/teacher/papers/${paperId}/batch-scoring/preview`, data);
  },
};
