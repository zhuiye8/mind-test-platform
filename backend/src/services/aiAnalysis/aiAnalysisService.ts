/**

 * AI分析服务主类 - 重构版本
 * 对接外部AI服务 (默认 http://localhost:5678)
 * 
 * 工作流程：
 * 1. 学生开始考试时：创建AI分析会话 (create_session)
 * 2. 学生提交答案时：停止检测 (end_session)
 * 3. 教师查看分析时：生成心理分析报告 (analyze_questions)
 */

import { SessionManager } from './sessionManager';
import { HealthChecker } from './healthChecker';
import { ReportGenerator } from './reportGenerator';
// EmotionDataProcessor已重构为独立函数，不需要类导入
import { AI_SERVICE_BASE_URL, buildWebSocketUrl } from './config';
import {
  ServiceHealthResponse,
  SessionResponse,
  ReportResponse,
  WebSocketHealthResponse,
  NetworkDiagnosticsResponse
} from './types';

export class AIAnalysisService {
  private static instance: AIAnalysisService;
  private sessionManager: SessionManager;
  private healthChecker: HealthChecker;
  private reportGenerator: ReportGenerator;
  // emotionDataProcessor已重构为独立函数，不再需要实例

  private constructor() {
    this.sessionManager = new SessionManager();
    this.healthChecker = new HealthChecker();
    this.reportGenerator = new ReportGenerator();
    // emotionDataProcessor现在是独立函数，无需实例化
  }

  public static getInstance(): AIAnalysisService {
    if (!AIAnalysisService.instance) {
      AIAnalysisService.instance = new AIAnalysisService();
    }
    return AIAnalysisService.instance;
  }

  // ==================== 会话管理 ====================

  /**
   * 创建AI分析会话
   * 触发时机：学生开始考试时调用
   */
  async createSession(examResultId: string, participantId: string, examId: string): Promise<SessionResponse> {
    return this.sessionManager.createSession(examResultId, participantId, examId);
  }

  /**
   * 停止AI检测会话
   * 触发时机：学生提交答案后调用
   */
  async endSession(examResultId: string): Promise<SessionResponse> {
    return this.sessionManager.endSession(examResultId);
  }

  // ==================== 报告生成 ====================

  /**
   * 生成AI心理分析报告（带重试机制和缓存检查）
   * 触发时机：教师点击"AI分析"按钮时调用
   */
  async generateReport(examResultId: string, forceRegenerate: boolean = false): Promise<ReportResponse> {
    return this.reportGenerator.generateReport(examResultId, forceRegenerate);
  }

  // ==================== 健康检查 ====================

  /**
   * 检查AI服务可用性（健康检查）
   */
  async checkServiceHealth(): Promise<ServiceHealthResponse> {
    return this.healthChecker.checkServiceHealth();
  }

  /**
   * 基础健康检查
   */
  async checkHealth(): Promise<boolean> {
    return this.healthChecker.checkHealth();
  }

  /**
   * 检查WebSocket连接可用性 - 增强版本 
   * 提供更详细的诊断信息和错误分析
   */
  async checkWebSocketHealth(): Promise<WebSocketHealthResponse> {
    return this.healthChecker.checkWebSocketHealth();
  }

  /**
   * 综合网络诊断
   * 提供AI服务连接的完整诊断信息
   */
  async networkDiagnostics(): Promise<NetworkDiagnosticsResponse> {
    return this.healthChecker.networkDiagnostics();
  }

  // ==================== 情感数据处理 ====================

