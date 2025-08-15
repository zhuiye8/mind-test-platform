// 时间线记录器 - 精确记录用户行为和时间戳

export interface TimelineEvent {
  id: string;
  eventType: 
    | 'exam_start'           // 考试开始
    | 'exam_end'             // 考试结束
    | 'question_show'        // 题目显示
    | 'question_answer_start'// 开始作答
    | 'question_answer_change'// 答案改变
    | 'question_submit'      // 题目提交
    | 'voice_tts_start'      // 语音播报开始
    | 'voice_tts_end'        // 语音播报结束
    | 'voice_stt_start'      // 语音识别开始
    | 'voice_stt_end'        // 语音识别结束
    | 'voice_stt_result'     // 语音识别结果
    | 'emotion_analysis_start'// 情绪分析开始
    | 'emotion_analysis_data' // 情绪分析数据
    | 'emotion_analysis_end'  // 情绪分析结束
    | 'navigation'           // 页面导航
    | 'error'                // 错误事件
    | 'custom';              // 自定义事件
  
  timestamp: number;         // 毫秒时间戳
  questionId?: string;       // 关联的题目ID
  questionIndex?: number;    // 题目索引
  metadata?: Record<string, any>; // 附加数据
  duration?: number;         // 事件持续时间（毫秒）
  sessionId: string;         // 会话ID
}

export interface TimelineSession {
  sessionId: string;
  examId: string;
  studentId: string;
  startTime: number;
  endTime?: number;
  events: TimelineEvent[];
  totalDuration?: number;
}

class TimelineRecorder {
  private session: TimelineSession | null = null;
  private startTime: number = 0;
  private eventCounter: number = 0;

  // 开始记录会话
  startSession(examId: string, studentId: string): string {
    const sessionId = this.generateSessionId();
    const startTime = Date.now();
    
    this.session = {
      sessionId,
      examId,
      studentId,
      startTime,
      events: [],
    };
    
    this.startTime = startTime;
    this.eventCounter = 0;

    // 记录会话开始事件
    this.recordEvent('exam_start', {
      examId,
      studentId,
      sessionStartTime: startTime,
    });

    console.log(`时间线记录器启动: ${sessionId}`);
    return sessionId;
  }

  // 结束记录会话
  endSession(): TimelineSession | null {
    if (!this.session) {
      console.warn('没有活跃的记录会话');
      return null;
    }

    const endTime = Date.now();
    const totalDuration = endTime - this.session.startTime;

    // 记录会话结束事件
    this.recordEvent('exam_end', {
      sessionEndTime: endTime,
      totalDuration,
    });

    this.session.endTime = endTime;
    this.session.totalDuration = totalDuration;

    const completedSession = { ...this.session };
    this.session = null;

    console.log(`时间线记录器结束: ${completedSession.sessionId}, 总时长: ${totalDuration}ms`);
    return completedSession;
  }

  // 记录事件
  recordEvent(
    eventType: TimelineEvent['eventType'],
    metadata?: Record<string, any>,
    questionId?: string,
    questionIndex?: number,
    duration?: number
  ): string | null {
    if (!this.session) {
      console.warn('没有活跃的记录会话，无法记录事件');
      return null;
    }

    const eventId = this.generateEventId();
    const timestamp = Date.now();
    
    const event: TimelineEvent = {
      id: eventId,
      eventType,
      timestamp,
      sessionId: this.session.sessionId,
      ...(questionId && { questionId }),
      ...(questionIndex !== undefined && { questionIndex }),
      ...(metadata && { metadata }),
      ...(duration !== undefined && { duration }),
    };

    this.session.events.push(event);
    this.eventCounter++;

    // 调试日志
    if (import.meta.env.DEV) {
      console.log(`Timeline Event [${eventType}]:`, {
        id: eventId,
        timestamp: new Date(timestamp).toISOString(),
        relativeTime: `+${timestamp - this.startTime}ms`,
        questionId,
        questionIndex,
        metadata,
      });
    }

    return eventId;
  }

  // 记录题目相关事件
  recordQuestionEvent(
    eventType: 'question_show' | 'question_answer_start' | 'question_answer_change' | 'question_submit',
    questionId: string,
    questionIndex: number,
    metadata?: Record<string, any>
  ): string | null {
    return this.recordEvent(eventType, metadata, questionId, questionIndex);
  }

  // 记录语音事件
  recordVoiceEvent(
    eventType: 'voice_tts_start' | 'voice_tts_end' | 'voice_stt_start' | 'voice_stt_end' | 'voice_stt_result',
    metadata?: Record<string, any>,
    questionId?: string,
    questionIndex?: number
  ): string | null {
    return this.recordEvent(eventType, metadata, questionId, questionIndex);
  }

  // 记录情绪分析事件
  recordEmotionEvent(
    eventType: 'emotion_analysis_start' | 'emotion_analysis_data' | 'emotion_analysis_end',
    metadata?: Record<string, any>
  ): string | null {
    return this.recordEvent(eventType, metadata);
  }

