/**
 * 高精度时间追踪系统
 * 使用performance.now()实现微秒级精度
 */

export interface TimelineEvent {
  eventId: string;
  eventType: string;
  relativeTime: number;      // performance.now() - 微秒精度
  absoluteTime: number;       // Date.now() - 绝对时间参考
  questionId?: string;
  questionOrder?: number;
  metadata?: Record<string, any>;
}

export interface SessionSummary {
  sessionId: string;
  examId: string;
  studentId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  events: TimelineEvent[];
  statistics: {
    totalQuestions: number;
    averageAnswerTime: number;
    fastestAnswer: number;
    slowestAnswer: number;
  };
}

class PrecisionTimeTracker {
  private sessionId: string;
  private examId: string = '';
  private studentId: string = '';
  private sessionStart: number;
  private absoluteStart: number;
  private events: TimelineEvent[] = [];
  private batchSize = 50;
  private uploadCallback?: (events: TimelineEvent[]) => void;
  private eventCounter = 0;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || this.generateSessionId();
    this.sessionStart = performance.now();
    this.absoluteStart = Date.now();
    
    console.log(`⏱️ 时间追踪器启动 - 会话ID: ${this.sessionId}`);
  }

  /**
   * 生成唯一会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 初始化会话
   */
  startSession(examId: string, studentId: string): void {
    this.examId = examId;
    this.studentId = studentId;
    this.sessionStart = performance.now();
    this.absoluteStart = Date.now();
    this.events = [];
    
    this.recordEvent('session_start', {
      examId,
      studentId,
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  /**
   * 记录事件（核心方法）
   */
  recordEvent(
    eventType: string, 
    metadata?: any,
    questionId?: string,
    questionOrder?: number
  ): TimelineEvent {
    const event: TimelineEvent = {
      eventId: `evt_${++this.eventCounter}_${Date.now()}`,
      eventType,
      relativeTime: performance.now() - this.sessionStart,
      absoluteTime: Date.now(),
      questionId,
      questionOrder,
      metadata
    };
    
    this.events.push(event);
    
    // 批量上传
    if (this.events.length >= this.batchSize && this.uploadCallback) {
      this.flush();
    }
    
    return event;
  }

  /**
   * 记录题目显示事件
   */
  recordQuestionShow(
    questionId: string, 
    questionOrder: number,
    questionData?: any
  ): void {
    this.recordEvent('question_show', {
      ...questionData,
      timestamp: new Date().toISOString()
    }, questionId, questionOrder);
  }

  /**
   * 记录答案变更事件
   */
  recordAnswerChange(
    questionId: string,
    questionOrder: number,
    answer: any,
    isAutoSelected: boolean = false
  ): void {
    const showEvent = this.findLastEvent('question_show', questionId);
    const timeSinceShow = showEvent 
      ? performance.now() - this.sessionStart - showEvent.relativeTime
      : 0;

    this.recordEvent('answer_change', {
      answer,
      isAutoSelected,
      timeSinceShow: Math.round(timeSinceShow), // 毫秒
      changeCount: this.countAnswerChanges(questionId) + 1
    }, questionId, questionOrder);
  }

  /**
   * 记录语音交互事件
   */
  recordVoiceEvent(
    eventType: 'voice_start' | 'voice_end' | 'voice_recognized' | 'voice_error',
    data?: any,
    questionId?: string
  ): void {
    this.recordEvent(`voice_${eventType}`, data, questionId);
  }

  /**
   * 记录情绪分析事件
   */
  recordEmotionEvent(
    eventType: string,
    data?: any
  ): void {
    this.recordEvent(`emotion_${eventType}`, data);
  }

  /**
   * 计算题目答题时长（微秒精度）
   */
  calculateAnswerDuration(questionId: string): number {
    const showEvent = this.findLastEvent('question_show', questionId);
    const answerEvent = this.findLastEvent('answer_change', questionId);
    
    if (showEvent && answerEvent) {
      return answerEvent.relativeTime - showEvent.relativeTime;
    }
    return 0;
  }

  /**
   * 计算平均答题时长
   */
  calculateAverageAnswerTime(): number {
    const answerTimes: number[] = [];
    const questionIds = new Set<string>();
    
    // 收集所有题目ID
    this.events.forEach(event => {
      if (event.questionId && event.eventType === 'question_show') {
        questionIds.add(event.questionId);
      }
    });
    
    // 计算每题用时
    questionIds.forEach(questionId => {
      const duration = this.calculateAnswerDuration(questionId);
      if (duration > 0) {
        answerTimes.push(duration);
      }
    });
    
    if (answerTimes.length === 0) return 0;
    
    const sum = answerTimes.reduce((a, b) => a + b, 0);
    return sum / answerTimes.length;
  }

  /**
   * 获取会话统计
   */
  getStatistics(): SessionSummary['statistics'] {
    const answerTimes: number[] = [];
    const questionIds = new Set<string>();
    
    this.events.forEach(event => {
      if (event.questionId && event.eventType === 'question_show') {
        questionIds.add(event.questionId);
      }
    });
    
    questionIds.forEach(questionId => {
      const duration = this.calculateAnswerDuration(questionId);
      if (duration > 0) {
        answerTimes.push(duration);
      }
    });
    
    return {
      totalQuestions: questionIds.size,
      averageAnswerTime: answerTimes.length > 0 
        ? answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length 
        : 0,
      fastestAnswer: answerTimes.length > 0 
        ? Math.min(...answerTimes) 
        : 0,
      slowestAnswer: answerTimes.length > 0 
        ? Math.max(...answerTimes) 
        : 0
    };
  }

  /**
   * 结束会话
   */
  endSession(): SessionSummary {
    const endTime = performance.now();
    const duration = endTime - this.sessionStart;
    
    this.recordEvent('session_end', {
      duration: Math.round(duration),
      totalEvents: this.events.length
    });
    
    // 刷新剩余事件
    if (this.uploadCallback && this.events.length > 0) {
      this.flush();
    }
    
    const summary: SessionSummary = {
      sessionId: this.sessionId,
      examId: this.examId,
      studentId: this.studentId,
      startTime: this.absoluteStart,
      endTime: Date.now(),
      duration,
      events: [...this.events],
      statistics: this.getStatistics()
    };
    
    console.log(`⏱️ 会话结束 - 总时长: ${Math.round(duration / 1000)}秒`);
    
    return summary;
  }

  /**
   * 批量上传事件
   */
  private flush(): void {
    if (this.events.length === 0) return;
    
    const eventsToUpload = [...this.events];
    this.events = [];
    
    if (this.uploadCallback) {
      this.uploadCallback(eventsToUpload);
    }
  }

  /**
   * 设置上传回调
   */
  setUploadCallback(callback: (events: TimelineEvent[]) => void): void {
    this.uploadCallback = callback;
  }

  /**
   * 查找最后一个特定类型的事件
   */
  private findLastEvent(eventType: string, questionId?: string): TimelineEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      if (event.eventType === eventType) {
        if (!questionId || event.questionId === questionId) {
          return event;
        }
      }
    }
    return undefined;
  }

  /**
   * 统计答案变更次数
   */
  private countAnswerChanges(questionId: string): number {
    return this.events.filter(
      e => e.eventType === 'answer_change' && e.questionId === questionId
    ).length;
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): TimelineEvent[] {
    return [...this.events];
  }

  /**
   * 导出为JSON
   */
  exportToJSON(): string {
    return JSON.stringify({
      sessionId: this.sessionId,
      examId: this.examId,
      studentId: this.studentId,
      startTime: this.absoluteStart,
      currentTime: Date.now(),
      events: this.events,
      statistics: this.getStatistics()
    }, null, 2);
  }

  /**
   * 清理会话
   */
  clear(): void {
    this.events = [];
    this.eventCounter = 0;
    console.log(`⏱️ 会话已清理`);
  }
}

// 单例导出
let trackerInstance: PrecisionTimeTracker | null = null;

export function getPrecisionTracker(): PrecisionTimeTracker {
  if (!trackerInstance) {
    trackerInstance = new PrecisionTimeTracker();
  }
  return trackerInstance;
}

export function resetPrecisionTracker(): void {
  if (trackerInstance) {
    trackerInstance.clear();
  }
  trackerInstance = null;
}

export default PrecisionTimeTracker;