/**
 * useDataChannel Hook - WebRTC数据通道管理
 * 
 * 专为局域网WebRTC优化的数据通道Hook
 * 提供答题数据传输、AI分析结果接收和连接状态管理
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface DataChannelMessage {
  type: string;
  questionId?: string;
  answer?: any;
  timestamp: number;
  [key: string]: any;
}

export interface AIAnalysisResult {
  type: 'emotion_analysis' | 'heart_rate' | 'system_message';
  result?: any;
  rate?: number;
  message?: string;
  timestamp: number;
}

export interface DataChannelStats {
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  lastSentTime: Date | null;
  lastReceivedTime: Date | null;
  connectionTime: Date | null;
}

export interface UseDataChannelOptions {
  dataChannel?: RTCDataChannel | null;
  onMessageReceived?: (message: AIAnalysisResult) => void;
  onEmotionAnalysis?: (result: any) => void;
  onHeartRateDetected?: (rate: number) => void;
  onSystemMessage?: (message: string) => void;
  onError?: (error: Error) => void;
  onStatsUpdate?: (stats: DataChannelStats) => void;
  enableHeartbeat?: boolean;
  heartbeatInterval?: number;
}

export interface UseDataChannelReturn {
  // 状态
  isConnected: boolean;
  connectionState: RTCDataChannelState | null;
  error: string | null;
  stats: DataChannelStats;
  
  // 操作
  sendAnswerData: (data: DataChannelMessage) => Promise<boolean>;
  sendHeartbeat: () => Promise<boolean>;
  sendCustomMessage: (type: string, data: any) => Promise<boolean>;
  
  // 连接管理
  attachDataChannel: (channel: RTCDataChannel) => void;
  detachDataChannel: () => void;
  
  // 统计和监控
  resetStats: () => void;
  getConnectionInfo: () => {
    state: RTCDataChannelState | null;
    label: string | null;
    protocol: string | null;
    ordered: boolean | null;
    maxRetransmits: number | null;
    maxPacketLifeTime: number | null;
  };
}

const INITIAL_STATS: DataChannelStats = {
  bytesSent: 0,
  bytesReceived: 0,
  messagesSent: 0,
  messagesReceived: 0,
  errors: 0,
  lastSentTime: null,
  lastReceivedTime: null,
  connectionTime: null
};

export const useDataChannel = (options: UseDataChannelOptions = {}): UseDataChannelReturn => {
  const {
    dataChannel: initialDataChannel = null,
    onMessageReceived,
    onEmotionAnalysis,
    onHeartRateDetected,
    onSystemMessage,
    onError,
    onStatsUpdate,
    enableHeartbeat = true,
    heartbeatInterval = 30000 // 30秒心跳
  } = options;

  // 状态管理
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(initialDataChannel);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCDataChannelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DataChannelStats>(INITIAL_STATS);

  // 引用管理
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<DataChannelMessage[]>([]);

  // 清理错误状态
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 更新统计信息
  const updateStats = useCallback((updater: (prev: DataChannelStats) => DataChannelStats) => {
    setStats(prev => {
      const newStats = updater(prev);
      onStatsUpdate?.(newStats);
      return newStats;
    });
  }, [onStatsUpdate]);

  // 重置统计信息
  const resetStats = useCallback(() => {
    setStats(INITIAL_STATS);
  }, []);

  // 处理接收到的消息
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as AIAnalysisResult;
      
      // 更新接收统计
      updateStats(prev => ({
        ...prev,
        bytesReceived: prev.bytesReceived + event.data.length,
        messagesReceived: prev.messagesReceived + 1,
        lastReceivedTime: new Date()
      }));

      // 处理不同类型的消息
      switch (data.type) {
        case 'emotion_analysis':
          onEmotionAnalysis?.(data.result);
          break;
        case 'heart_rate':
          onHeartRateDetected?.(data.rate || 0);
          break;
        case 'system_message':
          onSystemMessage?.(data.message || '');
          break;
        default:
          console.log('未知AI消息类型:', data);
      }

      onMessageReceived?.(data);
      
    } catch (error) {
      console.error('解析接收消息失败:', error);
      updateStats(prev => ({ ...prev, errors: prev.errors + 1 }));
      onError?.(error instanceof Error ? error : new Error('消息解析失败'));
    }
  }, [updateStats, onEmotionAnalysis, onHeartRateDetected, onSystemMessage, onMessageReceived, onError]);

  // 发送消息的通用方法
  const sendMessage = useCallback(async (message: DataChannelMessage): Promise<boolean> => {
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn('数据通道未就绪，消息已加入队列');
      messageQueueRef.current.push(message);
      return false;
    }

    try {
      const messageStr = JSON.stringify(message);
      dataChannel.send(messageStr);
      
      // 更新发送统计
      updateStats(prev => ({
        ...prev,
        bytesSent: prev.bytesSent + messageStr.length,
        messagesSent: prev.messagesSent + 1,
        lastSentTime: new Date()
      }));

      return true;
    } catch (error) {
      console.error('发送消息失败:', error);
      updateStats(prev => ({ ...prev, errors: prev.errors + 1 }));
      setError(error instanceof Error ? error.message : '发送消息失败');
      onError?.(error instanceof Error ? error : new Error('发送消息失败'));
      return false;
    }
  }, [dataChannel, updateStats, onError]);

  // 发送答题数据
  const sendAnswerData = useCallback(async (data: DataChannelMessage): Promise<boolean> => {
    const message: DataChannelMessage = {
      ...data,
      timestamp: Date.now()
    };
    
    return await sendMessage(message);
  }, [sendMessage]);

  // 发送心跳
  const sendHeartbeat = useCallback(async (): Promise<boolean> => {
    const heartbeatMessage: DataChannelMessage = {
      type: 'heartbeat',
      timestamp: Date.now()
    };
    
    return await sendMessage(heartbeatMessage);
  }, [sendMessage]);

  // 发送自定义消息
  const sendCustomMessage = useCallback(async (type: string, data: any): Promise<boolean> => {
    const message: DataChannelMessage = {
      type,
      ...data,
      timestamp: Date.now()
    };
    
    return await sendMessage(message);
  }, [sendMessage]);

  // 处理队列中的消息
  const processMessageQueue = useCallback(() => {
    if (messageQueueRef.current.length > 0 && dataChannel?.readyState === 'open') {
      const queuedMessages = [...messageQueueRef.current];
      messageQueueRef.current = [];
      
      queuedMessages.forEach(async (message) => {
        await sendMessage(message);
      });
    }
  }, [dataChannel, sendMessage]);

  // 启动心跳
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }

    if (enableHeartbeat) {
      heartbeatTimerRef.current = setInterval(() => {
        sendHeartbeat();
      }, heartbeatInterval);
    }
  }, [enableHeartbeat, heartbeatInterval, sendHeartbeat]);

  // 停止心跳
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  // 设置数据通道事件监听器
  const setupDataChannelListeners = useCallback((channel: RTCDataChannel) => {
    channel.onopen = () => {
      console.log('数据通道已打开');
      setIsConnected(true);
      setConnectionState(channel.readyState);
      clearError();
      
      updateStats(prev => ({
        ...prev,
        connectionTime: new Date()
      }));

      // 处理队列中的消息
      processMessageQueue();
      
      // 启动心跳
      startHeartbeat();
    };

    channel.onmessage = handleMessage;

    channel.onerror = (event) => {
      console.error('数据通道错误:', event);
      const errorMessage = '数据通道发生错误';
      setError(errorMessage);
      updateStats(prev => ({ ...prev, errors: prev.errors + 1 }));
      onError?.(new Error(errorMessage));
    };

    channel.onclose = () => {
      console.log('数据通道已关闭');
      setIsConnected(false);
      setConnectionState(channel.readyState);
      stopHeartbeat();
    };

    // 监听状态变化
    const checkState = () => {
      setConnectionState(channel.readyState);
      setIsConnected(channel.readyState === 'open');
    };

    // 定期检查状态
    const stateCheckTimer = setInterval(checkState, 1000);
    
    // 清理函数
    const cleanup = () => {
      clearInterval(stateCheckTimer);
    };

    return cleanup;
  }, [handleMessage, updateStats, onError, clearError, processMessageQueue, startHeartbeat, stopHeartbeat]);

  // 附加数据通道
  const attachDataChannel = useCallback((channel: RTCDataChannel) => {
    console.log('附加数据通道:', channel.label);
    
    setDataChannel(channel);
    const cleanup = setupDataChannelListeners(channel);
    
    // 保存清理函数用于组件卸载
    return cleanup;
  }, [setupDataChannelListeners]);

  // 分离数据通道
  const detachDataChannel = useCallback(() => {
    console.log('分离数据通道');
    
    stopHeartbeat();
    setDataChannel(null);
    setIsConnected(false);
    setConnectionState(null);
    messageQueueRef.current = [];
  }, [stopHeartbeat]);

  // 获取连接信息
  const getConnectionInfo = useCallback(() => {
    if (!dataChannel) {
      return {
        state: null,
        label: null,
        protocol: null,
        ordered: null,
        maxRetransmits: null,
        maxPacketLifeTime: null
      };
    }

    return {
      state: dataChannel.readyState,
      label: dataChannel.label,
      protocol: dataChannel.protocol,
      ordered: dataChannel.ordered,
      maxRetransmits: dataChannel.maxRetransmits,
      maxPacketLifeTime: dataChannel.maxPacketLifeTime
    };
  }, [dataChannel]);

  // 初始化数据通道
  useEffect(() => {
    if (initialDataChannel) {
      const cleanup = attachDataChannel(initialDataChannel);
      return cleanup;
    }
  }, [initialDataChannel, attachDataChannel]);

  // 清理资源
  useEffect(() => {
    return () => {
      stopHeartbeat();
    };
  }, [stopHeartbeat]);

  return {
    // 状态
    isConnected,
    connectionState,
    error,
    stats,
    
    // 操作
    sendAnswerData,
    sendHeartbeat,
    sendCustomMessage,
    
    // 连接管理
    attachDataChannel,
    detachDataChannel,
    
    // 统计和监控
    resetStats,
    getConnectionInfo
  };
};

export default useDataChannel;