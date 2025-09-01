/**
 * AI分析服务 - 对接外部AI服务 (http://192.168.9.84:5000)
 * 
 * 工作流程：
 * 1. 学生开始考试时：创建AI分析会话 (create_session)
 * 2. 学生提交答案时：停止检测 (end_session)
 * 3. 教师查看分析时：生成心理分析报告 (analyze_questions)
 */

import axios from 'axios';
import prisma from '../utils/database';
import { buildQuestionsDataFromExamResult, type QuestionData } from './aiAnalysis/questionDataBuilder';

// AI服务配置 - 支持动态配置，不硬编码地址
const AI_SERVICE_BASE_URL = process.env.AI_SERVICE_URL || 'http://192.168.9.84:5000';

// API接口定义
interface CreateSessionRequest {
  participant_id?: string;
  exam_id?: string;
}

interface CreateSessionResponse {
  success: boolean;
  session_id?: string;
  message: string;
}

interface EndSessionRequest {
  session_id: string;
}

interface EndSessionResponse {
  success: boolean;
  session_id: string;
  message: string;
}


interface AnalyzeQuestionsRequest {
  session_id: string;
  questions_data: QuestionData[];
}

interface AnalyzeQuestionsResponse {
  success: boolean;
  session_id: string;
  report?: string;
  report_file?: string;
  message: string;
}

export class AIAnalysisService {
  private static instance: AIAnalysisService;

  public static getInstance(): AIAnalysisService {
    if (!AIAnalysisService.instance) {
      AIAnalysisService.instance = new AIAnalysisService();
    }
    return AIAnalysisService.instance;
  }

  /**
   * 检查AI服务可用性（健康检查）
   */
  async checkServiceHealth(): Promise<{
    available: boolean;
    error?: string;
  }> {
    try {
      console.log('[AI分析] 检查服务可用性...');
      const response = await axios.get(`${AI_SERVICE_BASE_URL}/api/health`, {
        timeout: 5000, // 5秒超时
      });
      
      if (response.status === 200) {
        console.log('[AI分析] 服务健康检查通过');
        return { available: true };
      } else {
        return { available: false, error: '服务健康检查失败' };
      }
    } catch (error: any) {
      console.warn('[AI分析] 服务不可用:', error.message);
      return { 
        available: false, 
        error: error.code === 'ECONNREFUSED' ? '服务未启动' : error.message 
      };
    }
  }

  /**
   * 检查WebSocket健康状态
   */
  async checkWebSocketHealth(): Promise<{
    available: boolean;
    error?: string;
    diagnostics?: any;
    websocketUrl?: string;
  }> {
    try {
      const healthCheck = await this.checkServiceHealth();
      if (!healthCheck.available) {
        return {
          available: false,
          error: healthCheck.error || 'AI服务不可用',
          websocketUrl: `${AI_SERVICE_BASE_URL}/socket.io/`
        };
      }

      return {
        available: true,
        websocketUrl: `${AI_SERVICE_BASE_URL}/socket.io/`,
        diagnostics: {
          responseTime: 0,
          networkPath: AI_SERVICE_BASE_URL
        }
      };
    } catch (error: any) {
      return {
        available: false,
        error: error.message || 'WebSocket健康检查失败',
        websocketUrl: `${AI_SERVICE_BASE_URL}/socket.io/`
      };
    }
  }

