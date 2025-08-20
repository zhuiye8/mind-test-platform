/**
 * 时间线记录器 - 简化版
 * 用于兼容现有代码，提供基本的时间线记录功能
 */

export interface TimelineEvent {
  timestamp: number;
  type: 'audio_start' | 'audio_end' | 'question_start' | 'question_end' | 'custom';
  data?: any;
}

export interface TimelineRecorder {
  startRecording: () => void;
  stopRecording: () => void;
  addEvent: (type: TimelineEvent['type'], data?: any) => void;
  getTimeline: () => TimelineEvent[];
  reset: () => void;
  isRecording: () => boolean;
  // 兼容现有代码的方法
  recordEvent: (event: string, ...args: any[]) => void;
  recordQuestionEvent: (event: string, ...args: any[]) => void;
  startSession: (...args: any[]) => void;
  endSession: () => TimelineEvent[];
}

class SimpleTimelineRecorder implements TimelineRecorder {
  private events: TimelineEvent[] = [];
  private recording = false;
  private startTime = 0;

  startRecording(): void {
    this.recording = true;
    this.startTime = Date.now();
    this.events = [];
    this.addEvent('question_start');
  }

  stopRecording(): void {
    if (this.recording) {
      this.addEvent('question_end');
      this.recording = false;
    }
  }

  addEvent(type: TimelineEvent['type'], data?: any): void {
    if (!this.recording && type !== 'question_start') {
      return;
    }

    const event: TimelineEvent = {
      timestamp: Date.now() - this.startTime,
      type,
      data
    };

    this.events.push(event);
  }

  getTimeline(): TimelineEvent[] {
    return [...this.events];
  }

  reset(): void {
    this.events = [];
    this.recording = false;
    this.startTime = 0;
  }

  isRecording(): boolean {
    return this.recording;
  }

  // 兼容现有代码的方法实现
  recordEvent(event: string, ...args: any[]): void {
    this.addEvent('custom', { event, args });
  }

  recordQuestionEvent(event: string, ...args: any[]): void {
    this.addEvent('custom', { questionEvent: event, args });
  }

  startSession(..._args: any[]): void {
    this.startRecording();
  }

  endSession(): TimelineEvent[] {
    this.stopRecording();
    return this.getTimeline();
  }
}

// 全局实例
const globalRecorder = new SimpleTimelineRecorder();

export const getTimelineRecorder = (): TimelineRecorder => {
  return globalRecorder;
};

export const useTimelineRecorder = (): TimelineRecorder => {
  return globalRecorder;
};

export default getTimelineRecorder;