  /**
   * 从JSON文件获取原始情绪数据（新架构）
   */
  async getRawEmotionDataWithTimestamp(examResultId: string, _metadata: { examTitle: string; participantName: string }) {
    const fs = (await import('fs/promises'));
    const path = (await import('path'));
    const prisma = (await import('../../utils/database')).default;
    
    try {
      // 1. 尝试从JSON文件读取
      const filePath = path.join(process.cwd(), 'storage', 'ai-sessions', `${examResultId}.json`);
      
      try {
        // 读取本地JSON文件（AI finalize 回传保存）
        const stat = await fs.stat(filePath);
        // 简单就绪判据：文件存在且大小>1KB（过小可能仅为占位/空数组）
        if (!stat || stat.size < 1024) {
          return {
            session_id: null,
            exam_result_id: examResultId,
            transferring: true,
            message: 'AI分析数据正在生成和传输中，请稍后重试',
          };
        }
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const jsonData = JSON.parse(fileContent);
        
        console.log(`[AI分析] 从文件读取成功: ${filePath}, 视频情绪:${jsonData.video_emotions?.length || 0}, 音频情绪:${jsonData.audio_emotions?.length || 0}, 心率:${jsonData.heart_rate_data?.length || 0}`);
        
        // 返回标准格式
        return {
          session_id: jsonData.session_id,
          exam_result_id: examResultId,
          start_time: jsonData.start_time || jsonData.started_at,
          end_time: jsonData.end_time || jsonData.ended_at,
          video_emotions: jsonData.video_emotions || [],
          audio_emotions: jsonData.audio_emotions || [],
          heart_rate_data: jsonData.heart_rate_data || [],
          aggregates: jsonData.aggregates || {},
          anomalies_timeline: jsonData.anomalies_timeline || [],
          message: 'ok'
        };
        
      } catch (fileError) {
        console.log(`[AI分析] JSON文件不存在，尝试兼容模式: ${filePath}`);
        
        // 2. 兼容模式：从数据库读取基本信息
        const examResult = await prisma.examResult.findUnique({
          where: { id: examResultId },
          select: { 
            aiSessionId: true, 
            startedAt: true, 
            submittedAt: true,
            participantId: true,
            examId: true
          }
        });
        
        if (!examResult) {
          return {
            session_id: null,
            exam_result_id: examResultId,
            start_time: null,
            end_time: null,
            video_emotions: [],
            audio_emotions: [],
            heart_rate_data: [],
            aggregates: {},
            anomalies_timeline: [],
            message: '考试结果不存在',
          };
        }
        
        // 尝试查找AI会话
        let sessionId = examResult.aiSessionId;
        if (!sessionId) {
          const session = await prisma.aiSession.findFirst({
            where: { 
              examResultId: examResultId 
            },
            orderBy: { createdAt: 'desc' }
          });
          sessionId = session?.id || null;
        }
        
        return {
          session_id: sessionId,
          exam_result_id: examResultId,
          start_time: examResult.startedAt?.toISOString() || null,
          end_time: examResult.submittedAt?.toISOString() || null,
          video_emotions: [],
          audio_emotions: [],
          heart_rate_data: [],
          aggregates: {},
          anomalies_timeline: [],
          // 标记传输中，前端可据此轮询
          transferring: true,
          message: sessionId ? 'AI正在分析数据并生成报告，请稍后重试' : '未找到AI会话',
        };
      }
      
    } catch (error) {
      console.error(`[AI分析] 获取情绪数据失败: ${examResultId}`, error);
      return {
        session_id: null,
        exam_result_id: examResultId,
        start_time: null,
        end_time: null,
        video_emotions: [],
        audio_emotions: [],
        heart_rate_data: [],
        aggregates: {},
        anomalies_timeline: [],
        message: '读取分析数据失败',
      };
    }
  }

  /**
   * 获取格式化的情绪数据（用于前端预览）
   */
  async getFormattedEmotionData(_examResultId: string) {
    throw new Error('格式化情绪数据预览功能需要真实AI会话数据，请先完成AI分析');
  }

  // ==================== 配置和工具方法 ====================

  /**
   * 获取服务配置信息
   */
  getServiceConfig() {
    return {
      baseUrl: AI_SERVICE_BASE_URL,
      httpUrl: `${AI_SERVICE_BASE_URL}/api/health`,
      websocketUrl: buildWebSocketUrl(AI_SERVICE_BASE_URL),
    };
  }

  /**
   * 构建WebSocket URL
   */
  buildWebSocketUrl(baseUrl?: string): string {
    return buildWebSocketUrl(baseUrl || AI_SERVICE_BASE_URL);
  }
}
