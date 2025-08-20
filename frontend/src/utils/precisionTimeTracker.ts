/**
 * 精确时间跟踪器 - 简化版
 * 用于兼容现有代码，提供基本的时间跟踪功能
 */

export interface PrecisionTracker {
  startTiming: (id: string) => void;
  endTiming: (id: string) => number;
  getTiming: (id: string) => number | null;
  getAllTimings: () => Record<string, number>;
  reset: () => void;
  recordVoiceEvent: (event: string, data?: any) => void;
}

class SimplePrecisionTracker implements PrecisionTracker {
  private timings: Map<string, number> = new Map();
  private startTimes: Map<string, number> = new Map();

  startTiming(id: string): void {
    this.startTimes.set(id, Date.now());
  }

  endTiming(id: string): number {
    const startTime = this.startTimes.get(id);
    if (startTime === undefined) {
      console.warn(`[PrecisionTracker] 未找到计时ID: ${id}`);
      return 0;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    
    this.timings.set(id, duration);
    this.startTimes.delete(id);
    
    return duration;
  }

  getTiming(id: string): number | null {
    return this.timings.get(id) || null;
  }

  getAllTimings(): Record<string, number> {
    const result: Record<string, number> = {};
    this.timings.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  reset(): void {
    this.timings.clear();
    this.startTimes.clear();
  }

  recordVoiceEvent(event: string, data?: any): void {
    console.log(`[PrecisionTracker] 语音事件: ${event}`, data);
    // 简化实现，仅记录日志
  }
}

// 全局实例
const globalTracker = new SimplePrecisionTracker();

export const getPrecisionTracker = (): PrecisionTracker => {
  return globalTracker;
};

export default getPrecisionTracker;