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
};