  /**
   * 获取服务信息
   */
  async getServiceInfo(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const healthCheck = await this.checkServiceHealth();
      const result: {
        success: boolean;
        data?: any;
        error?: string;
      } = {
        success: healthCheck.available,
        data: {
          baseUrl: AI_SERVICE_BASE_URL,
          status: healthCheck.available ? 'online' : 'offline'
        }
      };
      
      if (healthCheck.error) {
        result.error = healthCheck.error;
      }
      
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '获取服务信息失败'
      };
    }
  }

  /**
   * 创建AI分析会话
   */
  async createSession(examResultId: string, participantId: string, examId: string): Promise<{
    success: boolean;
    sessionId?: string;
    error?: string;
  }> {
    try {
      console.log(`[AI分析] 创建会话 - examResultId: ${examResultId}, participantId: ${participantId}, examId: ${examId}`);

      const createResponse = await axios.post<CreateSessionResponse>(
        `${AI_SERVICE_BASE_URL}/api/create_session`,
        {
          participant_id: participantId,
          exam_id: examId,
        } as CreateSessionRequest,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (createResponse.data.success && createResponse.data.session_id) {
        const sessionId = createResponse.data.session_id;
        console.log(`[AI分析] ✅ 会话创建成功: ${sessionId}`);

        // 更新考试结果记录，保存AI会话ID
        await prisma.examResult.update({
          where: { id: examResultId },
          data: {
            aiSessionId: sessionId,
          },
        });

        console.log(`[AI分析] 已保存会话ID到数据库: ${sessionId}`);

        return {
          success: true,
          sessionId: sessionId,
        };
      } else {
        console.error('[AI分析] AI会话创建失败:', createResponse.data.message);
        return {
          success: false,
          error: createResponse.data.message || 'AI会话创建失败',
        };
      }
    } catch (error: any) {
      console.error('[AI分析] 创建会话请求失败:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'AI服务连接失败',
      };
    }
  }

  /**
   * 结束AI分析会话
   */
  async endSession(examResultId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      // 获取会话ID
      const examResult = await prisma.examResult.findUnique({
        where: { id: examResultId },
        select: { aiSessionId: true },
      });

      if (!examResult?.aiSessionId) {
        console.log(`[AI分析] 考试结果 ${examResultId} 没有关联的AI会话`);
        return {
          success: true,
          message: '没有需要结束的AI会话',
        };
      }

      const sessionId = examResult.aiSessionId;
      console.log(`[AI分析] 结束会话: ${sessionId}`);

      // 调用AI服务结束会话
      const endResponse = await axios.post<EndSessionResponse>(
        `${AI_SERVICE_BASE_URL}/api/end_session`,
        {
          session_id: sessionId,
        } as EndSessionRequest,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (endResponse.data.success) {
        console.log(`[AI分析] ✅ 会话结束成功: ${sessionId}`);
        return {
          success: true,
          message: `会话 ${sessionId} 已结束`,
        };
      } else {
        console.error('[AI分析] 结束会话失败:', endResponse.data.message);
        return {
          success: false,
          error: endResponse.data.message || '结束会话失败',
        };
      }
    } catch (error: any) {
      console.error('[AI分析] 结束会话请求失败:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'AI服务连接失败',
      };
    }
  }

  /**
   * 确保AI会话处于停止状态（内部方法）
   */
  private async ensureSessionStopped(sessionId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log(`[AI分析] 确保会话停止: ${sessionId}`);

      const response = await axios.post<EndSessionResponse>(
        `${AI_SERVICE_BASE_URL}/api/end_session`,
        { session_id: sessionId } as EndSessionRequest,
        {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.data.success) {
        console.log(`[AI分析] ✅ 会话 ${sessionId} 已停止`);
        return { success: true };
      } else {
        console.error(`[AI分析] 停止会话失败: ${response.data.message}`);
        return {
          success: false,
          error: response.data.message || '停止会话失败',
        };
      }
    } catch (error: any) {
      console.error('[AI分析] 停止会话请求失败:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'AI服务连接失败',
      };
    }
  }

  /**
   * 生成AI心理分析报告
   */
  async generateReport(examResultId: string, forceRegenerate: boolean = false): Promise<{
    success: boolean;
    report?: string;
    reportFile?: string;
    cached?: boolean;
    error?: string;
  }> {
    console.log(`\n=== AI报告生成开始 ===`);
    console.log(`📊 考试结果ID: ${examResultId}`);
    console.log(`🔄 强制重新生成: ${forceRegenerate}`);

    // 缓存检查：查找已存在的完成报告
    if (!forceRegenerate) {
      try {
        const existingReport = await prisma.aIReport.findFirst({
          where: {
            examResultId: examResultId,
            status: 'completed',
          },
          orderBy: {
            createdAt: 'desc', // 获取最新的完成报告
          },
        });

        if (existingReport && existingReport.content) {
          console.log(`📋 发现缓存报告: ${existingReport.id}`);
          console.log(`📅 生成时间: ${existingReport.completedAt}`);
          
          // 提取报告内容
          let cachedReport = '';
          if (typeof existingReport.content === 'object' && existingReport.content !== null) {
            cachedReport = (existingReport.content as any).text || 
                          (existingReport.content as any).report || 
                          JSON.stringify(existingReport.content);
          } else if (typeof existingReport.content === 'string') {
            cachedReport = existingReport.content;
          }

          if (cachedReport) {
            console.log(`✅ 返回缓存报告，长度: ${cachedReport.length} 字符`);
            console.log(`=== AI报告生成结束（缓存） ===\n`);
            
            const cachedResult: {
              success: boolean;
              report?: string;
              reportFile?: string;
              cached?: boolean;
            } = {
              success: true,
              report: cachedReport,
              cached: true,
            };
            
            if (existingReport.filename) {
              cachedResult.reportFile = existingReport.filename;
            }
            
            return cachedResult;
          }
        }
        
        console.log(`📝 未发现可用缓存报告，开始生成新报告`);
      } catch (cacheError) {
        console.warn(`⚠️  缓存检查失败，继续生成新报告: ${cacheError}`);
      }
    } else {
      console.log(`🔄 跳过缓存检查，强制生成新报告`);
    }

    // 生成新报告
    const result = await this.generateReportWithRetry(examResultId, 1); // 最多重试1次
    
    // 标记为非缓存报告
    return {
      ...result,
      cached: false,
    };
  }

  /**
   * 生成AI心理分析报告的内部实现（支持重试）
   */
  private async generateReportWithRetry(examResultId: string, maxRetries: number): Promise<{
    success: boolean;
    report?: string;
    reportFile?: string;
    error?: string;
  }> {
    try {
      // 获取考试结果和相关数据
      const examResult = await prisma.examResult.findUnique({
        where: { id: examResultId },
        include: {
          exam: {
            include: {
              paper: {
                include: {
                  questions: {
                    orderBy: { questionOrder: 'asc' },
                  },
                },
              },
            },
          },
          questionResponses: {
            include: {
              question: true,
            },
            orderBy: { questionOrder: 'asc' },
          },
        },
      });

      if (!examResult) {
        return {
          success: false,
          error: '考试结果不存在',
        };
      }

      if (!examResult.aiSessionId) {
        console.log(`[AI分析] 未找到AI会话ID，无法生成报告`);
        return {
          success: false,
          error: 'AI会话ID不存在，无法生成分析报告',
        };
      }

      // 验证AI会话ID格式
      if (typeof examResult.aiSessionId !== 'string' || examResult.aiSessionId.trim().length === 0) {
        return {
          success: false,
          error: 'AI会话ID格式无效',
        };
      }

      console.log(`[AI分析] 生成报告，会话ID: ${examResult.aiSessionId}`);

      // 确保AI会话处于停止状态
      const stopResult = await this.ensureSessionStopped(examResult.aiSessionId);
      if (!stopResult.success) {
        return {
          success: false,
          error: stopResult.error || '无法停止AI检测会话',
        };
      }

      // 构造题目数据
      const questionsData: QuestionData[] = buildQuestionsDataFromExamResult(examResult);

      if (questionsData.length === 0) {
        return {
          success: false,
          error: '无法获取考试题目数据，无法生成分析报告'
        };
      }

      console.log(`[AI分析] 构造了 ${questionsData.length} 条题目数据`);

      // 调用AI服务分析
      const response = await axios.post<AnalyzeQuestionsResponse>(
        `${AI_SERVICE_BASE_URL}/api/analyze_questions`,
        {
          session_id: examResult.aiSessionId,
          questions_data: questionsData,
        } as AnalyzeQuestionsRequest,
        {
          timeout: 60000, // 60秒超时
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success && response.data.report) {
        console.log(`[AI分析] ✅ 报告生成成功`);

        // 保存AI报告到数据库
        const aiReport = await prisma.aIReport.create({
          data: {
            examResultId: examResultId,
            reportType: 'comprehensive',
            status: 'completed',
            progress: 100,
            content: { text: response.data.report }, // JSON格式
            filename: response.data.report_file || `ai_report_${examResultId}_${Date.now()}.txt`,
            fileFormat: 'txt',
            completedAt: new Date(),
          },
        });

        console.log(`[AI分析] 报告已保存到数据库，ID: ${aiReport.id}`);

        const result: {
          success: boolean;
          report?: string;
          reportFile?: string;
        } = {
          success: true,
          report: response.data.report,
        };
        
        if (response.data.report_file) {
          result.reportFile = response.data.report_file;
        }
        
        return result;
      } else {
        console.error('[AI分析] AI分析失败:', response.data.message);
        return {
          success: false,
          error: response.data.message || 'AI分析失败',
        };
      }
    } catch (error: any) {
      console.error('[AI分析] 报告生成请求失败:', error);
      
      // 如果有重试次数，尝试重试
      if (maxRetries > 0) {
        console.log(`[AI分析] 重试报告生成，剩余 ${maxRetries} 次`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
        return this.generateReportWithRetry(examResultId, maxRetries - 1);
      }
      
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'AI服务连接失败',
      };
    }
  }

  // 题目数据构造已迁移到公共模块 questionDataBuilder.ts

  /**
   * 检查AI服务健康状态（简化版）
   */
  async checkHealth(): Promise<boolean> {
    try {
      const health = await this.checkServiceHealth();
      return health.available;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取原始情绪数据（已废弃 - 需要真实AI会话数据）
   */
  async getRawEmotionDataWithTimestamp(_examResultId: string, _metadata: { examTitle: string; participantName: string }) {
    throw new Error('原始情绪数据功能需要真实AI会话数据，请先完成AI分析');
  }

  /**
   * 获取格式化的情绪数据（已废弃 - 需要真实AI会话数据）
   */
  async getFormattedEmotionData(_examResultId: string) {
    throw new Error('格式化情绪数据预览功能需要真实AI会话数据，请先完成AI分析');
  }
}

export const aiAnalysisService = AIAnalysisService.getInstance();