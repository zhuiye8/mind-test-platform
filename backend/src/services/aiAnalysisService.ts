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

// AI服务配置
const AI_SERVICE_BASE_URL = process.env.AI_SERVICE_URL || 'http://192.168.9.84:5000';

// API接口定义
interface CreateSessionRequest {
  student_id?: string;
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

interface QuestionData {
  question_id: string;
  content: string;
  start_time: string; // ISO 8601格式: "2025-08-15T10:00:00.000000"
  end_time: string;
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
   * 创建AI分析会话
   * 触发时机：学生开始考试时调用
   */
  async createSession(examResultId: string, studentId: string, examId: string): Promise<{
    success: boolean;
    sessionId?: string;
    error?: string;
  }> {
    try {
      console.log(`[AI分析] 为考试结果 ${examResultId} 创建AI会话`, { studentId, examId });

      const response = await axios.post<CreateSessionResponse>(
        `${AI_SERVICE_BASE_URL}/api/create_session`,
        {
          student_id: studentId,
          exam_id: examId,
        } as CreateSessionRequest,
        {
          timeout: 10000, // 10秒超时
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success && response.data.session_id) {
        // 更新数据库，保存AI会话ID
        await prisma.examResult.update({
          where: { id: examResultId },
          data: { aiSessionId: response.data.session_id },
        });

        console.log(`[AI分析] 会话创建成功: ${response.data.session_id}`);
        return {
          success: true,
          sessionId: response.data.session_id,
        };
      } else {
        console.error('[AI分析] 创建会话失败:', response.data.message);
        return {
          success: false,
          error: response.data.message || '创建AI分析会话失败',
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
   * 停止AI检测会话
   * 触发时机：学生提交答案后调用
   */
  async endSession(examResultId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // 从数据库获取AI会话ID
      const examResult = await prisma.examResult.findUnique({
        where: { id: examResultId },
        select: { aiSessionId: true },
      });

      if (!examResult?.aiSessionId) {
        console.warn(`[AI分析] 考试结果 ${examResultId} 没有AI会话ID`);
        return {
          success: false,
          error: '未找到AI分析会话',
        };
      }

      console.log(`[AI分析] 停止会话: ${examResult.aiSessionId}`);

      const response = await axios.post<EndSessionResponse>(
        `${AI_SERVICE_BASE_URL}/api/end_session`,
        {
          session_id: examResult.aiSessionId,
        } as EndSessionRequest,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        console.log(`[AI分析] 会话 ${examResult.aiSessionId} 停止成功`);
        return { success: true };
      } else {
        console.error('[AI分析] 停止会话失败:', response.data.message);
        return {
          success: false,
          error: response.data.message || '停止AI检测失败',
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
   * 触发时机：教师点击"AI分析"按钮时调用
   */
  async generateReport(examResultId: string): Promise<{
    success: boolean;
    report?: string | undefined;
    reportFile?: string | undefined;
    error?: string | undefined;
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
        return {
          success: false,
          error: '未找到AI分析会话，请确保学生在答题时启用了AI分析功能',
        };
      }

      console.log(`[AI分析] 生成报告，会话ID: ${examResult.aiSessionId}`);

      // 构造题目数据 - 优先使用questionResponses，fallback到answers字段
      let questionsData: QuestionData[] = [];
      
      // 转换时间格式为AI服务要求的6位微秒格式
      const formatTimeForAI = (date: Date): string => {
        return date.toISOString().replace(/\.\d{3}Z$/, '.000000');
      };

      // 组合content字段：题目 + 学生答案
      const formatQuestionContent = (questionTitle: string, userResponse: string, options: any, questionType: string): string => {
        // 解析选项JSON，将选项字母映射为具体内容
        let answerText = userResponse;
        try {
          if (options && typeof options === 'object') {
            if (questionType === 'multiple_choice') {
              // 多选题：处理逗号分隔的答案
              const selectedOptions = userResponse.split(',').map(opt => opt.trim());
              const mappedAnswers = selectedOptions.map(option => {
                const optionData = options[option];
                return typeof optionData === 'string' ? optionData : 
                       (typeof optionData === 'object' && optionData?.text) ? optionData.text : option;
              });
              answerText = mappedAnswers.join(', ');
            } else {
              // 单选题或文本题
              const optionData = options[userResponse];
              if (optionData) {
                answerText = typeof optionData === 'string' ? optionData : 
                            (typeof optionData === 'object' && optionData?.text) ? optionData.text : userResponse;
              }
            }
          }
        } catch (error) {
          console.warn(`[AI分析] 解析题目选项失败，使用原始答案: ${error}`);
          answerText = userResponse;
        }

        return `题目：${questionTitle}\n答案：${answerText}`;
      };

      if (examResult.questionResponses && examResult.questionResponses.length > 0) {
        // 方法1：使用questionResponses表数据（详细记录）
        console.log(`[AI分析] 使用questionResponses表数据，共 ${examResult.questionResponses.length} 条记录`);
        questionsData = examResult.questionResponses.map((response) => {
          const startTime = response.questionDisplayedAt 
            ? formatTimeForAI(response.questionDisplayedAt)
            : formatTimeForAI(examResult.startedAt || new Date());
          const endTime = formatTimeForAI(response.responseSubmittedAt);

          return {
            question_id: response.questionId,
            content: formatQuestionContent(
              response.question.title,
              response.responseValue,
              response.question.options,
              response.question.questionType
            ),
            start_time: startTime,
            end_time: endTime,
          };
        });
      } else if (examResult.answers && examResult.exam?.paper?.questions) {
        // 方法2：使用answers字段数据（fallback方案）
        console.log(`[AI分析] 使用answers字段数据作为fallback方案`);
        const answers = examResult.answers as Record<string, string>;
        const questions = examResult.exam.paper.questions;
        
        questionsData = questions
          .filter(question => answers[question.id]) // 只处理有答案的题目
          .map((question, index) => {
            // 由于没有具体的答题时间，使用估算时间
            const estimatedStartTime = new Date(examResult.startedAt || new Date());
            estimatedStartTime.setSeconds(estimatedStartTime.getSeconds() + index * 60); // 每题假设1分钟
            const estimatedEndTime = new Date(estimatedStartTime);
            estimatedEndTime.setSeconds(estimatedEndTime.getSeconds() + 60);

            return {
              question_id: question.id,
              content: formatQuestionContent(
                question.title,
                answers[question.id],
                question.options,
                question.questionType
              ),
              start_time: formatTimeForAI(estimatedStartTime),
              end_time: formatTimeForAI(estimatedEndTime),
            };
          });
      }

      // 调试信息：检查数据获取情况
      console.log(`[AI分析] 考试结果ID: ${examResultId}`);
      console.log(`[AI分析] AI会话ID: ${examResult.aiSessionId}`);
      console.log(`[AI分析] questionResponses数量: ${examResult.questionResponses?.length || 0}`);
      console.log(`[AI分析] answers字段存在: ${!!examResult.answers}`);
      console.log(`[AI分析] 发送题目数据，共 ${questionsData.length} 题`);
      
      // 如果没有题目数据，记录详细调试信息
      if (questionsData.length === 0) {
        console.warn(`[AI分析] ⚠️ 警告：没有找到题目响应数据`);
        console.warn(`[AI分析] 考试信息:`, {
          examId: examResult.exam?.id,
          paperId: examResult.exam?.paper?.id,
          questionsCount: examResult.exam?.paper?.questions?.length || 0,
          examResultId: examResult.id,
          hasAnswers: !!examResult.answers,
          answersKeys: examResult.answers ? Object.keys(examResult.answers as any) : [],
        });
        
        return {
          success: false,
          error: '未找到学生的答题记录，无法生成AI分析报告',
        };
      }

      const response = await axios.post<AnalyzeQuestionsResponse>(
        `${AI_SERVICE_BASE_URL}/api/analyze_questions`,
        {
          session_id: examResult.aiSessionId,
          questions_data: questionsData,
        } as AnalyzeQuestionsRequest,
        {
          timeout: 60000, // 报告生成可能需要更长时间，设置60秒超时
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success && response.data.report) {
        console.log(`[AI分析] 报告生成成功，会话: ${examResult.aiSessionId}`);
        
        // 可选：将报告保存到数据库的AI报告表中
        if (response.data.report) {
          await prisma.aIReport.create({
            data: {
              examResultId: examResultId,
              reportType: 'comprehensive',
              status: 'completed',
              progress: 100,
              content: { report: response.data.report },
              filename: response.data.report_file || null,
              fileFormat: 'txt',
              language: 'zh-CN',
              aiProvider: 'custom_ai_service',
              aiModel: 'emotion_analysis_model',
              completedAt: new Date(),
            },
          });
        }

        return {
          success: true,
          report: response.data.report,
          reportFile: response.data.report_file || undefined,
        };
      } else {
        console.error('[AI分析] 生成报告失败:', response.data.message);
        return {
          success: false,
          error: response.data.message || '生成AI分析报告失败',
        };
      }
    } catch (error: any) {
      console.error('[AI分析] 生成报告请求失败:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'AI服务连接失败',
      };
    }
  }

  /**
   * 检查AI服务健康状态
   */
  async checkHealth(): Promise<boolean> {
    try {
      console.log(`[AI分析] 开始健康检查: ${AI_SERVICE_BASE_URL}/api/health`);
      const response = await axios.get(`${AI_SERVICE_BASE_URL}/api/health`, {
        timeout: 5000,
      });
      console.log(`[AI分析] 健康检查成功: ${response.status} ${response.statusText}`);
      return response.status === 200;
    } catch (error: any) {
      console.error('[AI分析] 健康检查失败:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        config: {
          url: error.config?.url,
          timeout: error.config?.timeout,
          proxy: error.config?.proxy,
        }
      });
      return false;
    }
  }

  /**
   * 网络诊断功能
   */
  async networkDiagnostics(): Promise<{
    aiServiceReachable: boolean;
    networkConfig: any;
    proxySettings: any;
    dnsResolution: boolean;
  }> {
    const diagnostics = {
      aiServiceReachable: false,
      networkConfig: {
        baseUrl: AI_SERVICE_BASE_URL,
        timeout: 10000,
      },
      proxySettings: {
        http_proxy: process.env.http_proxy || 'none',
        https_proxy: process.env.https_proxy || 'none',
        HTTP_PROXY: process.env.HTTP_PROXY || 'none',
        HTTPS_PROXY: process.env.HTTPS_PROXY || 'none',
      },
      dnsResolution: false,
    };

    try {
      // 测试AI服务连接
      const healthCheck = await this.checkHealth();
      diagnostics.aiServiceReachable = healthCheck;
      diagnostics.dnsResolution = true;
    } catch (error) {
      console.error('[AI分析] 网络诊断失败:', error);
    }

    return diagnostics;
  }

  /**
   * 获取AI服务配置信息
   */
  getServiceInfo() {
    return {
      baseUrl: AI_SERVICE_BASE_URL,
      endpoints: {
        createSession: '/api/create_session',
        endSession: '/api/end_session',
        analyzeQuestions: '/api/analyze_questions',
        health: '/api/health',
      },
      websocketUrl: `ws://${AI_SERVICE_BASE_URL.replace('http://', '').replace('https://', '')}/socket.io/`,
    };
  }
}

// 导出单例实例
export const aiAnalysisService = AIAnalysisService.getInstance();