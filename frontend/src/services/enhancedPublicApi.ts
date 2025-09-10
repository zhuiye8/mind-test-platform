/**
 * 增强版公开API
 * 集成失败恢复机制的API服务
 */

import { publicApi } from './api';
import { withRetry, FailureRecoveryService } from './failureRecoveryService';
import type { ApiResponse, Question } from '../types';

const failureRecovery = FailureRecoveryService.getInstance();

/**
 * 增强版公开API，集成失败恢复机制
 */
export const enhancedPublicApi = {
  /**
   * 获取考试信息（带重试）
   */
  async getExam(uuid: string): Promise<ApiResponse<{
    id: string;
    title: string;
    duration_minutes: number;
    password_required: boolean;
    questions?: Question[];
    shuffle_questions: boolean;
  }>> {
    const result = await withRetry(
      () => publicApi.getExam(uuid),
      `get-exam-${uuid}`,
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
      }
    );

    if (!result.success) {
      if (result.degraded) {
        // 降级模式：返回错误但不中断流程
        return {
          success: false,
          error: 'Service temporarily unavailable, please try again later',
          data: null,
          timestamp: new Date().toISOString()
        };
      }
      throw result.error;
    }

    return result.data;
  },

  /**
   * 验证考试密码（带重试）
   */
  async verifyPassword(uuid: string, password: string): Promise<ApiResponse<{
    id: string;
    title: string;
    duration_minutes: number;
    password_required: boolean;
    questions: Question[];
    shuffle_questions: boolean;
    description?: string;
  }>> {
    const result = await withRetry(
      () => publicApi.verifyPassword(uuid, password),
      `verify-password-${uuid}`,
      {
        maxRetries: 2,
        baseDelay: 500,
        maxDelay: 2000,
      }
    );

    if (!result.success) {
      if (result.degraded) {
        return {
          success: false,
          error: 'Password verification temporarily unavailable',
          data: null,
          timestamp: new Date().toISOString()
        };
      }
      throw result.error;
    }

    return result.data;
  },

  /**
   * 提交考试答案（带重试和特殊处理）
   */
  async submitExam(uuid: string, data: {
    participant_id: string;
    participant_name: string;
    answers: Record<string, any>;
    started_at?: string;
    timeline_data?: any;
    voice_interactions?: any;
    device_test_results?: any;
  }): Promise<ApiResponse<{ result_id: string }>> {
    const result = await withRetry(
      () => publicApi.submitExam(uuid, data),
      `submit-exam-${uuid}-${data.participant_id}`,
      {
        maxRetries: 5, // 提交考试最重要，多重试几次
        baseDelay: 2000,
        maxDelay: 30000,
        backoffFactor: 1.5,
        retryableErrors: (error) => {
          // 对于考试提交，大部分错误都应该重试
          // 除了验证错误（4xx客户端错误）
          if (error.response?.status) {
            const status = error.response.status;
            // 4xx错误通常是客户端问题，不重试
            if (status >= 400 && status < 500) {
              // 但是408、409、429这几个状态码可以重试
              return status === 408 || status === 409 || status === 429;
            }
          }
          return true; // 其他错误都重试
        }
      }
    );

    if (!result.success) {
      if (result.degraded) {
        // 对于考试提交，降级模式应该尽量避免
        // 但如果确实无法提交，需要有备用方案
        console.error('Exam submission failed after all retries, storing locally for recovery');
        
        // 存储到本地以便后续恢复
        this.storeFailedSubmission(uuid, data);
        
        return {
          success: false,
          error: 'Submission temporarily failed. Your answers have been saved and will be submitted automatically when connection is restored.',
          data: null,
          timestamp: new Date().toISOString()
        };
      }
      throw result.error;
    }

    // 提交成功后，清除可能存在的失败提交记录
    this.clearFailedSubmission(uuid, data.participant_id);

    return result.data;
  },

  /**
   * 检查重复提交（带重试）
   */
  async checkDuplicateSubmission(uuid: string, participant_id: string): Promise<ApiResponse<{ canSubmit: boolean }>> {
    const result = await withRetry(
      () => publicApi.checkDuplicateSubmission(uuid, participant_id),
      `check-duplicate-${uuid}-${participant_id}`,
      {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 5000,
      }
    );

    if (!result.success) {
      if (result.degraded) {
        // 降级模式：假设可以提交（乐观策略）
        console.warn('Duplicate check failed, allowing submission (degraded mode)');
        return {
          success: true,
          data: { canSubmit: true },
          error: null,
          timestamp: new Date().toISOString()
        };
      }
      throw result.error;
    }

    return result.data;
  },

  /**
   * 创建AI分析会话（带重试）
   */
  async createAISession(uuid: string, data: {
    participant_id: string;
    participant_name: string;
    started_at?: string;
  }): Promise<ApiResponse<{
    exam_result_id: string | null;
    ai_session_id: string | null;
    message: string;
    warning?: string;
  }>> {
    const result = await withRetry(
      () => publicApi.createAISession(uuid, data),
      `create-ai-session-${uuid}-${data.participant_id}`,
      {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 5000,
      }
    );

    if (!result.success) {
      if (result.degraded) {
        // AI会话创建失败不影响考试进行
        console.warn('AI session creation failed, exam will continue without AI analysis');
        return {
          success: true,
          data: {
            exam_result_id: null,
            ai_session_id: null,
            message: 'Exam will continue without AI analysis',
            warning: 'AI analysis is temporarily unavailable'
          },
          error: null,
          timestamp: new Date().toISOString()
        };
      }
      throw result.error;
    }

    return result.data;
  },

  /**
   * 获取AI服务配置（带重试）
   */
  async getAIServiceConfig(): Promise<ApiResponse<{
    websocketUrl: string | null;
    available: boolean;
    features: {
      sessionCreation: boolean;
      emotionAnalysis: boolean;
      reportGeneration: boolean;
    };
    error?: string;
    timestamp: string;
  }>> {
    const result = await withRetry(
      () => publicApi.getAIServiceConfig(),
      'get-ai-service-config',
      {
        maxRetries: 2,
        baseDelay: 500,
        maxDelay: 2000,
      }
    );

    if (!result.success) {
      if (result.degraded) {
        // AI服务配置获取失败，返回不可用状态
        return {
          success: true,
          data: {
            websocketUrl: null,
            available: false,
            features: {
              sessionCreation: false,
              emotionAnalysis: false,
              reportGeneration: false
            },
            error: 'AI service temporarily unavailable',
            timestamp: new Date().toISOString()
          },
          error: null,
          timestamp: new Date().toISOString()
        };
      }
      throw result.error;
    }

    return result.data;
  },

  /**
   * 存储失败的提交数据到本地存储
   */
  storeFailedSubmission(uuid: string, data: any): void {
    try {
      const failedSubmissions = JSON.parse(
        localStorage.getItem('failed_submissions') || '{}'
      );
      
      const key = `${uuid}-${data.participant_id}`;
      failedSubmissions[key] = {
        ...data,
        failedAt: new Date().toISOString(),
        retryCount: 0
      };
      
      localStorage.setItem('failed_submissions', JSON.stringify(failedSubmissions));
      console.log(`Stored failed submission for ${key}`);
    } catch (error) {
      console.error('Failed to store submission data:', error);
    }
  },

  /**
   * 清除失败提交记录
   */
  clearFailedSubmission(uuid: string, participant_id: string): void {
    try {
      const failedSubmissions = JSON.parse(
        localStorage.getItem('failed_submissions') || '{}'
      );
      
      const key = `${uuid}-${participant_id}`;
      delete failedSubmissions[key];
      
      localStorage.setItem('failed_submissions', JSON.stringify(failedSubmissions));
      console.log(`Cleared failed submission for ${key}`);
    } catch (error) {
      console.error('Failed to clear submission data:', error);
    }
  },

  /**
   * 重试所有失败的提交
   */
  async retryFailedSubmissions(): Promise<void> {
    try {
      const failedSubmissions = JSON.parse(
        localStorage.getItem('failed_submissions') || '{}'
      );
      
      const keys = Object.keys(failedSubmissions);
      if (keys.length === 0) {
        return;
      }
      
      console.log(`Found ${keys.length} failed submissions to retry`);
      
      for (const key of keys) {
        const [uuid, participant_id] = key.split('-');
        const submissionData = failedSubmissions[key];
        
        try {
          console.log(`Retrying submission for ${key}`);
          await this.submitExam(uuid, submissionData);
          console.log(`Successfully retried submission for ${key}`);
        } catch (error) {
          console.error(`Failed to retry submission for ${key}:`, error);
          // 更新重试次数
          submissionData.retryCount = (submissionData.retryCount || 0) + 1;
          
          // 如果重试次数过多，标记为需要人工处理
          if (submissionData.retryCount >= 5) {
            submissionData.needsManualIntervention = true;
            console.error(`Submission ${key} needs manual intervention (${submissionData.retryCount} retries)`);
          }
        }
      }
      
      // 更新失败提交记录
      localStorage.setItem('failed_submissions', JSON.stringify(failedSubmissions));
      
    } catch (error) {
      console.error('Failed to retry submissions:', error);
    }
  },

  /**
   * 获取失败恢复服务状态
   */
  getRecoveryStatus(): {
    degradedServices: string[];
    failedSubmissions: number;
    needsManualIntervention: number;
  } {
    const degradedServices = failureRecovery.getDegradedServices();
    
    let failedSubmissions = 0;
    let needsManualIntervention = 0;
    
    try {
      const failures = JSON.parse(localStorage.getItem('failed_submissions') || '{}');
      failedSubmissions = Object.keys(failures).length;
      needsManualIntervention = Object.values(failures).filter(
        (item: any) => item.needsManualIntervention
      ).length;
    } catch (error) {
      console.error('Failed to get recovery status:', error);
    }
    
    return {
      degradedServices,
      failedSubmissions,
      needsManualIntervention
    };
  }
};

// 启动时尝试重试失败的提交
setTimeout(() => {
  enhancedPublicApi.retryFailedSubmissions().catch(console.error);
}, 5000);

// 每5分钟尝试重试一次失败的提交
setInterval(() => {
  enhancedPublicApi.retryFailedSubmissions().catch(console.error);
}, 5 * 60 * 1000);

export default enhancedPublicApi;
