/**
 * 考试相关API
 */

import api from './base';
import type { ApiResponse, Exam, CreateExamForm, ExamResult, Question } from '../../types';

export const examApi = {
  // 获取考试列表
  getList: (params?: { page?: number; limit?: number }): Promise<ApiResponse<{
    data: Exam[];
    pagination: any;
    meta: any;
  }>> => {
    return api.get('/teacher/exams', { params });
  },

  // 获取考试详情
  getDetail: (examId: string): Promise<ApiResponse<Exam>> => {
    return api.get(`/teacher/exams/${examId}`);
  },

  // 创建考试
  create: (data: CreateExamForm): Promise<ApiResponse<Exam>> => {
    return api.post('/teacher/exams', data);
  },

  // 更新考试
  update: (examId: string, data: Partial<CreateExamForm>): Promise<ApiResponse<Exam>> => {
    return api.put(`/teacher/exams/${examId}`, data);
  },

  // 删除考试
  delete: (examId: string): Promise<ApiResponse<void>> => {
    return api.delete(`/teacher/exams/${examId}`);
  },

  // 切换发布状态
  togglePublish: (examId: string): Promise<ApiResponse<Exam>> => {
    return api.post(`/teacher/exams/${examId}/toggle-publish`);
  },

  // 结束考试（published → success）
  finishExam: (examId: string): Promise<ApiResponse<Exam>> => {
    return api.put(`/teacher/exams/${examId}/finish`);
  },

  // 归档考试（success → archived）
  archiveExam: (examId: string): Promise<ApiResponse<Exam>> => {
    return api.put(`/teacher/exams/${examId}/archive`);
  },

  // 恢复考试（archived → success）
  restoreExam: (examId: string): Promise<ApiResponse<Exam>> => {
    return api.put(`/teacher/exams/${examId}/restore`);
  },

  // 获取归档考试列表
  getArchivedExams: (params?: { page?: number; limit?: number }): Promise<ApiResponse<{
    data: Exam[];
    pagination: any;
    meta: any;
  }>> => {
    return api.get('/teacher/exams/archived', { params });
  },

  // 获取考试的提交学生列表
  getExamSubmissions: (examId: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<{
    data: ExamResult[];
    pagination: any;
    meta: any;
  }>> => {
    return api.get(`/teacher/exams/${examId}/submissions`, { params });
  },

  // 获取考试结果
  getResults: (examId: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<{
    data: ExamResult[];
    pagination: any;
    meta: any;
  }>> => {
    return api.get(`/teacher/exams/${examId}/results`, { params });
  },

  // 导出考试结果
  exportResults: (examId: string): Promise<Blob> => {
    return api.get(`/teacher/exams/${examId}/results/export`, {
      responseType: 'blob',
    });
  },

  // 获取考试题目详情（用于答案展示）
  getExamQuestions: (examId: string): Promise<ApiResponse<Question[]>> => {
    return api.get(`/teacher/exams/${examId}/questions`);
  },
};