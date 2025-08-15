// AI功能相关的API接口 - 对接外部AI服务

import axios from 'axios';

// AI服务URL已移至后端配置，前端不再直接调用外部AI服务
// const AI_SERVICE_URL = process.env.REACT_APP_AI_SERVICE_URL || 'http://192.168.9.84:5000';
const API_BASE_URL = '/api/teacher';

// AI会话创建请求接口
export interface CreateAISessionRequest {
  studentId: string;
  examId: string;
}

// AI会话创建响应接口
export interface CreateAISessionResponse {
  success: boolean;
  sessionId?: string;
  websocketUrl?: string;
  error?: string;
}

// AI报告生成请求接口
export interface GenerateAIReportRequest {
  examResultId: string;
}

// AI报告生成响应接口
export interface GenerateAIReportResponse {
  success: boolean;
  data?: {
    report: string;
    reportFile?: string;
    sessionId: string;
  };
  error?: string;
}

class AIApiService {
  // 生成AI分析报告（教师端调用）
  async generateAIReport(examResultId: string): Promise<GenerateAIReportResponse> {
    try {
      const response = await axios.post(`${API_BASE_URL}/exam-results/${examResultId}/ai-analysis`);
      return response.data;
    } catch (error: any) {
      console.error('生成AI分析报告失败:', error);
      return {
        success: false,
        error: error.response?.data?.error || '生成AI分析报告失败',
      };
    }
  }
}

// 创建API服务实例
export const aiApiService = new AIApiService();

// React Hook for AI functionality
export const useAIApi = () => {
  return {
    generateAIReport: aiApiService.generateAIReport.bind(aiApiService),
  };
};

export default aiApiService;