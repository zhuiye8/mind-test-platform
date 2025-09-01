/**
 * 时间线记录器 - 重构版
 * 按照新的数据结构记录用户行为事件，用于生成QuestionActionEvent
 */

// 新的时间线事件结构，匹配后端QuestionActionType
export type QuestionActionType = 'DISPLAY' | 'SELECT' | 'DESELECT' | 'CHANGE' | 'NAVIGATE' | 'FOCUS' | 'BLUR';

export interface TimelineEvent {
  type: QuestionActionType;
  question_id: string;
  timestamp: string; // ISO8601格式，毫秒精度
  payload?: {
    option_before?: string;
    option_after?: string;
    source?: 'click' | 'voice';
    from?: string;
    to?: string;
    [key: string]: any;
  };
}

// 向后兼容的旧格式
export interface LegacyTimelineEvent {
  timestamp: number;
  type: 'audio_start' | 'audio_end' | 'question_start' | 'question_end' | 'custom';
  data?: any;
}

export interface TimelineRecorder {
  // 新的API - 记录问题行为事件
  recordQuestionAction: (type: QuestionActionType, questionId: string, payload?: TimelineEvent['payload']) => void;
  
  // 便捷方法
  recordQuestionDisplay: (questionId: string) => void;
  recordOptionSelect: (questionId: string, option: string, source?: 'click' | 'voice') => void;
  recordOptionChange: (questionId: string, optionBefore: string, optionAfter: string, source?: 'click' | 'voice') => void;
  recordQuestionNavigation: (fromQuestionId: string, toQuestionId: string) => void;
  recordInputFocus: (questionId: string) => void;
  recordInputBlur: (questionId: string) => void;
  
  // 获取时间线数据
  getTimeline: () => TimelineEvent[];
  reset: () => void;
  
  // 向后兼容的方法（用于现有代码，内部转换为新格式）
  recordEvent: (event: string, data?: any) => void;
  recordQuestionEvent: (event: string, data?: any) => void;
  startSession: (...args: any[]) => void;
  endSession: () => TimelineEvent[];
  
  // 旧的API（保持兼容）
  startRecording: () => void;
  stopRecording: () => void;
  addEvent: (type: string, data?: any) => void;
  isRecording: () => boolean;
}

class NewTimelineRecorder implements TimelineRecorder {
  private events: TimelineEvent[] = [];
  private recording = false;
  private examStartTime: Date = new Date();

  // 新的API实现
  recordQuestionAction(type: QuestionActionType, questionId: string, payload?: TimelineEvent['payload']): void {
    const event: TimelineEvent = {
      type,
      question_id: questionId,
      timestamp: new Date().toISOString(),
      payload: payload || {}
    };
    
    this.events.push(event);
  }

  recordQuestionDisplay(questionId: string): void {
    this.recordQuestionAction('DISPLAY', questionId);
  }

  recordOptionSelect(questionId: string, option: string, source: 'click' | 'voice' = 'click'): void {
    this.recordQuestionAction('SELECT', questionId, {
      option_after: option,
      source
    });
  }

  recordOptionChange(questionId: string, optionBefore: string, optionAfter: string, source: 'click' | 'voice' = 'click'): void {
    this.recordQuestionAction('CHANGE', questionId, {
      option_before: optionBefore,
      option_after: optionAfter,
      source
    });
  }

  recordQuestionNavigation(fromQuestionId: string, toQuestionId: string): void {
    this.recordQuestionAction('NAVIGATE', toQuestionId, {
      from: fromQuestionId,
      to: toQuestionId
    });
  }

  recordInputFocus(questionId: string): void {
    this.recordQuestionAction('FOCUS', questionId);
  }

  recordInputBlur(questionId: string): void {
    this.recordQuestionAction('BLUR', questionId);
  }

  getTimeline(): TimelineEvent[] {
    return [...this.events];
  }

  reset(): void {
    this.events = [];
    this.recording = false;
    this.examStartTime = new Date();
  }

  // 向后兼容的方法实现
  recordEvent(event: string, data?: any): void {
    // 尝试解析旧格式并转换为新格式
    if (data && data.question_id) {
      // 如果有question_id，尝试映射到新的事件类型
      const mappedType = this.mapLegacyEventType(event);
      if (mappedType) {
        this.recordQuestionAction(mappedType, data.question_id, data);
        return;
      }
    }
    
    // 对于不能映射的事件，记录为自定义事件（不会发送到后端）
    console.log('Legacy event recorded (not sent to backend):', event, data);
  }

  recordQuestionEvent(event: string, data?: any): void {
    this.recordEvent(event, data);
  }

  startSession(): void {
    this.recording = true;
    this.examStartTime = new Date();
    this.events = [];
  }

  endSession(): TimelineEvent[] {
    this.recording = false;
    return this.getTimeline();
  }

  // 旧的API实现（保持兼容）
  startRecording(): void {
    this.startSession();
  }

  stopRecording(): void {
    this.recording = false;
  }

  addEvent(type: string, data?: any): void {
    this.recordEvent(type, data);
  }

  isRecording(): boolean {
    return this.recording;
  }

  // 辅助方法：映射旧事件类型到新类型
  private mapLegacyEventType(event: string): QuestionActionType | null {
    const eventMap: Record<string, QuestionActionType> = {
      'question_displayed': 'DISPLAY',
      'answer_selected': 'SELECT',
      'answer_changed': 'CHANGE',
      'question_changed': 'NAVIGATE',
      'input_focused': 'FOCUS',
      'input_blurred': 'BLUR',
    };
    
    return eventMap[event] || null;
  }
}

// 全局实例
const globalRecorder = new NewTimelineRecorder();

export const getTimelineRecorder = (): TimelineRecorder => {
  return globalRecorder;
};

export const useTimelineRecorder = (): TimelineRecorder => {
  return globalRecorder;
};

export default getTimelineRecorder;