  // 记录带持续时间的事件
  recordDurationEvent(
    eventType: TimelineEvent['eventType'],
    startTimestamp: number,
    metadata?: Record<string, any>,
    questionId?: string,
    questionIndex?: number
  ): string | null {
    const endTimestamp = Date.now();
    const duration = endTimestamp - startTimestamp;
    
    return this.recordEvent(eventType, {
      ...metadata,
      startTime: startTimestamp,
      endTime: endTimestamp,
    }, questionId, questionIndex, duration);
  }

  // 获取当前会话
  getCurrentSession(): TimelineSession | null {
    return this.session ? { ...this.session } : null;
  }

  // 获取会话统计信息
  getSessionStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    averageEventInterval: number;
    timePerQuestion: Record<string, number>;
  } | null {
    if (!this.session) return null;

    const events = this.session.events;
    const eventsByType: Record<string, number> = {};
    const timePerQuestion: Record<string, number> = {};

    // 统计事件类型
    events.forEach(event => {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
    });

    // 计算每个题目的时间
    const questionEvents = events.filter(e => e.questionId);
    const questionGroups: Record<string, TimelineEvent[]> = {};
    
    questionEvents.forEach(event => {
      if (!event.questionId) return;
      if (!questionGroups[event.questionId]) {
        questionGroups[event.questionId] = [];
      }
      questionGroups[event.questionId].push(event);
    });

    Object.entries(questionGroups).forEach(([questionId, qEvents]) => {
      qEvents.sort((a, b) => a.timestamp - b.timestamp);
      const startEvent = qEvents.find(e => e.eventType === 'question_show');
      const endEvent = qEvents.find(e => e.eventType === 'question_submit');
      
      if (startEvent && endEvent) {
        timePerQuestion[questionId] = endEvent.timestamp - startEvent.timestamp;
      }
    });

    // 计算平均事件间隔
    let totalInterval = 0;
    for (let i = 1; i < events.length; i++) {
      totalInterval += events[i].timestamp - events[i - 1].timestamp;
    }
    const averageEventInterval = events.length > 1 ? totalInterval / (events.length - 1) : 0;

    return {
      totalEvents: events.length,
      eventsByType,
      averageEventInterval,
      timePerQuestion,
    };
  }

  // 导出会话数据
  exportSession(): string | null {
    if (!this.session) return null;
    
    const exportData = {
      ...this.session,
      exportTime: Date.now(),
      stats: this.getSessionStats(),
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  // 从本地存储恢复会话
  restoreSession(sessionData: string): boolean {
    try {
      const data = JSON.parse(sessionData);
      if (data.sessionId && data.events && Array.isArray(data.events)) {
        this.session = data;
        this.startTime = data.startTime;
        this.eventCounter = data.events.length;
        console.log(`恢复时间线会话: ${data.sessionId}`);
        return true;
      }
    } catch (err) {
      console.error('恢复会话失败:', err);
    }
    return false;
  }

  // 生成会话ID
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  // 生成事件ID
  private generateEventId(): string {
    const timestamp = Date.now();
    const counter = this.eventCounter.toString().padStart(4, '0');
    return `event_${timestamp}_${counter}`;
  }

  // 清理会话
  clearSession(): void {
    this.session = null;
    this.startTime = 0;
    this.eventCounter = 0;
  }
}

// 创建全局实例
export const timelineRecorder = new TimelineRecorder();

// 用于React Hook的时间线记录器
export const useTimelineRecorder = () => {
  const startSession = (examId: string, studentId: string) => {
    return timelineRecorder.startSession(examId, studentId);
  };

  const endSession = () => {
    return timelineRecorder.endSession();
  };

  const recordEvent = (
    eventType: TimelineEvent['eventType'],
    metadata?: Record<string, any>,
    questionId?: string,
    questionIndex?: number
  ) => {
    return timelineRecorder.recordEvent(eventType, metadata, questionId, questionIndex);
  };

  const recordQuestionEvent = (
    eventType: 'question_show' | 'question_answer_start' | 'question_answer_change' | 'question_submit',
    questionId: string,
    questionIndex: number,
    metadata?: Record<string, any>
  ) => {
    return timelineRecorder.recordQuestionEvent(eventType, questionId, questionIndex, metadata);
  };

  const recordVoiceEvent = (
    eventType: 'voice_tts_start' | 'voice_tts_end' | 'voice_stt_start' | 'voice_stt_end' | 'voice_stt_result',
    metadata?: Record<string, any>,
    questionId?: string,
    questionIndex?: number
  ) => {
    return timelineRecorder.recordVoiceEvent(eventType, metadata, questionId, questionIndex);
  };

  const recordEmotionEvent = (
    eventType: 'emotion_analysis_start' | 'emotion_analysis_data' | 'emotion_analysis_end',
    metadata?: Record<string, any>
  ) => {
    return timelineRecorder.recordEmotionEvent(eventType, metadata);
  };

  const getCurrentSession = () => {
    return timelineRecorder.getCurrentSession();
  };

  const getSessionStats = () => {
    return timelineRecorder.getSessionStats();
  };

  const exportSession = () => {
    return timelineRecorder.exportSession();
  };

  return {
    startSession,
    endSession,
    recordEvent,
    recordQuestionEvent,
    recordVoiceEvent,
    recordEmotionEvent,
    getCurrentSession,
    getSessionStats,
    exportSession,
  };
};

export default timelineRecorder;