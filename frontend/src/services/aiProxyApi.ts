/**
 * AI代理API服务
 * 通过后端代理访问AI服务，解决CORS问题
 */

import axios from 'axios';

// 创建axios实例
const apiClient = axios.create({
  baseURL: '/api/ai-proxy',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 可以在这里添加认证token等
    return config;
  },
  (error) => {
    console.error('[AIProxy] 请求错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    console.error('[AIProxy] 响应错误:', error);
    
    // 统一错误处理
    let message = '请求失败';
    if (error.response) {
      message = error.response.data?.message || `错误: ${error.response.status}`;
    } else if (error.request) {
      message = '网络错误，请检查连接';
    } else {
      message = error.message;
    }
    
    return Promise.reject(new Error(message));
  }
);

// API响应类型定义
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errorCode?: string;
}

/**
 * AI代理API接口
 */
export const aiProxyApi = {
  /**
   * 创建AI分析会话
   */
  async createSession(data: {
    participant_id?: string;
    exam_id?: string;
  }): Promise<ApiResponse<{ session_id: string }>> {
    console.log('[AIProxy] 创建会话请求:', data);
    const response = await apiClient.post('/create_session', data);
    console.log('[AIProxy] 创建会话响应:', response);
    return response as unknown as ApiResponse<{ session_id: string }>;
  },

  /**
   * 结束AI分析会话
   */
  async endSession(sessionId: string): Promise<ApiResponse<any>> {
    console.log('[AIProxy] 结束会话请求:', sessionId);
    const response = await apiClient.post('/end_session', {
      session_id: sessionId
    });
    console.log('[AIProxy] 结束会话响应:', response);
    return response as unknown as ApiResponse<any>;
  },

  /**
   * 分析问题数据
   */
  async analyzeQuestions(data: {
    session_id: string;
    questions_data: Array<{
      question_id: string;
      content: string;
      start_time: string;
      end_time: string;
    }>;
  }): Promise<ApiResponse<any>> {
    console.log('[AIProxy] 分析问题请求:', {
      session_id: data.session_id,
      questions_count: data.questions_data.length
    });
    const response = await apiClient.post('/analyze_questions', data);
    console.log('[AIProxy] 分析问题响应:', response);
    return response as unknown as ApiResponse<any>;
  },

  /**
   * 健康检查
   */
  async checkHealth(): Promise<ApiResponse<{ status: string; service: string; url: string }>> {
    const response = await apiClient.get('/health');
    return response as unknown as ApiResponse<{ status: string; service: string; url: string }>;
  },

  /**
   * 获取WebSocket配置
   */
  async getConfig(): Promise<ApiResponse<{ websocketUrl: string; available: boolean }>> {
    const response = await apiClient.get('/config');
    return response as unknown as ApiResponse<{ websocketUrl: string; available: boolean }>;
  }
};

export default aiProxyApi;