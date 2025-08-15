import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';

interface EmotionSession {
  sessionId: string;
  examId: string;
  studentId: string;
  startTime: Date;
  emotionId?: string;
  ws: WebSocket;
  externalWs?: WebSocket; // 连接到外部AI服务
  chunks: Buffer[];
  status: 'active' | 'processing' | 'completed' | 'failed';
}

export class EmotionStreamService {
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, EmotionSession> = new Map();
  private externalApiUrl: string;
  private server: Server | null = null;
  private initializePromise: Promise<void> | null = null;

  constructor() {
    // 外部情绪分析API地址
    this.externalApiUrl = process.env.EMOTION_API_URL || 'ws://localhost:8080/fake_aiA';
  }

  /**
   * 设置HTTP服务器引用（用于按需初始化）
   */
  setServer(server: Server): void {
    this.server = server;
  }

  /**
   * 初始化WebSocket服务器（按需初始化）
   */
  initialize(server?: Server): Promise<void> {
    if (server) {
      this.server = server;
    }

    if (!this.server) {
      throw new Error('HTTP服务器未设置，无法初始化情绪分析WebSocket服务');
    }

    // 如果已经在初始化过程中，返回现有的Promise
    if (this.initializePromise) {
      return this.initializePromise;
    }

    // 如果已经初始化，直接返回
    if (this.wss) {
      return Promise.resolve();
    }

    this.initializePromise = this.doInitialize();
    return this.initializePromise;
  }

