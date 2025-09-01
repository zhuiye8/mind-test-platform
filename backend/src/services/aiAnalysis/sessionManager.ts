/**

 * AI分析会话管理器
 * 负责AI分析会话的创建、停止和状态管理
 */

import axios from 'axios';
import prisma from '../../utils/database';
import { AI_SERVICE_BASE_URL, DEFAULT_TIMEOUT } from './config';
import {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionRequest,
  EndSessionResponse,
  SessionResponse
} from './types';

export class SessionManager {
  /**
   * 创建AI分析会话
   * 触发时机：学生开始考试时调用
   */
  async createSession(examResultId: string, participantId: string, examId: string): Promise<SessionResponse> {
    try {
      console.log(`[AI分析] 为考试结果 ${examResultId} 创建AI会话`, { participantId, examId });

      const response = await axios.post<CreateSessionResponse>(
        `${AI_SERVICE_BASE_URL}/api/create_session`,
        {
          participant_id: participantId,
          exam_id: examId,
        } as CreateSessionRequest,
        {
          timeout: DEFAULT_TIMEOUT.SESSION_OPERATIONS,
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
  async endSession(examResultId: string): Promise<SessionResponse> {
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
          timeout: DEFAULT_TIMEOUT.SESSION_OPERATIONS,
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
   * 确保AI会话处于stopped状态
   * AI会话生命周期：
   * 1. 学生开始答题 → createSession（创建会话）
   * 2. 学生提交答案 → endSession（停止检测，状态变为stopped）  
   * 3. 教师生成报告 → ensureSessionStopped + analyzeQuestions（生成报告）
   */
  async ensureSessionStopped(sessionId: string): Promise<SessionResponse> {
    try {
      console.log(`[AI分析] 确保会话已停止: ${sessionId}`);
      
      const response = await axios.post<EndSessionResponse>(
        `${AI_SERVICE_BASE_URL}/api/end_session`,
        {
          session_id: sessionId,
        } as EndSessionRequest,
        {
          timeout: DEFAULT_TIMEOUT.WEBSOCKET_CHECK, // 较短超时，因为这是预检查
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        console.log(`[AI分析] ✅ 会话 ${sessionId} 已确保停止状态`);
        return { success: true };
      } else {
        // 会话可能已经停止，这不是错误
        console.log(`[AI分析] ℹ️  会话 ${sessionId} 停止响应: ${response.data.message}`);
        return { success: true }; // 继续处理
      }
    } catch (error: any) {
      // 网络错误或会话不存在，记录但不阻止后续操作
      console.warn(`[AI分析] ⚠️  停止会话请求失败，继续尝试生成报告: ${error.message}`);
      return { success: true }; // 继续尝试
    }
  }
}