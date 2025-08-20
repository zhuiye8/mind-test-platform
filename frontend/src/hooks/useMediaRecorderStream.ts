import { useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface MediaStreamConfig {
  video: {
    width: { ideal: number };
    height: { ideal: number };
    frameRate: { ideal: number };
  };
  audio: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
}

export interface RecorderConfig {
  mimeType: string;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
  timeslice: number; // 数据块分割间隔(ms)
}

export interface StreamStatus {
  isStreaming: boolean;
  isConnected: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  error: string | null;
  bytesTransmitted: number;
  packetsCount: number;
}

export interface UseMediaRecorderStreamProps {
  websocketUrl: string;
  sessionId: string | null;
  streamConfig?: Partial<MediaStreamConfig>;
  recorderConfig?: Partial<RecorderConfig>;
  onStatusChange?: (status: StreamStatus) => void;
  onError?: (error: string) => void;
}

const DEFAULT_STREAM_CONFIG: MediaStreamConfig = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
};

const DEFAULT_RECORDER_CONFIG: RecorderConfig = {
  mimeType: 'video/webm;codecs=vp8,opus',
  videoBitsPerSecond: 2500000,
  audioBitsPerSecond: 128000,
  timeslice: 100 // 100ms分块，与demo一致
};

export const useMediaRecorderStream = ({
  websocketUrl,
  sessionId,
  streamConfig = {},
  recorderConfig = {},
  onStatusChange,
  onError
}: UseMediaRecorderStreamProps) => {
  
  // 状态管理
  const [status, setStatus] = useState<StreamStatus>({
    isStreaming: false,
    isConnected: false,
    hasVideo: false,
    hasAudio: false,
    error: null,
    bytesTransmitted: 0,
    packetsCount: 0
  });

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const bytesCountRef = useRef(0);
  const packetsCountRef = useRef(0);

  // 合并配置
  const finalStreamConfig = { ...DEFAULT_STREAM_CONFIG, ...streamConfig };
  const finalRecorderConfig = { ...DEFAULT_RECORDER_CONFIG, ...recorderConfig };

  // 更新状态并通知
  const updateStatus = useCallback((updates: Partial<StreamStatus>) => {
    setStatus(prev => {
      const newStatus = { ...prev, ...updates };
      onStatusChange?.(newStatus);
      return newStatus;
    });
  }, [onStatusChange]);

  // 错误处理
  const handleError = useCallback((error: string) => {
    console.error('[MediaRecorderStream]', error);
    updateStatus({ error });
    onError?.(error);
  }, [updateStatus, onError]);

  // 初始化Socket连接
  const initializeSocket = useCallback(async () => {
    if (!websocketUrl) {
      handleError('WebSocket URL未配置');
      return false;
    }

    try {
      // 创建Socket.IO连接
      const socket = io(websocketUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });

      socketRef.current = socket;

      // 连接事件监听
      socket.on('connect', () => {
        console.log('[MediaRecorderStream] Socket.IO连接成功，ID:', socket.id);
        updateStatus({ isConnected: true, error: null });
      });

      socket.on('disconnect', (reason) => {
        console.log('[MediaRecorderStream] Socket.IO连接断开:', reason);
        updateStatus({ isConnected: false });
      });

      socket.on('connect_error', (error) => {
        handleError(`Socket.IO连接错误: ${error.message}`);
      });

      // 等待连接建立
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          handleError('Socket.IO连接超时');
          resolve(false);
        }, 10000);

        socket.on('connect', () => {
          clearTimeout(timeout);
          resolve(true);
        });

        socket.on('connect_error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });

    } catch (error) {
      handleError(`Socket初始化失败: ${(error as Error).message}`);
      return false;
    }
  }, [websocketUrl, handleError, updateStatus]);

  // 获取媒体流
  const getMediaStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: finalStreamConfig.video,
        audio: finalStreamConfig.audio
      });

      mediaStreamRef.current = stream;

      // 检查轨道
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      
      const hasVideo = videoTracks.length > 0;
      const hasAudio = audioTracks.length > 0;

      updateStatus({ hasVideo, hasAudio });

      if (!hasVideo || !hasAudio) {
        const missing = [];
        if (!hasVideo) missing.push('视频');
        if (!hasAudio) missing.push('音频');
        handleError(`缺少${missing.join('和')}轨道`);
        return null;
      }

      console.log('[MediaRecorderStream] 媒体流获取成功:', {
        videoTracks: videoTracks.length,
        audioTracks: audioTracks.length
      });

      return stream;

    } catch (error) {
      handleError(`媒体流获取失败: ${(error as Error).message}`);
      return null;
    }
  }, [finalStreamConfig, handleError, updateStatus]);

  // 创建MediaRecorder
  const createMediaRecorder = useCallback((stream: MediaStream) => {
    try {
      // 检查浏览器支持
      if (!MediaRecorder.isTypeSupported(finalRecorderConfig.mimeType)) {
        throw new Error(`不支持的编码格式: ${finalRecorderConfig.mimeType}`);
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: finalRecorderConfig.mimeType,
        videoBitsPerSecond: finalRecorderConfig.videoBitsPerSecond,
        audioBitsPerSecond: finalRecorderConfig.audioBitsPerSecond
      });

      // 数据可用事件 - 发送原始二进制数据用于传输监控
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.connected && sessionId) {
          // 发送原始MediaRecorder数据到Socket.IO（用于监控和备份）
          socketRef.current.emit('media_stream_data', {
            session_id: sessionId,
            data: event.data,
            timestamp: Date.now(),
            size: event.data.size,
            mimeType: finalRecorderConfig.mimeType
          });

          // 更新统计
          bytesCountRef.current += event.data.size;
          packetsCountRef.current += 1;
          
          updateStatus({
            bytesTransmitted: bytesCountRef.current,
            packetsCount: packetsCountRef.current
          });

          console.log(`[MediaRecorder] 发送二进制数据: ${event.data.size} 字节`);
        }
      };

      recorder.onerror = (event) => {
        handleError(`MediaRecorder错误: ${event.error?.message || '未知错误'}`);
      };

      mediaRecorderRef.current = recorder;
      
      console.log('[MediaRecorderStream] MediaRecorder创建成功:', {
        mimeType: finalRecorderConfig.mimeType,
        videoBitsPerSecond: finalRecorderConfig.videoBitsPerSecond,
        audioBitsPerSecond: finalRecorderConfig.audioBitsPerSecond
      });

      return recorder;

    } catch (error) {
      handleError(`MediaRecorder创建失败: ${(error as Error).message}`);
      return null;
    }
  }, [finalRecorderConfig, sessionId, handleError, updateStatus]);

  // 开始流传输
  const startStreaming = useCallback(async () => {
    if (status.isStreaming) {
      console.log('[MediaRecorderStream] 已在流传输中');
      return false;
    }

    if (!sessionId) {
      handleError('缺少会话ID');
      return false;
    }

    console.log('[MediaRecorderStream] 开始流传输...');

    try {
      // 1. 初始化Socket连接
      const socketConnected = await initializeSocket();
      if (!socketConnected) {
        return false;
      }

      // 2. 获取媒体流
      const stream = await getMediaStream();
      if (!stream) {
        return false;
      }

      // 3. 创建MediaRecorder
      const recorder = createMediaRecorder(stream);
      if (!recorder) {
        return false;
      }

      // 4. 开始录制
      recorder.start(finalRecorderConfig.timeslice);
      
      // 重置统计
      bytesCountRef.current = 0;
      packetsCountRef.current = 0;

      updateStatus({ 
        isStreaming: true, 
        error: null,
        bytesTransmitted: 0,
        packetsCount: 0
      });

      console.log('[MediaRecorderStream] 流传输已开始');
      return true;

    } catch (error) {
      handleError(`启动流传输失败: ${(error as Error).message}`);
      return false;
    }
  }, [
    status.isStreaming, 
    sessionId, 
    initializeSocket, 
    getMediaStream, 
    createMediaRecorder, 
    finalRecorderConfig.timeslice,
    handleError, 
    updateStatus
  ]);

  // 停止流传输
  const stopStreaming = useCallback(() => {
    console.log('[MediaRecorderStream] 停止流传输...');

    try {
      // 停止MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;

      // 停止媒体轨道
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      // 断开Socket连接
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      updateStatus({
        isStreaming: false,
        isConnected: false,
        hasVideo: false,
        hasAudio: false,
        error: null
      });

      console.log('[MediaRecorderStream] 流传输已停止');

    } catch (error) {
      handleError(`停止流传输失败: ${(error as Error).message}`);
    }
  }, [handleError, updateStatus]);

  // 获取当前媒体流（用于预览）
  const getPreviewStream = useCallback(() => {
    return mediaStreamRef.current;
  }, []);

  // 检查浏览器支持
  const checkBrowserSupport = useCallback(() => {
    const support = {
      mediaDevices: !!navigator.mediaDevices?.getUserMedia,
      mediaRecorder: !!window.MediaRecorder,
      webSocket: !!window.WebSocket,
      socketIO: true, // Socket.IO通过polyfill支持
      mimeType: MediaRecorder.isTypeSupported?.(finalRecorderConfig.mimeType) || false
    };

    const unsupported = Object.entries(support)
      .filter(([, supported]) => !supported)
      .map(([feature]) => feature);

    if (unsupported.length > 0) {
      handleError(`浏览器不支持: ${unsupported.join(', ')}`);
      return false;
    }

    return true;
  }, [finalRecorderConfig.mimeType, handleError]);

  return {
    status,
    startStreaming,
    stopStreaming,
    getPreviewStream,
    checkBrowserSupport,
    getSocket: () => socketRef.current
  };
};