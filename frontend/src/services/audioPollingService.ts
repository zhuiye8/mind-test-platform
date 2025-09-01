import { useRef, useCallback } from 'react';
import { audioApi } from './audioApi';
import { message } from 'antd';

/**
 * 音频轮询服务 - 管理音频生成进度的轮询机制
 * 替代WebSocket实现实时进度更新
 */

// 进度状态接口定义
export interface ProgressState {
  overall: {
    current: number;
    total: number;
    progress: number;
    status: string;
  };
  questions: Record<string, {
    title: string;
    status: 'pending' | 'start' | 'progress' | 'completed' | 'error';
    progress: number;
    error?: string;
  }>;
}

// 轮询配置
const POLLING_CONFIG = {
  NORMAL_INTERVAL: 2000,  // 正常轮询间隔：2秒
  ERROR_INTERVAL: 5000,   // 出错重试间隔：5秒
  MAX_RETRIES: 3,         // 最大重试次数
} as const;

/**
 * 音频轮询服务Hook
 * 提供轮询机制管理功能
 */
export const useAudioPollingService = (
  paperId: string,
  onProgressUpdate?: (progress: ProgressState) => void,
  onComplete?: () => void
) => {
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  /**
   * 重置进度状态
   * @returns 初始化的进度状态对象
   */
  const createInitialProgressState = useCallback((): ProgressState => ({
    overall: { current: 0, total: 0, progress: 0, status: 'idle' },
    questions: {}
  }), []);

  /**
   * 启动进度轮询机制
   * 使用递归轮询替代WebSocket实时更新
   */
  const startProgressPolling = useCallback(() => {
    if (pollingRef.current) return; // 防止重复启动

    console.log('📊 启动音频进度轮询机制');
    retryCountRef.current = 0;
    
    const poll = async () => {
      try {
        const response = await audioApi.getPaperAudioStatus(paperId);
        if (response.success && response.data) {
          const { summary } = response.data;
          
          // 构建进度状态对象
          const progressState: ProgressState = {
            overall: {
              current: summary.ready,
              total: summary.total,
              progress: summary.total > 0 ? Math.round((summary.ready / summary.total) * 100) : 0,
              status: summary.generating > 0 ? 'generating' : 'idle'
            },
            questions: {} // 题目级别的进度暂不处理，保持接口兼容性
          };

          // 通知进度更新
          onProgressUpdate?.(progressState);
          
          // 重置重试计数器
          retryCountRef.current = 0;

          // 判断是否继续轮询
          if (summary.generating > 0) {
            // 还有正在生成的任务，继续轮询
            pollingRef.current = setTimeout(poll, POLLING_CONFIG.NORMAL_INTERVAL);
          } else {
            // 生成完成，停止轮询并通知完成
            stopProgressPolling();
            onComplete?.();
          }
        }
      } catch (error) {
        console.error('❌ 音频进度轮询失败:', error);
        
        // 增加重试计数
        retryCountRef.current++;
        
        if (retryCountRef.current < POLLING_CONFIG.MAX_RETRIES) {
          // 未超过最大重试次数，继续轮询（使用更长间隔）
          pollingRef.current = setTimeout(poll, POLLING_CONFIG.ERROR_INTERVAL);
        } else {
          // 超过最大重试次数，停止轮询并显示错误
          console.error('❌ 音频进度轮询达到最大重试次数，停止轮询');
          message.error('获取音频生成进度失败，请手动刷新页面');
          stopProgressPolling();
        }
      }
    };

    // 立即执行一次，然后开始轮询
    poll();
  }, [paperId, onProgressUpdate, onComplete]);

  /**
   * 停止进度轮询
   * 清理定时器和相关资源
   */
  const stopProgressPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
      retryCountRef.current = 0;
      console.log('📊 停止音频进度轮询机制');
    }
  }, []);

  /**
   * 检查轮询是否正在运行
   * @returns 轮询运行状态
   */
  const isPolling = useCallback(() => {
    return pollingRef.current !== null;
  }, []);

  /**
   * 强制停止所有轮询（用于组件卸载时清理）
   */
  const cleanup = useCallback(() => {
    stopProgressPolling();
  }, [stopProgressPolling]);

  return {
    startProgressPolling,
    stopProgressPolling,
    isPolling,
    cleanup,
    createInitialProgressState
  };
};

/**
 * 轮询状态指示器组件的样式配置
 */
export const POLLING_INDICATOR_STYLES = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 6px',
    borderRadius: 4,
    backgroundColor: '#f6ffed',
    border: '1px solid #b7eb8f',
    fontSize: 12
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#52c41a'
  },
  text: {
    color: '#52c41a'
  }
} as const;