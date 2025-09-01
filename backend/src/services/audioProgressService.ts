/**
 * 音频进度服务（最小桩实现）
 * 说明：为满足构建，提供空方法；实际的 WebSocket 推送与任务跟踪可在后续接入。
 */

export const audioProgressService = {
  sendError: (_paperId: string, _message: string, _meta?: any) => {},
  sendBatchProgress: (_paperId: string, _current: number, _total: number, _questionId?: string, _titleOrMsg?: string) => {},
  sendQuestionProgress: (
    _paperId: string,
    _questionId: string,
    _questionTitle: string,
    _status: 'start' | 'progress' | 'completed' | 'error',
    _progress?: number,
    _error?: string,
  ) => {},
  sendBatchCompleted: (_paperId: string, _result: { success: number; failed: number; errors?: string[]; totalTime: number }) => {},
  sendBatchStatusUpdate: (_paperId: string, _payload: any) => {},
  sendStageUpdate: (_paperId: string, _stage: string, _progress: number, _message?: string) => {},
};

export default audioProgressService;

