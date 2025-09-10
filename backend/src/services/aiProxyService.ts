/**

 * AI服务代理
 * 作为中间层转发前端请求到AI服务，解决CORS跨域问题
 */

import axios from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('AIProxyService');

// 定义返回类型
export interface ProxyResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  details?: any;
}

// AI服务配置，未设置时默认连接本地服务
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5678';

/**
 * AI代理服务类
 */
class AIProxyService {
  private aiServiceUrl: string;
  private timeout: number;

  constructor() {
    this.aiServiceUrl = AI_SERVICE_URL;
    this.timeout = 30000; // 30秒超时
    
    logger.info(`初始化AI代理服务，目标地址: ${this.aiServiceUrl}`);
  }

  /**
   * 创建AI分析会话
   */
  async createSession(data: {
    participant_id?: string;
    exam_id?: string;
  }): Promise<ProxyResult> {
    try {
      logger.info('创建会话请求', data);
      
      const response = await axios.post(
        `${this.aiServiceUrl}/api/create_session`,
        data,
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`创建会话成功: ${response.data.session_id}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('创建会话失败', error);
      return this.handleError(error, '创建会话');
    }
  }

  /**
   * 结束AI分析会话
   */
  async endSession(data: {
    session_id: string;
  }): Promise<ProxyResult> {
    try {
      logger.info(`结束会话请求: ${data.session_id}`);
      
      const response = await axios.post(
        `${this.aiServiceUrl}/api/end_session`,
        data,
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('结束会话成功');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('结束会话失败', error);
      return this.handleError(error, '结束会话');
    }
  }

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
  }): Promise<ProxyResult> {
    try {
      logger.info(`分析问题请求，会话ID: ${data.session_id}`);
      logger.info(`问题数量: ${data.questions_data.length}`);
      
      const response = await axios.post(
        `${this.aiServiceUrl}/api/analyze_questions`,
        data,
        {
          timeout: 60000, // 分析可能需要更长时间
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`分析完成，报告长度: ${response.data.report?.length || 0}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('分析问题失败', error);
      return this.handleError(error, '分析问题');
    }
  }

  /**
   * 健康检查
   */
  async checkHealth(): Promise<ProxyResult> {
    try {
      const response = await axios.get(
        `${this.aiServiceUrl}/api/health`,
        {
          timeout: 5000
        }
      );

      return {
        success: true,
        data: {
          status: 'healthy',
          service: 'AI分析服务',
          url: this.aiServiceUrl,
          response: response.data
        }
      };
    } catch (error) {
      logger.error('健康检查失败', error);
      return {
        success: false,
        error: '无法连接到AI服务',
        data: {
          status: 'unhealthy',
          service: 'AI分析服务',
          url: this.aiServiceUrl
        }
      };
    }
  }

  /**
   * 获取WebSocket配置 - V2重构版
   * 返回简化的直连配置，支持前端直接连接AI服务
   * 🔧 基于成功demo的简化策略
   */
  getWebSocketConfig() {
    // 🎯 V2简化策略：直接返回AI服务地址
      const directUrl = 'http://localhost:5678';  // 使用HTTP协议，让Socket.IO自动处理
    
    logger.info(`V2配置: 返回简化直连地址: ${directUrl}`);
    logger.info('传输策略: polling优先，避免WebSocket升级问题');

    return {
      url: directUrl,           // 简化为直接URL
      path: '/socket.io/',      // 标准Socket.IO路径
      transports: ['polling', 'websocket'],  // polling优先策略
      available: true,
      version: '2.0.0',        // 标记为V2版本
      features: {
        sessionCreation: true,
        audioVideoStream: true,
        realTimeAnalysis: true
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 统一错误处理
   */
  private handleError(error: any, operation: string): ProxyResult {
    let errorMessage = `${operation}失败`;
    let errorCode = 'UNKNOWN_ERROR';

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        errorMessage = `${operation}超时`;
        errorCode = 'TIMEOUT';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = `无法连接到AI服务`;
        errorCode = 'CONNECTION_REFUSED';
      } else if (error.response) {
        // AI服务返回了错误响应
        errorMessage = error.response.data?.message || `${operation}失败：${error.response.status}`;
        errorCode = `HTTP_${error.response.status}`;
      } else if (error.request) {
        // 请求已发出但没有收到响应
        errorMessage = `AI服务无响应`;
        errorCode = 'NO_RESPONSE';
      }
    }

    return {
      success: false,
      error: errorMessage,
      errorCode,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
}

// 导出单例
export const aiProxyService = new AIProxyService();
export default aiProxyService;
