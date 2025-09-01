/**

 * AI分析报告生成器
 * 负责生成心理分析报告，包括缓存检查和重试机制
 */

import axios from 'axios';
import prisma from '../../utils/database';
import { AI_SERVICE_BASE_URL, DEFAULT_TIMEOUT } from './config';
import { SessionManager } from './sessionManager';
import { buildQuestionsDataFromExamResult } from './questionDataBuilder';
import {
  QuestionData,
  AnalyzeQuestionsRequest,
  AnalyzeQuestionsResponse,
  ReportResponse
} from './types';

export class ReportGenerator {
  private sessionManager: SessionManager;

  constructor() {
    this.sessionManager = new SessionManager();
  }

  /**
   * 生成AI心理分析报告（带重试机制和缓存检查）
   * 触发时机：教师点击"AI分析"按钮时调用
   */
  async generateReport(examResultId: string, forceRegenerate: boolean = false): Promise<ReportResponse> {
    console.log(`\n=== AI报告生成开始 ===`);
    console.log(`📊 考试结果ID: ${examResultId}`);
    console.log(`🔄 强制重新生成: ${forceRegenerate}`);

    // 🔍 缓存检查：查找已存在的完成报告
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
            
            return {
              success: true,
              report: cachedReport,
              reportFile: existingReport.filename || undefined,
              cached: true,
            };
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
  private async generateReportWithRetry(examResultId: string, maxRetries: number): Promise<ReportResponse> {
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
        console.log(`[AI分析] 未找到AI会话ID，使用Mock数据生成报告`);
        // 使用Mock数据生成报告
        return await this.generateReportWithMockData(examResult);
      }

      // 验证AI会话ID格式
      if (typeof examResult.aiSessionId !== 'string' || examResult.aiSessionId.trim().length === 0) {
        return {
          success: false,
          error: 'AI会话ID格式无效',
        };
      }

      console.log(`[AI分析] 生成报告，会话ID: ${examResult.aiSessionId}`);

      // 🎯 关键步骤：确保AI会话处于stopped状态
      // AI服务要求在调用analyze_questions前，会话必须先通过end_session停止
      const stopResult = await this.sessionManager.ensureSessionStopped(examResult.aiSessionId);
      if (!stopResult.success) {
        return {
          success: false,
          error: stopResult.error || '无法停止AI检测会话',
        };
      }

      // 构造题目数据 - 优先使用questionResponses，fallback到answers字段
      let questionsData: QuestionData[] = [];
      
      // 数据获取策略：优先使用questionResponses，fallback到answers

      questionsData = buildQuestionsDataFromExamResult(examResult);

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
          timeout: DEFAULT_TIMEOUT.REPORT_GENERATION,
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

        return {
          success: true,
          report: response.data.report,
          reportFile: response.data.report_file,
        };
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

  /**
   * 使用Mock数据生成报告 (已废弃)
   */
  private async generateReportWithMockData(_examResult: any): Promise<ReportResponse> {
    return {
      success: false,
      error: 'Mock数据报告生成功能已废弃，请使用真实AI会话数据'
    };
  }

  // 题目数据构造已迁移到公共模块 questionDataBuilder.ts

}