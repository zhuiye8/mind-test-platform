/**
 * 题目相关API
 */

import api from './base';
import type { ApiResponse, Question, CreateQuestionForm } from '../../types';

export const questionApi = {
  // 获取试卷题目列表
  getList: (paperId: string): Promise<ApiResponse<Question[]>> => {
    return api.get(`/teacher/papers/${paperId}/questions`);
  },
  // 兼容别名：getQuestions -> getList
  getQuestions: (paperId: string): Promise<ApiResponse<Question[]>> => {
    return api.get(`/teacher/papers/${paperId}/questions`);
  },

  // 创建题目
  create: (paperId: string, data: CreateQuestionForm): Promise<ApiResponse<Question>> => {
    return api.post(`/teacher/papers/${paperId}/questions`, data);
  },
  // 兼容别名：createQuestion -> create
  createQuestion: (paperId: string, data: CreateQuestionForm): Promise<ApiResponse<Question>> => {
    return api.post(`/teacher/papers/${paperId}/questions`, data);
  },

  // 更新题目
  update: (questionId: string, data: Partial<CreateQuestionForm>): Promise<ApiResponse<Question>> => {
    return api.put(`/teacher/papers/questions/${questionId}`, data);
  },
  // 兼容别名：updateQuestion -> update
  updateQuestion: (questionId: string, data: Partial<CreateQuestionForm>): Promise<ApiResponse<Question>> => {
    return api.put(`/teacher/papers/questions/${questionId}`, data);
  },

  // 删除题目
  delete: (questionId: string): Promise<ApiResponse<void>> => {
    return api.delete(`/teacher/papers/questions/${questionId}`);
  },
  // 兼容别名：deleteQuestion -> delete
  deleteQuestion: (questionId: string): Promise<ApiResponse<void>> => {
    return api.delete(`/teacher/papers/questions/${questionId}`);
  },

  // 批量重排题目顺序
  batchReorder: (paperId: string, questionOrders: Array<{ id: string; order: number }>): Promise<ApiResponse<void>> => {
    // 转换参数名以匹配后端期望的格式
    const question_orders = questionOrders.map(item => ({
      id: item.id,
      question_order: item.order
    }));
    return api.put(`/teacher/papers/${paperId}/questions/batch-reorder`, { question_orders });
  },
};
