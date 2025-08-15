// AI功能相关的API接口

import axios from 'axios';

const API_BASE_URL = '/api/ai';

// AI报告生成请求接口
export interface GenerateReportRequest {
  examResultId: string;
  studentAnswers: Record<string, any>;
  emotionAnalysisId?: string;
  timelineData?: any;
  reportType: 'basic' | 'detailed' | 'comprehensive';
  language?: 'zh-CN' | 'en-US';
}

// AI报告生成响应接口
export interface GenerateReportResponse {
  success: boolean;
  data?: {
    reportId: string;
    status: 'generating' | 'completed' | 'failed';
    estimatedTime?: number; // 预计完成时间（秒）
    progress?: number; // 生成进度 0-100
  };
  error?: string;
}

// 报告下载响应接口
export interface ReportDownloadResponse {
  success: boolean;
  data?: {
    downloadUrl: string;
    filename: string;
    fileSize: number;
    format: 'pdf' | 'docx' | 'txt';
    expiresAt: string;
  };
  error?: string;
}

// 报告状态响应接口
export interface ReportStatusResponse {
  success: boolean;
  data?: {
    reportId: string;
    status: 'generating' | 'completed' | 'failed';
    progress: number;
    content?: {
      summary: string;
      analysis: string;
      recommendations: string[];
      emotionInsights?: string;
      charts?: any[];
    };
    error?: string;
    generatedAt?: string;
    downloadUrl?: string;
  };
  error?: string;
}

// 情绪分析会话接口
export interface EmotionSessionRequest {
  examId: string;
  studentId: string;
  sessionConfig?: {
    frameRate?: number;
    analysisInterval?: number;
    enableFaceDetection?: boolean;
    enableVoiceAnalysis?: boolean;
  };
}

export interface EmotionSessionResponse {
  success: boolean;
  data?: {
    sessionId: string;
    websocketUrl: string;
    expiresAt: string;
  };
  error?: string;
}

class AIApiService {
  // 创建情绪分析会话
  async createEmotionSession(request: EmotionSessionRequest): Promise<EmotionSessionResponse> {
    try {
      const response = await axios.post(`${API_BASE_URL}/emotion/session`, request);
      return response.data;
    } catch (error: any) {
      console.error('创建情绪分析会话失败:', error);
      return {
        success: false,
        error: error.response?.data?.error || '创建情绪分析会话失败',
      };
    }
  }

  // 结束情绪分析会话
  async endEmotionSession(sessionId: string): Promise<{ success: boolean; analysisId?: string; error?: string }> {
    try {
      const response = await axios.post(`${API_BASE_URL}/emotion/session/${sessionId}/end`);
      return response.data;
    } catch (error: any) {
      console.error('结束情绪分析会话失败:', error);
      return {
        success: false,
        error: error.response?.data?.error || '结束情绪分析会话失败',
      };
    }
  }

  // 生成AI报告
  async generateReport(request: GenerateReportRequest): Promise<GenerateReportResponse> {
    try {
      const response = await axios.post(`${API_BASE_URL}/report/generate`, request);
      return response.data;
    } catch (error: any) {
      console.error('生成AI报告失败:', error);
      return {
        success: false,
        error: error.response?.data?.error || '生成AI报告失败',
      };
    }
  }

  // 查询报告状态
  async getReportStatus(reportId: string): Promise<ReportStatusResponse> {
    try {
      const response = await axios.get(`${API_BASE_URL}/report/${reportId}/status`);
      return response.data;
    } catch (error: any) {
      console.error('查询报告状态失败:', error);
      return {
        success: false,
        error: error.response?.data?.error || '查询报告状态失败',
      };
    }
  }

  // 下载报告
  async downloadReport(reportId: string, format: 'pdf' | 'docx' | 'txt' = 'pdf'): Promise<ReportDownloadResponse> {
    try {
      const response = await axios.get(`${API_BASE_URL}/report/${reportId}/download`, {
        params: { format },
      });
      return response.data;
    } catch (error: any) {
      console.error('下载报告失败:', error);
      return {
        success: false,
        error: error.response?.data?.error || '下载报告失败',
      };
    }
  }

  // 获取报告列表
  async getReports(examResultId: string): Promise<{
    success: boolean;
    data?: Array<{
      reportId: string;
      type: string;
      status: string;
      createdAt: string;
      downloadUrl?: string;
    }>;
    error?: string;
  }> {
    try {
      const response = await axios.get(`${API_BASE_URL}/reports`, {
        params: { examResultId },
      });
      return response.data;
    } catch (error: any) {
      console.error('获取报告列表失败:', error);
      return {
        success: false,
        error: error.response?.data?.error || '获取报告列表失败',
      };
    }
  }

  // 轮询报告状态直到完成
  async pollReportStatus(
    reportId: string,
    onProgress?: (progress: number, status: string) => void,
    maxWaitTime: number = 60000 // 最大等待时间60秒
  ): Promise<ReportStatusResponse> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2秒轮询一次

    return new Promise((resolve) => {
      const poll = async () => {
        const response = await this.getReportStatus(reportId);
        
        if (!response.success) {
          resolve(response);
          return;
        }

        const { status, progress } = response.data!;
        
        // 调用进度回调
        if (onProgress) {
          onProgress(progress, status);
        }

        // 如果完成或失败，返回结果
        if (status === 'completed' || status === 'failed') {
          resolve(response);
          return;
        }

        // 如果超时，返回当前状态
        if (Date.now() - startTime > maxWaitTime) {
          resolve({
            success: false,
            error: '报告生成超时，请稍后查看',
          });
          return;
        }

        // 继续轮询
        setTimeout(poll, pollInterval);
      };

      poll();
    });
  }

  // 直接下载文件（触发浏览器下载）
  async triggerDownload(reportId: string, format: 'pdf' | 'docx' | 'txt' = 'pdf'): Promise<boolean> {
    try {
      const response = await this.downloadReport(reportId, format);
      
      if (!response.success || !response.data) {
        console.error('获取下载链接失败:', response.error);
        return false;
      }

      // 创建隐藏的下载链接
      const link = document.createElement('a');
      link.href = response.data.downloadUrl;
      link.download = response.data.filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      return true;
    } catch (error) {
      console.error('下载文件失败:', error);
      return false;
    }
  }
}

// 创建API服务实例
export const aiApiService = new AIApiService();

// React Hook for AI functionality
export const useAIApi = () => {
  return {
    createEmotionSession: aiApiService.createEmotionSession.bind(aiApiService),
    endEmotionSession: aiApiService.endEmotionSession.bind(aiApiService),
    generateReport: aiApiService.generateReport.bind(aiApiService),
    getReportStatus: aiApiService.getReportStatus.bind(aiApiService),
    downloadReport: aiApiService.downloadReport.bind(aiApiService),
    getReports: aiApiService.getReports.bind(aiApiService),
    pollReportStatus: aiApiService.pollReportStatus.bind(aiApiService),
    triggerDownload: aiApiService.triggerDownload.bind(aiApiService),
  };
};

export default aiApiService;