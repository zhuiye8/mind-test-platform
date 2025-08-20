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

// AI服务配置 - 支持动态配置，不硬编码地址
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
        console.log(`[AI分析] 会话创建成功: ${response.data.session_id}`);
        
        // 如果提供了examResultId，更新数据库（向后兼容）
        if (examResultId && examResultId.trim() !== '') {
          try {
            await prisma.examResult.update({
              where: { id: examResultId },
              data: { aiSessionId: response.data.session_id },
            });
            console.log(`[AI分析] 已更新考试记录 ${examResultId} 的AI会话ID`);
          } catch (updateError) {
            console.warn(`[AI分析] 更新考试记录失败，但AI会话已创建: ${updateError}`);
            // 不影响会话创建成功的返回结果
          }
        }
        
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
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout,
          baseURL: AI_SERVICE_BASE_URL,
        },
        isTimeout: error.code === 'ECONNABORTED',
        isNetworkError: error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND',
      });
      return false;
    }
  }

  /**
   * 检查WebSocket连接可用性 - 增强版本 
   * 提供更详细的诊断信息和错误分析
   */
  async checkWebSocketHealth(): Promise<{
    available: boolean;
    websocketUrl: string;
    error?: string;
    diagnostics?: {
      httpReachable: boolean;
      configValid: boolean;
      responseTime: number;
      serviceInfo?: any;
      networkPath?: string;
      urlComponents?: {
        protocol: string;
        hostname: string;
        port: string;
        path: string;
      };
      troubleshooting?: string[];
    };
  }> {
    const websocketUrl = this.buildWebSocketUrl(AI_SERVICE_BASE_URL);
    const startTime = Date.now();
    
    const diagnostics = {
      httpReachable: false,
      configValid: false,
      responseTime: 0,
      serviceInfo: null,
      networkPath: '',
      urlComponents: {
        protocol: '',
        hostname: '',
        port: '',
        path: ''
      },
      troubleshooting: [] as string[]
    };

    try {
      // 1. 验证配置有效性并解析URL组件
      if (!AI_SERVICE_BASE_URL || AI_SERVICE_BASE_URL.trim() === '') {
        return {
          available: false,
          websocketUrl,
          error: 'AI_SERVICE_URL环境变量未配置或为空',
          diagnostics: {
            ...diagnostics,
            troubleshooting: [
              '在 .env 文件中设置 AI_SERVICE_URL=http://192.168.0.204:5000',
              '重启后端服务以加载新的环境变量',
              '确认AI服务的实际IP地址和端口'
            ]
          }
        };
      }

      try {
        const parsedUrl = new URL(AI_SERVICE_BASE_URL);
        diagnostics.configValid = true;
        diagnostics.urlComponents = {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
          path: parsedUrl.pathname
        };
        diagnostics.networkPath = `${parsedUrl.protocol}//${parsedUrl.hostname}:${diagnostics.urlComponents.port}`;
      } catch (urlError) {
        return {
          available: false,
          websocketUrl,
          error: `AI服务URL格式无效: ${AI_SERVICE_BASE_URL}`,
          diagnostics: {
            ...diagnostics,
            troubleshooting: [
              '检查URL格式，应该是 http://IP:端口 的格式',
              '例如：AI_SERVICE_URL=http://192.168.0.204:5000',
              '确认协议(http/https)、IP地址和端口号都正确'
            ]
          }
        };
      }

      console.log(`[AI分析] WebSocket健康检查开始:`);
      console.log(`  🔍 检查目标: ${AI_SERVICE_BASE_URL}`);
      console.log(`  🌐 WebSocket地址: ${websocketUrl}`);
      console.log(`  📍 解析结果: ${diagnostics.networkPath}`);
      console.log(`  ⚙️  环境变量: AI_SERVICE_URL=${process.env.AI_SERVICE_URL || '未设置'}`);

      // 2. 检查HTTP服务可用性
      console.log(`[AI分析] 正在检查HTTP服务可达性...`);
      const httpHealth = await this.checkHealth();
      diagnostics.responseTime = Date.now() - startTime;
      
      if (!httpHealth) {
        const errorMsg = `AI服务HTTP接口不可达`;
        console.error(`[AI分析] ❌ ${errorMsg}`);
        console.error(`[AI分析] 🔧 诊断建议:`);
        console.error(`  1. 检查AI服务是否在 ${diagnostics.networkPath} 运行`);
        console.error(`  2. 验证IP地址 ${diagnostics.urlComponents.hostname} 是否正确`);
        console.error(`  3. 检查端口 ${diagnostics.urlComponents.port} 是否开放`);
        console.error(`  4. 测试网络连通性: ping ${diagnostics.urlComponents.hostname}`);
        console.error(`  5. 检查防火墙是否阻止连接`);
        
        return {
          available: false,
          websocketUrl,
          error: `${errorMsg} (${diagnostics.networkPath})`,
          diagnostics: {
            ...diagnostics,
            troubleshooting: [
              `在AI服务器上启动服务: python app.py`,
              `检查服务是否监听 ${diagnostics.urlComponents.port} 端口`,
              `验证IP地址 ${diagnostics.urlComponents.hostname} 的可达性`,
              `检查防火墙规则是否允许端口 ${diagnostics.urlComponents.port}`,
              `确认AI服务的健康检查端点 /api/health 可用`
            ]
          }
        };
      }
      
      diagnostics.httpReachable = true;
      console.log(`[AI分析] ✅ HTTP服务可达 (${diagnostics.responseTime}ms)`);

      // 3. 尝试获取AI服务详细信息
      try {
        console.log(`[AI分析] 正在获取AI服务详细信息...`);
        const serviceInfoResponse = await axios.get(`${AI_SERVICE_BASE_URL}/info`, {
          timeout: 3000,
          headers: {
            'Content-Type': 'application/json',
          }
        });
        diagnostics.serviceInfo = serviceInfoResponse.data;
        console.log(`[AI分析] 📋 AI服务信息:`, serviceInfoResponse.data);
      } catch (infoError) {
        // 获取服务信息失败不影响主要健康检查
        console.log(`[AI分析] ℹ️  无法获取AI服务详细信息 (非必需功能)`);
      }

      // 4. 验证Socket.IO端点（可选）
      try {
        console.log(`[AI分析] 正在验证Socket.IO端点...`);
        const socketIoResponse = await axios.get(`${AI_SERVICE_BASE_URL}/socket.io/`, {
          timeout: 2000,
          validateStatus: (status) => status < 500 // 接受所有非5xx状态码
        });
        console.log(`[AI分析] ✅ Socket.IO端点响应: ${socketIoResponse.status}`);
      } catch (socketError) {
        console.log(`[AI分析] ⚠️  Socket.IO端点检查异常 (不影响主要功能)`);
      }

      // 5. 最终健康检查总结
      console.log(`[AI分析] 🎉 WebSocket健康检查完成:`);
      console.log(`  ✅ HTTP服务可达 (${diagnostics.responseTime}ms)`);
      console.log(`  ✅ WebSocket URL构建: ${websocketUrl}`);
      console.log(`  ✅ 配置验证通过`);
      console.log(`  🎯 目标服务: ${diagnostics.networkPath}`);
      
      return {
        available: true,
        websocketUrl,
        diagnostics: {
          ...diagnostics,
          troubleshooting: [
            'AI服务运行正常，WebSocket连接应该可用',
            '如果前端仍有连接问题，请检查浏览器控制台错误信息',
            '确认前端获取的WebSocket URL与后端一致'
          ]
        }
      };
      
    } catch (error: any) {
      diagnostics.responseTime = Date.now() - startTime;
      
      console.error(`[AI分析] ❌ WebSocket健康检查失败:`, error.message);
      console.error(`[AI分析] 🔍 错误详情:`, {
        message: error.message,
        code: error.code,
        responseTime: diagnostics.responseTime,
        targetUrl: AI_SERVICE_BASE_URL,
        networkPath: diagnostics.networkPath
      });

      // 提供详细的错误分析和解决方案
      let errorMessage = error.message;
      let troubleshooting = [] as string[];

      if (error.code === 'ECONNREFUSED') {
        errorMessage = `连接被拒绝 - AI服务未启动或端口未开放`;
        troubleshooting = [
          '在AI服务器上启动服务',
          '确认服务监听正确的端口',
          '检查端口是否被其他程序占用',
          '验证服务配置文件中的端口设置'
        ];
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = `域名或IP地址无法解析 (${diagnostics.urlComponents.hostname})`;
        troubleshooting = [
          '检查IP地址是否正确',
          '验证网络连通性',
          '确认DNS解析正常',
          '尝试使用ping命令测试主机可达性'
        ];
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = `连接超时 - 网络不可达或防火墙阻止`;
        troubleshooting = [
          '检查网络连接',
          '验证防火墙设置',
          '确认路由配置',
          '检查VPN或代理设置'
        ];
      } else if (error.code === 'ECONNRESET') {
        errorMessage = `连接被重置 - AI服务可能正在重启`;
        troubleshooting = [
          '等待AI服务完全启动',
          '检查服务日志',
          '验证服务稳定性',
          '确认服务配置无误'
        ];
      } else {
        troubleshooting = [
          '检查AI服务状态',
          '验证网络配置',
          '查看详细日志信息',
          '确认所有依赖服务正常'
        ];
      }

      console.error(`[AI分析] 🔧 建议的解决方案:`);
      troubleshooting.forEach((tip, index) => {
        console.error(`  ${index + 1}. ${tip}`);
      });

      return {
        available: false,
        websocketUrl,
        error: `${errorMessage} (${diagnostics.networkPath || AI_SERVICE_BASE_URL})`,
        diagnostics: {
          ...diagnostics,
          troubleshooting
        }
      };
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
   * 智能构建WebSocket URL
   * 支持各种协议和端口配置，完全动态化
   */
  private buildWebSocketUrl(httpUrl: string): string {
    try {
      // 使用URL解析器进行标准化处理
      const url = new URL(httpUrl);
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const websocketUrl = `${protocol}//${url.host}/socket.io/`;
      
      console.log(`[AI分析] WebSocket URL构建: ${httpUrl} → ${websocketUrl}`);
      return websocketUrl;
    } catch (error) {
      console.warn(`[AI分析] URL解析失败，使用fallback逻辑: ${error}`);
      // Fallback到原逻辑，但更加健壮
      const cleanUrl = httpUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const websocketUrl = `ws://${cleanUrl}/socket.io/`;
      console.log(`[AI分析] WebSocket URL fallback构建: ${httpUrl} → ${websocketUrl}`);
      return websocketUrl;
    }
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
      websocketUrl: this.buildWebSocketUrl(AI_SERVICE_BASE_URL),
    };
  }
}

// 导出单例实例
export const aiAnalysisService = AIAnalysisService.getInstance();