  /**
   * 实际执行初始化
   */
  private async doInitialize(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wss = new WebSocketServer({ 
        server: this.server!,
        path: '/api/emotion/stream'
      });

      this.wss.on('connection', (ws, req) => {
        console.log('📹 新的情绪分析连接 (按需初始化)');
        this.handleConnection(ws, req);
      });

      console.log('✅ 情绪分析WebSocket服务已启动 (按需初始化)');
      resolve();
    });
  }

  /**
   * 检查服务是否已初始化
   */
  isInitialized(): boolean {
    return this.wss !== null;
  }

  /**
   * 处理客户端连接
   */
  private handleConnection(ws: WebSocket, _req: any): void {
    const sessionId = uuidv4();
    
    ws.on('message', async (data: Buffer) => {
      try {
        // 检查是否是控制消息
        if (data.length < 1024) {
          const message = data.toString();
          try {
            const json = JSON.parse(message);
            if (json.type === 'init') {
              await this.initSession(sessionId, ws, json);
            } else if (json.type === 'stop') {
              await this.stopSession(sessionId);
            }
            return;
          } catch {
            // 不是JSON，作为视频数据处理
          }
        }

        // 处理视频数据块
        const session = this.sessions.get(sessionId);
        if (session && session.status === 'active') {
          await this.processVideoChunk(session, data);
        }
      } catch (error) {
        console.error('处理消息错误:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: '处理失败' 
        }));
      }
    });

    ws.on('close', () => {
      console.log('📹 情绪分析连接关闭');
      this.stopSession(sessionId);
    });

    ws.on('error', (error) => {
      console.error('WebSocket错误:', error);
      this.stopSession(sessionId);
    });
  }

  /**
   * 初始化会话
   */
  private async initSession(
    sessionId: string, 
    ws: WebSocket, 
    data: any
  ): Promise<void> {
    const { examId, studentId } = data;
    
    if (!examId || !studentId) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: '缺少必要参数' 
      }));
      return;
    }

    // 检查是否存在同一学生的活跃会话
    const existingSession = this.findExistingSession(examId, studentId);
    if (existingSession) {
      console.log(`📹 学生 ${studentId} 在考试 ${examId} 中已有活跃会话，关闭旧会话`);
      await this.stopSession(existingSession.sessionId);
    }

    // 创建会话，包含唯一标识符
    const uniqueSessionKey = `${examId}_${studentId}_${Date.now()}`;
    const session: EmotionSession = {
      sessionId,
      examId,
      studentId,
      startTime: new Date(),
      ws,
      chunks: [],
      status: 'active'
    };

    // 连接到外部AI服务（支持并发连接）
    try {
      // 为每个会话创建独立的外部连接
      const externalWsUrl = `${this.externalApiUrl}?sessionKey=${encodeURIComponent(uniqueSessionKey)}`;
      const externalWs = new WebSocket(externalWsUrl);
      
      externalWs.on('open', () => {
        console.log(`✅ 已连接到外部情绪分析服务 (会话: ${uniqueSessionKey})`);
        
        // 发送初始化消息，包含会话标识
        externalWs.send(JSON.stringify({
          type: 'init',
          examId,
          studentId,
          sessionKey: uniqueSessionKey,
          timestamp: new Date().toISOString()
        }));
      });

      externalWs.on('message', (data) => {
        // 转发外部服务的消息给对应客户端
        const message = data.toString();
        try {
          const json = JSON.parse(message);
          if (json.emotionId) {
            session.emotionId = json.emotionId;
          }
          // 只向对应的WebSocket连接发送消息
          if (session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(message);
          }
        } catch {
          // 非JSON消息，直接转发
          if (session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(message);
          }
        }
      });

      externalWs.on('error', (error) => {
        console.error(`外部服务错误 (会话: ${uniqueSessionKey}):`, error);
        session.status = 'failed';
      });

      externalWs.on('close', () => {
        console.log(`🔌 外部情绪分析服务连接关闭 (会话: ${uniqueSessionKey})`);
      });

      session.externalWs = externalWs;
    } catch (error) {
      console.error(`连接外部服务失败 (会话: ${uniqueSessionKey}):`, error);
      // 降级处理：生成本地emotionId
      session.emotionId = `local_${examId}_${studentId}_${Date.now()}`;
    }

    this.sessions.set(sessionId, session);

    // 记录并发会话统计
    const concurrentCount = this.getConcurrentSessionCount(examId);
    console.log(`📊 考试 ${examId} 当前并发会话数: ${concurrentCount}`);

    // 通知客户端会话已创建
    ws.send(JSON.stringify({
      type: 'session_created',
      sessionId,
      examId,
      studentId,
      concurrentSessions: concurrentCount,
      status: 'active'
    }));
  }

  /**
   * 查找学生在指定考试中的现有会话
   */
  private findExistingSession(examId: string, studentId: string): EmotionSession | null {
    for (const session of this.sessions.values()) {
      if (session.examId === examId && 
          session.studentId === studentId && 
          session.status === 'active') {
        return session;
      }
    }
    return null;
  }

  /**
   * 获取指定考试的并发会话数
   */
  private getConcurrentSessionCount(examId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.examId === examId && session.status === 'active') {
        count++;
      }
    }
    return count;
  }

  /**
   * 获取指定考试的所有活跃会话
   */
  getActiveSessionsForExam(examId: string): EmotionSession[] {
    const activeSessions: EmotionSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.examId === examId && session.status === 'active') {
        activeSessions.push(session);
      }
    }
    return activeSessions;
  }

  /**
   * 处理视频数据块
   */
  private async processVideoChunk(
    session: EmotionSession, 
    chunk: Buffer
  ): Promise<void> {
    // 保存数据块（可选，用于本地备份）
    session.chunks.push(chunk);

    // 转发到外部AI服务
    if (session.externalWs?.readyState === WebSocket.OPEN) {
      session.externalWs.send(chunk);
    } else {
      // 如果外部服务不可用，缓存数据
      console.warn('外部服务不可用，缓存数据块');
    }

    // 定期清理缓存（防止内存溢出）
    if (session.chunks.length > 100) {
      session.chunks = session.chunks.slice(-50);
    }
  }

  /**
   * 停止会话
   */
  private async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'processing';

    try {
      // 通知外部服务停止分析
      if (session.externalWs?.readyState === WebSocket.OPEN) {
        session.externalWs.send(JSON.stringify({
          type: 'stop',
          timestamp: new Date().toISOString()
        }));

        // 等待外部服务返回最终的emotionId
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => resolve(), 5000); // 5秒超时
          
          session.externalWs!.once('message', (data) => {
            const message = data.toString();
            try {
              const json = JSON.parse(message);
              if (json.emotionId) {
                session.emotionId = json.emotionId;
              }
            } catch {}
            clearTimeout(timeout);
            resolve();
          });
        });

        session.externalWs.close();
      }

      // 生成最终结果
      const result = {
        type: 'session_completed',
        sessionId,
        emotionId: session.emotionId || `fallback_${uuidv4()}`,
        duration: Date.now() - session.startTime.getTime(),
        chunksReceived: session.chunks.length
      };

      // 发送给客户端
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify(result));
      }

      session.status = 'completed';
      console.log(`✅ 情绪分析会话完成: ${session.emotionId}`);

    } catch (error) {
      console.error('停止会话错误:', error);
      session.status = 'failed';
      
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          type: 'error',
          message: '会话结束失败'
        }));
      }
    } finally {
      // 清理资源
      setTimeout(() => {
        this.sessions.delete(sessionId);
      }, 10000); // 10秒后清理
    }
  }

  /**
   * 获取会话状态
   */
  getSessionStatus(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      sessionId,
      examId: session.examId,
      studentId: session.studentId,
      emotionId: session.emotionId,
      status: session.status,
      startTime: session.startTime,
      chunksReceived: session.chunks.length
    };
  }

  /**
   * 清理所有会话
   */
  cleanup(): void {
    for (const [_sessionId, session] of this.sessions) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.close();
      }
      if (session.externalWs?.readyState === WebSocket.OPEN) {
        session.externalWs.close();
      }
    }
    this.sessions.clear();
  }
}

// 单例导出
export const emotionStreamService = new EmotionStreamService();