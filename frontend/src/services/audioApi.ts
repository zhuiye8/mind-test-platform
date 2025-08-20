import axios from 'axios';
import type { 
  ApiResponse, 
  AudioFileInfo, 
  BatchAudioGenerateRequest,
  BatchAudioGenerateResponse 
} from '../types';

// const BASE_URL = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';
const BASE_URL = '/api';

// 创建专用的axios实例
const audioApiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 300000, // 5分钟超时，因为批量生成可能需要较长时间
});

// 添加认证拦截器
audioApiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
audioApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Audio API Error:', error);
    
    // 处理认证错误
    if (error.response?.status === 401) {
      console.warn('语音API认证失败，可能需要重新登录');
      // 可以在这里添加自动跳转到登录页的逻辑
      // window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

export const audioApi = {
  /**
   * 生成单个题目的语音文件 (旧版本)
   */
  generateQuestionAudio: async (
    questionId: string,
    voiceSettings?: any
  ): Promise<ApiResponse<{ audioId: string; fileUrl: string; duration: number }>> => {
    try {
      const response = await audioApiClient.post(
        `/audio/questions/${questionId}/generate`,
        { voiceSettings }
      );
      return response.data;
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * 生成单个题目的语音文件 (新版本，使用TTS任务管理器)
   */
  generateSingleQuestionAudio: async (
    questionId: string,
    options: {
      voiceSettings?: any;
      async?: boolean; // 是否使用异步模式
    } = {}
  ): Promise<ApiResponse<{ audioId: string; fileUrl: string; duration: number; message?: string }>> => {
    try {
      const response = await audioApiClient.post(
        `/audio/questions/${questionId}/generate-single`,
        {
          voiceSettings: options.voiceSettings,
          async: options.async || false
        }
      );
      return response.data;
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * 删除题目的语音文件
   */
  deleteQuestionAudio: async (questionId: string): Promise<ApiResponse> => {
    try {
      const response = await audioApiClient.delete(`/audio/questions/${questionId}`);
      return response.data;
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * 获取题目语音文件信息
   */
  getQuestionAudioInfo: async (questionId: string): Promise<ApiResponse<AudioFileInfo | null>> => {
    try {
      const response = await audioApiClient.get(`/audio/questions/${questionId}/info`);
      return response.data;
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * 检查题目语音是否需要更新
   */
  checkAudioUpdate: async (
    questionId: string
  ): Promise<ApiResponse<{ needsUpdate: boolean; currentHash?: string }>> => {
    try {
      const response = await audioApiClient.get(`/audio/questions/${questionId}/check-update`);
      return response.data;
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * 批量生成试卷语音文件
   */
  batchGenerateAudio: async (
    paperId: string,
    request: BatchAudioGenerateRequest = {}
  ): Promise<ApiResponse<BatchAudioGenerateResponse>> => {
    try {
      const response = await audioApiClient.post(
        `/teacher/papers/${paperId}/audio/batch-generate`,
        request
      );
      return response.data;
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * 获取试卷音频状态聚合数据 (优化版接口，减少请求次数)
   */
  getPaperAudioStatus: async (paperId: string): Promise<ApiResponse<any>> => {
    try {
      const response = await audioApiClient.get(`/audio/papers/${paperId}/status`);
      return response.data;
    } catch (error: any) {
      console.error('获取试卷音频状态失败:', error);
      throw error;
    }
  },

  /**
   * 清理孤立的语音文件
   */
  cleanupOrphanedAudio: async (): Promise<ApiResponse<{ cleanedCount: number; errors: string[] }>> => {
    try {
      const response = await audioApiClient.post('/audio/cleanup');
      return response.data;
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * 获取语音文件URL（公开访问）
   */
  getAudioFileUrl: (questionId: string, filename: string): string => {
    return `${BASE_URL}/audio/questions/${questionId}/${filename}`;
  },

  /**
   * 下载语音文件
   */
  downloadAudio: async (questionId: string, filename: string): Promise<Blob> => {
    try {
      // 公开访问，不需要认证
      const response = await axios.get(
        `${BASE_URL}/audio/questions/${questionId}/${filename}`,
        { 
          responseType: 'blob',
          timeout: 30000 
        }
      );
      return response.data;
    } catch (error: any) {
      throw error;
    }
  },

  /**
   * 预览语音文件（返回URL供Audio元素使用）
   */
  getPreviewUrl: (questionId: string, filename: string = 'question_audio.mp3'): string => {
    return `${BASE_URL}/audio/questions/${questionId}/${filename}`;
  },

  /**
   * 检查音频文件是否存在且可访问
   */
  checkAudioAccess: async (questionId: string, filename: string = 'question_audio.mp3'): Promise<boolean> => {
    try {
      const response = await axios.head(
        `${BASE_URL}/audio/questions/${questionId}/${filename}`,
        { timeout: 5000 }
      );
      return response.status === 200;
    } catch {
      return false;
    }
  },

  /**
   * 批量检查多个音频文件的状态
   */
  batchCheckAudioStatus: async (
    questionIds: string[]
  ): Promise<Record<string, { exists: boolean; url?: string }>> => {
    const results: Record<string, { exists: boolean; url?: string }> = {};

    // 并行检查所有音频文件
    await Promise.allSettled(
      questionIds.map(async (questionId) => {
        try {
          const exists = await audioApi.checkAudioAccess(questionId);
          results[questionId] = {
            exists,
            url: exists ? audioApi.getPreviewUrl(questionId) : undefined
          };
        } catch {
          results[questionId] = { exists: false };
        }
      })
    );

    return results;
  }
};

// 语音设置管理
export const audioSettings = {
  /**
   * 获取默认语音设置
   */
  getDefault: () => ({
    voice: 'default',
    rate: 1.0,
    pitch: 1.0,
    volume: 0.8,
  }),

  /**
   * 从localStorage获取用户设置
   */
  load: () => {
    try {
      const saved = localStorage.getItem('audioSettings');
      return saved ? JSON.parse(saved) : audioSettings.getDefault();
    } catch {
      return audioSettings.getDefault();
    }
  },

  /**
   * 保存语音设置到localStorage
   */
  save: (settings: any) => {
    try {
      localStorage.setItem('audioSettings', JSON.stringify(settings));
    } catch (error) {
      console.warn('保存语音设置失败:', error);
    }
  },

  /**
   * 重置为默认设置
   */
  reset: () => {
    localStorage.removeItem('audioSettings');
    return audioSettings.getDefault();
  }
};

export default audioApi;