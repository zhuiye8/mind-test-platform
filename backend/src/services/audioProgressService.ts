import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { v4 as uuidv4 } from 'uuid';

interface AudioProgressSession {
  sessionId: string;
  teacherId: string;
  paperId: string;
  ws: WebSocket;
  startTime: Date;
  status: 'active' | 'completed' | 'error';
}

interface ProgressMessage {
  type: 'progress' | 'completed' | 'error' | 'question_progress' | 'batch_status' | 'stage_update';
  sessionId: string;
  data: any;
}

export class AudioProgressService {
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, AudioProgressSession> = new Map();

  /**
   * 初始化WebSocket服务器（使用noServer选项避免路径冲突）
   */
  initialize(server: Server): void {
    if (this.wss) {
      console.log('⚠️ 音频进度WebSocket服务已经初始化');
      return;
    }

    // 使用noServer选项避免与Express路由冲突
    this.wss = new WebSocketServer({ 
      noServer: true
    });

    this.wss.on('connection', (ws, req) => {
      console.log('🎵 新的音频进度连接');
      this.handleConnection(ws, req);
    });

    // 处理HTTP升级请求
    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url!, `http://${request.headers.host}`).pathname;
      
      if (pathname === '/api/audio/progress') {
        console.log('🔄 处理WebSocket升级请求:', pathname);
        
        // 处理CORS
        const origin = request.headers.origin;
        const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000'];
        
        if (origin && allowedOrigins.includes(origin)) {
          this.wss!.handleUpgrade(request, socket, head, (ws) => {
            this.wss!.emit('connection', ws, request);
          });
        } else {
          console.warn('❌ WebSocket连接被拒绝，不允许的来源:', origin);
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
        }
      } else {
        console.log('🔄 忽略非音频进度的升级请求:', pathname);
        socket.destroy();
      }
    });

    console.log('✅ 音频进度WebSocket服务已启动 (noServer模式)');
  }

  /**
   * 处理客户端连接
   */
  private handleConnection(ws: WebSocket, req: any): void {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const teacherId = url.searchParams.get('teacherId');
    const paperId = url.searchParams.get('paperId');

    if (!teacherId || !paperId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: '缺少必要参数: teacherId 和 paperId'
      }));
      ws.close();
      return;
    }

    const sessionId = uuidv4();
    const session: AudioProgressSession = {
      sessionId,
      teacherId,
      paperId,
      ws,
      startTime: new Date(),
      status: 'active'
    };

    this.sessions.set(sessionId, session);

    ws.send(JSON.stringify({
      type: 'session_created',
      sessionId,
      teacherId,
      paperId
    }));

    ws.on('close', () => {
      console.log(`🎵 音频进度连接关闭: ${sessionId}`);
      this.sessions.delete(sessionId);
    });

    ws.on('error', (error) => {
      console.error(`❌ 音频进度WebSocket错误: ${sessionId}`, error);
      this.sessions.delete(sessionId);
    });
  }

  /**
   * 发送批量生成进度更新
   */
  sendBatchProgress(
    paperId: string,
    current: number,
    total: number,
    currentQuestion: string,
    questionTitle: string
  ): void {
    const progress = Math.round((current / total) * 100);
    
    this.broadcastToPaper(paperId, {
      type: 'progress',
      sessionId: '', // 会在广播时填入
      data: {
        current,
        total,
        progress,
        currentQuestion,
        questionTitle: questionTitle.slice(0, 30) + (questionTitle.length > 30 ? '...' : ''),
        status: 'generating'
      }
    });

    console.log(`📊 音频生成进度: ${current}/${total} (${progress}%) - ${questionTitle.slice(0, 20)}...`);
  }

  /**
   * 发送单个题目生成进度
   */
  sendQuestionProgress(
    paperId: string,
    questionId: string,
    questionTitle: string,
    status: 'start' | 'progress' | 'completed' | 'error',
    progress?: number,
    error?: string
  ): void {
    this.broadcastToPaper(paperId, {
      type: 'question_progress',
      sessionId: '',
      data: {
        questionId,
        questionTitle: questionTitle.slice(0, 30) + (questionTitle.length > 30 ? '...' : ''),
        status,
        progress: progress || 0,
        error,
        timestamp: new Date().toISOString()
      }
    });

    const statusIcon = {
      start: '🎯',
      progress: '⏳',
      completed: '✅',
      error: '❌'
    }[status];

    console.log(`${statusIcon} 题目进度 ${questionId}: ${status} - ${questionTitle.slice(0, 20)}...`);
  }

  /**
   * 发送批量生成完成消息
   */
  sendBatchCompleted(
    paperId: string,
    results: {
      success: number;
      failed: number;
      errors: string[];
      totalTime: number;
    }
  ): void {
    this.broadcastToPaper(paperId, {
      type: 'completed',
      sessionId: '',
      data: {
        ...results,
        completedAt: new Date().toISOString(),
        status: 'completed'
      }
    });

    console.log(`🎉 批量音频生成完成: 成功${results.success}个，失败${results.failed}个，耗时${Math.round(results.totalTime)}ms`);
  }

  /**
   * 发送错误消息
   */
  sendError(paperId: string, error: string, details?: any): void {
    this.broadcastToPaper(paperId, {
      type: 'error',
      sessionId: '',
      data: {
        error,
        details,
        timestamp: new Date().toISOString()
      }
    });

    console.error(`❌ 音频生成错误 ${paperId}: ${error}`, details);
  }

  /**
   * 广播消息给指定试卷的所有连接
   */
  private broadcastToPaper(paperId: string, message: ProgressMessage): void {
    let sentCount = 0;
    
    for (const [sessionId, session] of this.sessions) {
      if (session.paperId === paperId && session.ws.readyState === WebSocket.OPEN) {
        try {
          const messageWithSession = { ...message, sessionId };
          session.ws.send(JSON.stringify(messageWithSession));
          sentCount++;
        } catch (error) {
          console.error(`发送消息失败 ${sessionId}:`, error);
          // 清理无效连接
          this.sessions.delete(sessionId);
        }
      }
    }

    if (sentCount === 0 && process.env.NODE_ENV === 'development') {
      console.log(`📡 没有活跃的WebSocket连接 (paperId: ${paperId})`);
    }
  }

  /**
   * 获取活跃会话数
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 获取指定试卷的连接数
   */
  getPaperConnectionCount(paperId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.paperId === paperId) {
        count++;
      }
    }
    return count;
  }

  /**
   * 清理所有会话
   */
  cleanup(): void {
    for (const [, session] of this.sessions) {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.close();
      }
    }
    this.sessions.clear();
    console.log('🧹 音频进度WebSocket服务已清理');
  }

  /**
   * 发送批量状态更新 (增强版本)
   */
  sendBatchStatusUpdate(
    paperId: string,
    status: {
      stage: string;
      stageProgress: number;
      overallProgress: number;
      totalTasks: number;
      completedTasks: number;
      runningTasks: number;
      failedTasks: number;
      estimatedTimeRemaining?: number;
      message?: string;
    }
  ): void {
    this.broadcastToPaper(paperId, {
      type: 'batch_status',
      sessionId: '',
      data: {
        ...status,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`📊 批量状态更新 [${paperId}]: 阶段=${status.stage}, 总体进度=${status.overallProgress}%`);
  }

  /**
   * 发送阶段更新消息
   */
  sendStageUpdate(
    paperId: string,
    stage: string,
    progress: number,
    message?: string
  ): void {
    this.broadcastToPaper(paperId, {
      type: 'stage_update',
      sessionId: '',
      data: {
        stage,
        progress,
        message,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`🎯 阶段更新 [${paperId}]: ${stage} - ${progress}% - ${message || ''}`);
  }

  /**
   * 发送详细的进度信息
   */
  sendDetailedProgress(
    paperId: string,
    progressInfo: {
      type: 'task_creation' | 'task_waiting' | 'file_downloading' | 'finalizing';
      current: number;
      total: number;
      percentage: number;
      currentItem?: string;
      details?: any;
    }
  ): void {
    this.broadcastToPaper(paperId, {
      type: 'progress',
      sessionId: '',
      data: {
        ...progressInfo,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * 获取所有活跃会话的统计信息
   */
  getSessionStatistics(): {
    totalSessions: number;
    sessionsByPaper: Record<string, number>;
    oldestSession?: Date;
    newestSession?: Date;
  } {
    const stats: {
      totalSessions: number;
      sessionsByPaper: Record<string, number>;
      oldestSession?: Date;
      newestSession?: Date;
    } = {
      totalSessions: this.sessions.size,
      sessionsByPaper: {} as Record<string, number>
    };

    for (const session of this.sessions.values()) {
      // 按试卷ID统计会话数
      stats.sessionsByPaper[session.paperId] = (stats.sessionsByPaper[session.paperId] || 0) + 1;
      
      // 记录最早和最新的会话时间
      if (!stats.oldestSession || session.startTime < stats.oldestSession) {
        stats.oldestSession = session.startTime;
      }
      if (!stats.newestSession || session.startTime > stats.newestSession) {
        stats.newestSession = session.startTime;
      }
    }

    return stats;
  }

  /**
   * 检查服务是否已初始化
   */
  isInitialized(): boolean {
    return this.wss !== null;
  }
}

// 单例导出
export const audioProgressService = new AudioProgressService();