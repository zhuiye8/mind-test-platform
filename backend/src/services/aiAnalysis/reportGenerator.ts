/**

 * AI分析报告生成器
 * 负责生成心理分析报告，包括缓存检查和重试机制
 */

import axios from 'axios';
import prisma from '../../utils/database';
import { AI_SERVICE_BASE_URL, DEFAULT_TIMEOUT } from './config';
import { SessionManager } from './sessionManager';
import { buildQuestionsDataFromExamResult } from './questionDataBuilder';
import { matchAIDataForExamResult } from './aiDataMatcher';
import { buildReportPrompt } from './promptBuilder';
import { GenericLLMClient } from '../llm/GenericLLMClient';
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
      // 在生成报告前进行AI数据就绪检查：本地JSON文件是否已落盘
      // 轻量就绪判据：文件存在且大小>1KB
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const filePath = path.join(process.cwd(), 'storage', 'ai-sessions', `${examResultId}.json`);
        const st = await fs.stat(filePath).catch(() => null as any);
        if (!st || st.size < 1024) {
          return { success: false, error: 'AI_DATA_TRANSFERRING' };
        }
      } catch (_) {
        // 文件系统异常按未就绪处理
        return { success: false, error: 'AI_DATA_TRANSFERRING' };
      }

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

      // 确保会话停稳（有会话ID则尽量 stop，一致性更好；无会话也不阻断）
      if (typeof examResult.aiSessionId === 'string' && examResult.aiSessionId.trim()) {
        const stopResult = await this.sessionManager.ensureSessionStopped(examResult.aiSessionId);
        if (!stopResult.success) {
          console.warn('[AI分析] ensureSessionStopped 非致命失败，继续生成报告:', stopResult.error);
        }
      }

      // 构造题目数据（已有工具）
      const questionsData: QuestionData[] = buildQuestionsDataFromExamResult(examResult);
      if (questionsData.length === 0) {
        return { success: false, error: '无法获取考试题目数据，无法生成分析报告' };
      }
      console.log(`[AI分析] 构造了 ${questionsData.length} 条题目数据`);

      // 是否走后端 LLM（默认 true）
      const backendOnly = process.env.AI_REPORT_BACKEND_ONLY !== 'false';
      if (backendOnly) {
        // 1) 匹配 AI 数据（checkpoints/anomalies/aggregates）
        const { sessionId, matches, aggregates, anomalies } = await matchAIDataForExamResult(examResultId);
        if (!sessionId) {
          console.warn('[AI分析] 未找到AI会话数据，报告将缺少多模态融合');
        }

        // 2) 构建 Prompt
        const prompt = buildReportPrompt({
          studentId: examResult.participantId,
          examId: examResult.examId,
          questions: questionsData,
          matches,
          aggregates,
          anomalies,
        });

        // 3) 调用通用 LLM
        const llm = new GenericLLMClient();
        const reportText = await llm.generate(prompt);

        // 4) 保存报告
        const aiReport = await prisma.aIReport.create({
          data: {
            examResultId: examResultId,
            reportType: 'comprehensive',
            status: 'completed',
            progress: 100,
            content: { text: reportText },
            filename: `ai_report_${examResultId}_${Date.now()}.txt`,
            fileFormat: 'txt',
            completedAt: new Date(),
          },
        });
        console.log(`[AI分析] 报告已保存到数据库，ID: ${aiReport.id}`);

        return { success: true, report: reportText, reportFile: aiReport.filename || undefined };
      }

      // 兼容旧路径：调用 AI 服务 analyze_questions（保留回滚能力）
      if (!examResult.aiSessionId) {
        return { success: false, error: '未找到AI分析会话，无法使用外部服务生成报告' };
      }
      const response = await axios.post<AnalyzeQuestionsResponse>(
        `${AI_SERVICE_BASE_URL}/api/analyze_questions`,
        {
          session_id: examResult.aiSessionId,
          questions_data: questionsData,
        } as AnalyzeQuestionsRequest,
        {
          timeout: DEFAULT_TIMEOUT.REPORT_GENERATION,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.data.success && response.data.report) {
        const aiReport = await prisma.aIReport.create({
          data: {
            examResultId: examResultId,
            reportType: 'comprehensive',
            status: 'completed',
            progress: 100,
            content: { text: response.data.report },
            filename: response.data.report_file || `ai_report_${examResultId}_${Date.now()}.txt`,
            fileFormat: 'txt',
            completedAt: new Date(),
          },
        });
        console.log(`[AI分析] 报告已保存到数据库（外部服务），ID: ${aiReport.id}`);
        return { success: true, report: response.data.report, reportFile: response.data.report_file || undefined };
      } else {
        return { success: false, error: response.data.message || 'AI分析失败' };
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

}
