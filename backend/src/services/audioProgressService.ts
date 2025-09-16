export type AudioProgressEvent = {
  type: string;
  [key: string]: any;
};

/**
 * 音频进度服务
 * 使用事件发布/订阅模型向所有监听的客户端广播进度更新
 */
class AudioProgressService {
  private channels = new Map<string, Set<(event: AudioProgressEvent) => void>>();

  /**
   * 订阅指定试卷的进度事件
   */
  subscribe(paperId: string, listener: (event: AudioProgressEvent) => void): () => void {
    if (!this.channels.has(paperId)) {
      this.channels.set(paperId, new Set());
    }
    const listeners = this.channels.get(paperId)!;
    listeners.add(listener);

    return () => {
      const set = this.channels.get(paperId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.channels.delete(paperId);
        }
      }
    };
  }

  private emitEvent(paperId: string, event: AudioProgressEvent): void {
    const listeners = this.channels.get(paperId);
    if (listeners && listeners.size > 0) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('[AudioProgress] 推送事件失败', error);
        }
      });
    }
  }

  sendError(paperId: string, message: string, meta?: any) {
    this.emitEvent(paperId, {
      type: 'error',
      message,
      meta,
    });
  }

  sendBatchProgress(paperId: string, current: number, total: number, questionId?: string, titleOrMsg?: string) {
    this.emitEvent(paperId, {
      type: 'batch-progress',
      current,
      total,
      questionId,
      title: titleOrMsg,
    });
  }

  sendQuestionProgress(
    paperId: string,
    questionId: string,
    questionTitle: string,
    status: 'start' | 'progress' | 'completed' | 'error',
    progress?: number,
    error?: string,
  ) {
    this.emitEvent(paperId, {
      type: 'question-progress',
      questionId,
      questionTitle,
      status,
      progress,
      error,
    });
  }

  sendBatchCompleted(paperId: string, result: { success: number; failed: number; errors?: string[]; totalTime: number }) {
    this.emitEvent(paperId, {
      type: 'batch-completed',
      result: {
        successCount: result.success,
        failedCount: result.failed,
        errors: result.errors || [],
        totalTime: result.totalTime,
        message: '批量语音生成完成',
      },
    });
  }

  sendBatchStatusUpdate(paperId: string, payload: any) {
    this.emitEvent(paperId, {
      type: 'batch-status',
      payload,
    });
  }

  sendStageUpdate(paperId: string, stage: string, progress: number, message?: string, extra?: Record<string, any>) {
    this.emitEvent(paperId, {
      type: 'stage-update',
      stage,
      progress,
      message,
      ...extra,
    });
  }
}

export const audioProgressService = new AudioProgressService();
export default audioProgressService;
