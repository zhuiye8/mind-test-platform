import { useCallback, useEffect, useRef, useState } from 'react';

export type AudioProgressEvent = {
  type: string;
  [key: string]: any;
};

type EventHandler = (event: AudioProgressEvent) => void;

/**
 * 通过 Server-Sent Events 订阅后端的音频进度更新
 * 在客户端维持一个 EventSource，并提供启动/停止控制及错误回退
 */
export const useAudioProgressStream = (
  paperId: string,
  onEvent?: EventHandler,
  onError?: (error: Event) => void,
) => {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);

  const stop = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnected(false);
  }, []);

  const start = useCallback(() => {
    if (!paperId || eventSourceRef.current) {
      return false;
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const baseUrl = `/api/audio/papers/${paperId}/progress-stream`;
      const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
      const es = new EventSource(url, { withCredentials: true });
      eventSourceRef.current = es;

      const handleMessage = (event: MessageEvent) => {
        try {
          const data: AudioProgressEvent = JSON.parse(event.data);
          if (data.type === 'connected') {
            setConnected(true);
          }
          onEvent?.(data);
        } catch (parseError) {
          console.warn('解析音频进度事件失败:', parseError, event.data);
        }
      };

      es.addEventListener('audio-progress', handleMessage);

      es.onerror = (errorEvent) => {
        console.error('音频进度SSE出错:', errorEvent);
        const shouldReportError = es.readyState !== EventSource.CLOSED;
        if (shouldReportError) {
          onError?.(errorEvent);
        }
        stop();
      };

      return true;
    } catch (error) {
      console.error('初始化音频进度SSE失败:', error);
      onError?.(error as Event);
      stop();
      return false;
    }
  }, [paperId, onEvent, onError, stop]);

  useEffect(() => stop, [stop]);

  return {
    start,
    stop,
    isConnected: connected,
  };
};
