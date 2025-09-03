/**

 * AI分析服务主类 - 重构版本
 * 对接外部AI服务 (默认 http://localhost:5000)
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
   * 获取原始情绪数据并同步真实时间戳（用于前端JSON预览）
   */
  async getRawEmotionDataWithTimestamp(_examResultId: string, _metadata: { examTitle: string; participantName: string }) {
    throw new Error('原始情绪数据功能需要真实AI会话数据，请先完成AI分析');
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