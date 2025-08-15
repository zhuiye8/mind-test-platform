import axios, { type AxiosInstance } from 'axios';
import type { 
  ApiResponse, 
  LoginForm, 
  LoginResponse, 
  Paper,
  CreatePaperForm,
  Question,
  CreateQuestionForm,
  Exam,
  CreateExamForm,
  ExamResult,
  AnalyticsData
} from '../types';

// 创建axios实例
const api: AxiosInstance = axios.create({
  baseURL: 'http://localhost:3001/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加认证token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 统一处理错误
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 当API返回401错误时
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const isStudentPath = currentPath.startsWith('/exam/');
      const isLoginPage = currentPath === '/login';
      
      // 只有教师端（非学生端、非登录页）才跳转到登录页
      if (!isStudentPath && !isLoginPage) {
        // 清除过期的认证信息
        localStorage.removeItem('auth_token');
        localStorage.removeItem('teacher_info');
        // 使用 window.location.href 来强制刷新页面，确保旧的状态被清除
        window.location.href = '/login';
      }
      // 学生端的401错误（如密码错误）不跳转，让组件内部处理
    }
    // 对于所有错误（包括登录页的401），都将错误继续抛出，以便组件内部可以捕获和处理
    return Promise.reject(error);
  }
);

// 认证相关API
export const authApi = {
  // 教师登录
  login: (data: LoginForm): Promise<ApiResponse<LoginResponse>> => {
    return api.post('/auth/login', data);
  },

  // 验证token
  verify: (): Promise<ApiResponse<{ teacher: any }>> => {
    return api.get('/auth/verify');
  },
};

// 试卷相关API
export const paperApi = {
  // 获取试卷列表
  getList: (): Promise<ApiResponse<Paper[]>> => {
    return api.get('/teacher/papers');
  },

  // 获取试卷详情
  getDetail: (paperId: string): Promise<ApiResponse<Paper & { questions: Question[] }>> => {
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

// 题目相关API
export const questionApi = {
  // 获取试卷题目列表
  getList: (paperId: string): Promise<ApiResponse<Question[]>> => {
    return api.get(`/teacher/papers/${paperId}/questions`);
  },

  // 创建题目
  create: (paperId: string, data: CreateQuestionForm): Promise<ApiResponse<Question>> => {
    return api.post(`/teacher/papers/${paperId}/questions`, data);
  },

  // 更新题目
  update: (questionId: string, data: Partial<CreateQuestionForm>): Promise<ApiResponse<Question>> => {
    return api.put(`/teacher/papers/questions/${questionId}`, data);
  },

  // 删除题目
  delete: (questionId: string): Promise<ApiResponse<void>> => {
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

// 考试相关API
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

// 分析数据API
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

// 公开API（学生端使用，无需认证）
export const publicApi = {
  // 获取考试信息
  getExam: (uuid: string, password?: string): Promise<ApiResponse<{
    id: string;
    title: string;
    duration_minutes: number;
    password_required: boolean;
    questions?: Question[];
    shuffle_questions: boolean;
  }>> => {
    const params = password ? { password } : {};
    return api.get(`/public/exams/${uuid}`, { params });
  },

  // 验证考试密码
  verifyPassword: (uuid: string, password: string): Promise<ApiResponse<boolean>> => {
    return api.post(`/public/exams/${uuid}/verify`, { password });
  },

  // 检查重复提交
  checkDuplicateSubmission: (uuid: string, student_id: string): Promise<ApiResponse<{ canSubmit: boolean }>> => {
    return api.post(`/public/exams/${uuid}/check-duplicate`, { student_id });
  },

  // 创建AI分析会话
  createAISession: (uuid: string, data: {
    student_id: string;
    student_name: string;
    started_at?: string; // 考试开始时间（ISO格式）
  }): Promise<ApiResponse<{
    examResultId: string | null;
    aiSessionId: string | null;
    message: string;
    warning?: string;
  }>> => {
    return api.post(`/public/exams/${uuid}/create-ai-session`, data);
  },

  // 重试AI分析会话
  retryAISession: (uuid: string, data: {
    student_id: string;
    student_name: string;
  }): Promise<ApiResponse<{
    examResultId: string | null;
    aiSessionId: string | null;
    message: string;
    warning?: string;
  }>> => {
    return api.post(`/public/exams/${uuid}/retry-ai-session`, data);
  },

  // 提交考试答案
  submitExam: (uuid: string, data: {
    student_id: string;
    student_name: string;
    answers: Record<string, any>;
    started_at?: string; // 答题开始时间（ISO格式）
    // AI功能相关数据（已简化）
    timeline_data?: any;
    voice_interactions?: any;
    device_test_results?: any;
  }): Promise<ApiResponse<{ result_id: string }>> => {
    return api.post(`/public/exams/${uuid}/submit`, data);
  },
};

// AI分析相关API（教师端使用）
export const aiApi = {
  // 生成AI分析报告
  generateReport: (examResultId: string): Promise<ApiResponse<{
    report: string;
    reportFile?: string;
    message: string;
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
};

export default api;