/**

 * AI分析会话管理器
 * 负责AI分析会话的创建、停止和状态管理
 */

import axios from 'axios';
import prisma from '../../utils/database';
import { generateStreamName } from '../../utils/streamName';
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
   * 创建AI分析会话（重构版：支持无examResultId）
   * 触发时机：学生开始考试时调用
   */
  async createSession(examResultId: string, participantId: string, examId: string): Promise<SessionResponse> {
    try {
      console.log(`[AI分析] 创建AI会话`, { participantId, examId, examResultId: examResultId || 'none' });

      // 查询考试 publicUuid，用于与MediaMTX统一流名
      let publicUuid: string | null = null;
      try {
        const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { publicUuid: true } });
        publicUuid = exam?.publicUuid || null;
      } catch (e) {
        console.warn('[AI分析] 查询考试publicUuid失败，将不附带stream_name');
      }

      // 根据 publicUuid + participantId 生成统一的 stream_name（与WHIP/WHEP一致）
      const streamName = publicUuid ? generateStreamName(publicUuid, participantId) : undefined;

      // 首先调用AI服务创建会话
      const response = await axios.post<CreateSessionResponse>(
        `${AI_SERVICE_BASE_URL}/api/create_session`,
        {
          participant_id: participantId,
          exam_id: examId,
          ...(publicUuid ? { exam_public_uuid: publicUuid } : {}),
          ...(streamName ? { stream_name: streamName } : {}),
        } as CreateSessionRequest,
        {
          timeout: DEFAULT_TIMEOUT.SESSION_OPERATIONS,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success && response.data.session_id) {
        console.log(`[AI分析] AI服务会话创建成功: ${response.data.session_id}`);
        
        // 在数据库中记录会话信息（使用AiSession表）
        try {
          await prisma.aiSession.create({
            data: {
              id: response.data.session_id,
              examId: examId,
              examResultId: examResultId || null, // 可能为null，等提交时再关联
              participant_id: participantId,
              status: 'ACTIVE',
            },
          });
          console.log(`[AI分析] 已记录AI会话到数据库: ${response.data.session_id}`);
        } catch (dbError) {
          console.warn(`[AI分析] 记录会话到数据库失败，但AI会话已创建: ${dbError}`);
          // 不影响会话创建成功的返回结果
        }
        
        // 如果提供了examResultId，更新ExamResult（向后兼容旧逻辑）
        if (examResultId && examResultId.trim() !== '') {
          try {
            await prisma.examResult.update({
              where: { id: examResultId },
              data: { aiSessionId: response.data.session_id },
            });
            console.log(`[AI分析] 已更新考试记录 ${examResultId} 的AI会话ID`);
          } catch (updateError) {
            console.warn(`[AI分析] 更新考试记录失败: ${updateError}`);
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
   * 停止AI检测会话（重构版：多种查找方式）
   * 触发时机：学生提交答案后调用
   */
  async endSession(examResultId: string): Promise<SessionResponse> {
    try {
      let aiSessionId: string | null = null;
      
      // 方式1：通过ExamResult查找AI会话ID（向后兼容）
      if (examResultId) {
        const examResult = await prisma.examResult.findUnique({
          where: { id: examResultId },
          select: { aiSessionId: true, participantId: true, examId: true },
        });
        
        if (examResult?.aiSessionId) {
          aiSessionId = examResult.aiSessionId;
          console.log(`[AI分析] 通过ExamResult找到AI会话: ${aiSessionId}`);
        } else if (examResult) {
          // 方式2：通过participantId + examId查找活跃会话
          console.log(`[AI分析] ExamResult无AI会话ID，尝试通过participantId+examId查找`);
          const aiSession = await prisma.aiSession.findFirst({
            where: {
              participant_id: examResult.participantId,
              examId: examResult.examId,
              status: 'ACTIVE',
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
          
          if (aiSession) {
            aiSessionId = aiSession.id;
            console.log(`[AI分析] 通过participantId+examId找到AI会话: ${aiSessionId}`);
            
            // 更新ExamResult关联
            await prisma.examResult.update({
              where: { id: examResultId },
              data: { aiSessionId: aiSessionId },
            });
          }
        }
      }

      if (!aiSessionId) {
        console.warn(`[AI分析] 未找到活跃的AI会话 (examResultId: ${examResultId})`);
        return {
          success: false,
          error: '未找到AI分析会话',
        };
      }

      console.log(`[AI分析] 停止会话: ${aiSessionId}`);

      // 调用AI服务停止会话
      const response = await axios.post<EndSessionResponse>(
        `${AI_SERVICE_BASE_URL}/api/end_session`,
        {
          session_id: aiSessionId,
        } as EndSessionRequest,
        {
          timeout: DEFAULT_TIMEOUT.SESSION_OPERATIONS,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        // 更新数据库中的会话状态
        try {
          await prisma.aiSession.update({
            where: { id: aiSessionId },
            data: { 
              status: 'ENDED',
              ...(examResultId && { examResultId }), // 只在有值时设置
            },
          });
          console.log(`[AI分析] 会话 ${aiSessionId} 停止成功并更新状态`);
        } catch (updateError) {
          console.warn(`[AI分析] 更新会话状态失败: ${updateError}`);
        }
        
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
