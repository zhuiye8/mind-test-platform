import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Tag,
  Alert,
  Progress,
  Switch,
  Tooltip,
  Avatar,
} from 'antd';
import {
  VideoCameraOutlined,
  DisconnectOutlined,
  LinkOutlined,
  EyeOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  AudioOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

interface EmotionAnalyzerProps {
  examId: string;
  studentId: string;
  onEmotionData?: (data: EmotionData) => void;
  onAnalysisComplete?: (analysisId: string) => void;
  onTimelineEvent?: (event: string, timestamp: number, metadata?: any) => void;
  disabled?: boolean;
  audioOnly?: boolean; // 新增：仅麦克风模式
}

interface EmotionData {
  timestamp: number;
  emotions: {
    happiness: number;
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    disgust: number;
  };
  engagement: number;
  stress: number;
}

interface WebSocketStatus {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

const EmotionAnalyzer: React.FC<EmotionAnalyzerProps> = ({
  examId,
  studentId,
  onEmotionData,
  onAnalysisComplete,
  onTimelineEvent,
  disabled = false,
  audioOnly = false,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>({
    connected: false,
    connecting: false,
    error: null,
    reconnectAttempts: 0,
  });
  const [emotionData, setEmotionData] = useState<EmotionData | null>(null);
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [framesSent, setFramesSent] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0); // 音频音量级别

  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const analysisSessionId = useRef<string>('');

  // 清理资源
  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, [videoStream, audioStream]);

  // 组件卸载时清理
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // 初始化WebSocket连接
  const initWebSocket = useCallback(async () => {
    if (wsRef.current || !analysisEnabled || disabled) return;

    setWsStatus(prev => ({ ...prev, connecting: true, error: null }));

    try {
      // 这里应该是实际的情绪分析API地址
      // 示例: wss://emotion-api.example.com/ws
      const wsUrl = `wss://localhost:3001/api/emotion/stream?examId=${examId}&studentId=${studentId}&audioOnly=${audioOnly}`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('情绪分析WebSocket连接成功');
        setWsStatus({
          connected: true,
          connecting: false,
          error: null,
          reconnectAttempts: 0,
        });
        onTimelineEvent?.('emotion_analysis_connected', Date.now());

        // 发送初始化消息
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'init',
            examId,
            studentId,
            audioOnly,
            timestamp: Date.now(),
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'emotion_data') {
            const emotionData: EmotionData = data.payload;
            setEmotionData(emotionData);
            onEmotionData?.(emotionData);
            onTimelineEvent?.('emotion_data_received', Date.now(), emotionData);
          } else if (data.type === 'analysis_complete') {
            analysisSessionId.current = data.analysisId;
            onAnalysisComplete?.(data.analysisId);
            onTimelineEvent?.('emotion_analysis_complete', Date.now(), { analysisId: data.analysisId });
          } else if (data.type === 'error') {
            console.error('情绪分析错误:', data.message);
            setWsStatus(prev => ({ ...prev, error: data.message }));
          }
        } catch (err) {
          console.error('解析WebSocket消息失败:', err);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('情绪分析WebSocket连接关闭:', event.code, event.reason);
        setWsStatus(prev => ({ 
          ...prev, 
          connected: false, 
          connecting: false,
          error: event.code !== 1000 ? `连接关闭: ${event.reason || event.code}` : null
        }));
        
        // 如果不是正常关闭且正在分析，尝试重连
        if (event.code !== 1000 && isAnalyzing && wsStatus.reconnectAttempts < 3) {
          scheduleReconnect();
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('情绪分析WebSocket错误:', error);
        setWsStatus(prev => ({ 
          ...prev, 
          connected: false, 
          connecting: false, 
          error: '连接失败，请检查网络' 
        }));
      };

    } catch (err) {
      console.error('初始化WebSocket失败:', err);
      setWsStatus(prev => ({ 
        ...prev, 
        connecting: false, 
        error: '初始化连接失败' 
      }));
    }
  }, [examId, studentId, audioOnly, analysisEnabled, disabled, isAnalyzing, wsStatus.reconnectAttempts, onEmotionData, onAnalysisComplete, onTimelineEvent]);

  // 重连机制
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) return;

    const delay = Math.pow(2, wsStatus.reconnectAttempts) * 1000; // 指数退避
    reconnectTimeoutRef.current = setTimeout(() => {
      setWsStatus(prev => ({ ...prev, reconnectAttempts: prev.reconnectAttempts + 1 }));
      reconnectTimeoutRef.current = null;
      initWebSocket();
    }, delay);
  }, [wsStatus.reconnectAttempts, initWebSocket]);

  // 获取媒体流（视频或仅音频）
  const getMediaStream = useCallback(async () => {
    try {
      const constraints = audioOnly ? {
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // 16kHz采样率适合语音分析
          channelCount: 1, // 单声道
        },
      } : {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 15 }, // 降低帧率减少带宽
        },
        audio: false, // 仅视频用于情绪分析
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (audioOnly) {
        setAudioStream(stream);
        // 初始化音频分析器
        initAudioAnalyser(stream);
      } else {
        setVideoStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      }

      return stream;
    } catch (err) {
      console.error(`获取${audioOnly ? '音频' : '视频'}流失败:`, err);
      throw err;
    }
  }, [audioOnly]);

  // 初始化音频分析器
  const initAudioAnalyser = useCallback((stream: MediaStream) => {
    try {
      // 创建音频上下文
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 创建分析器节点
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.3;
      
      // 连接音频源
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      console.log('🎤 音频分析器初始化成功');
    } catch (err) {
      console.error('初始化音频分析器失败:', err);
    }
  }, []);

  // 获取音频级别
  const getAudioLevel = useCallback((): number => {
    if (!analyserRef.current) return 0;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    // 计算平均音量
    const sum = dataArray.reduce((a, b) => a + b);
    const average = sum / bufferLength;
    
    return Math.round((average / 255) * 100);
  }, []);

  // 发送音频数据
  const sendAudioData = useCallback(() => {
    if (!wsRef.current || !analyserRef.current || wsStatus.connected === false) {
      return;
    }

    try {
      // 获取频域数据
      const bufferLength = analyserRef.current.frequencyBinCount;
      const frequencyData = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(frequencyData);
      
      // 获取时域数据
      const timeDomainData = new Uint8Array(bufferLength);
      analyserRef.current.getByteTimeDomainData(timeDomainData);
      
      // 计算音频级别
      const level = getAudioLevel();
      setAudioLevel(level);
      
      // 发送音频数据
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'audio_data',
          data: {
            frequency: Array.from(frequencyData),
            timeDomain: Array.from(timeDomainData),
            audioLevel: level,
          },
          timestamp: Date.now(),
          frameNumber: framesSent,
        }));
        
        setFramesSent(prev => prev + 1);
      }
    } catch (err) {
      console.error('发送音频数据失败:', err);
    }
  }, [wsStatus.connected, framesSent, getAudioLevel]);

  // 发送视频帧
  const sendVideoFrame = useCallback(() => {
    if (!wsRef.current || !videoRef.current || !canvasRef.current || wsStatus.connected === false) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    // 设置canvas尺寸
    canvas.width = 320; // 降低分辨率减少数据量
    canvas.height = 240;

    // 绘制视频帧
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 转换为base64图片数据
    try {
      const imageData = canvas.toDataURL('image/jpeg', 0.6); // 降低质量减少数据量
      
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'video_frame',
          data: imageData,
          timestamp: Date.now(),
          frameNumber: framesSent,
        }));
        
        setFramesSent(prev => prev + 1);
      }
    } catch (err) {
      console.error('发送视频帧失败:', err);
    }
  }, [wsStatus.connected, framesSent]);

  // 开始情绪分析
  const startAnalysis = async () => {
    if (!analysisEnabled || disabled) return;

    try {
      setIsAnalyzing(true);
      onTimelineEvent?.('emotion_analysis_start', Date.now());

      // 获取媒体流（视频或音频）
      await getMediaStream();
      
      // 初始化WebSocket连接
      await initWebSocket();

      // 根据模式设置数据发送间隔
      if (audioOnly) {
        // 音频模式：每100ms发送一次数据（10Hz）
        intervalRef.current = setInterval(sendAudioData, 100);
      } else {
        // 视频模式：每秒发送2帧用于分析
        intervalRef.current = setInterval(sendVideoFrame, 500);
      }

    } catch (err) {
      console.error('开始情绪分析失败:', err);
      setWsStatus(prev => ({ ...prev, error: '启动分析失败' }));
      setIsAnalyzing(false);
    }
  };

  // 停止情绪分析
  const stopAnalysis = () => {
    setIsAnalyzing(false);
    
    // 发送停止消息
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'stop_analysis',
        timestamp: Date.now(),
      }));
    }

    cleanup();
    onTimelineEvent?.('emotion_analysis_stop', Date.now());
  };

  // 渲染情绪数据
  const renderEmotionData = () => {
    if (!emotionData) return null;

    const emotions = Object.entries(emotionData.emotions).map(([emotion, value]) => ({
      name: emotion,
      value: Math.round(value * 100),
      color: {
        happiness: '#52c41a',
        sadness: '#1890ff',
        anger: '#ff4d4f',
        fear: '#fa8c16',
        surprise: '#722ed1',
        disgust: '#eb2f96',
      }[emotion] || '#666',
    }));

    return (
      <div style={{ marginTop: '12px' }}>
        <Text strong style={{ fontSize: '13px' }}>实时情绪分析</Text>
        <div style={{ marginTop: '8px' }}>
          {emotions.map(({ name, value, color }) => (
            <div key={name} style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: '12px', textTransform: 'capitalize' }}>{name}</Text>
                <Text style={{ fontSize: '12px' }}>{value}%</Text>
              </div>
              <Progress 
                percent={value} 
                strokeColor={color}
                showInfo={false}
                size="small"
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
          <Tag color="blue">专注度: {Math.round(emotionData.engagement * 100)}%</Tag>
          <Tag color="orange">压力值: {Math.round(emotionData.stress * 100)}%</Tag>
        </div>
      </div>
    );
  };

  if (disabled) {
    return (
      <Card size="small" style={{ opacity: 0.6 }}>
        <Text type="secondary">情绪分析功能已禁用</Text>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      style={{
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
      title={
        <Space>
          {audioOnly ? <AudioOutlined /> : <EyeOutlined />}
          <Text strong>AI{audioOnly ? '语音' : '情绪'}分析</Text>
          <Tag color={isAnalyzing ? 'processing' : wsStatus.connected ? 'success' : 'default'}>
            {isAnalyzing ? '分析中' : wsStatus.connected ? '已连接' : '未连接'}
          </Tag>
          {audioOnly && <Tag color="blue">仅麦克风</Tag>}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* 控制面板 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Text>启用分析</Text>
            <Switch
              checked={analysisEnabled}
              onChange={setAnalysisEnabled}
              size="small"
              disabled={isAnalyzing}
            />
          </div>
          
          <Space>
            <Tooltip title={wsStatus.connected ? '连接正常' : '连接断开'}>
              <Avatar 
                size="small"
                style={{ 
                  backgroundColor: wsStatus.connected ? '#52c41a' : '#ff4d4f' 
                }}
                icon={wsStatus.connected ? <LinkOutlined /> : <DisconnectOutlined />}
              />
            </Tooltip>
            
            {framesSent > 0 && (
              <Tag color="blue">已发送 {framesSent} 帧</Tag>
            )}
          </Space>
        </div>

        {/* 错误提示 */}
        {wsStatus.error && (
          <Alert
            message={wsStatus.error}
            type="error"
            closable
            onClose={() => setWsStatus(prev => ({ ...prev, error: null }))}
            action={
              <Button 
                size="small" 
                onClick={initWebSocket}
                loading={wsStatus.connecting}
              >
                重试
              </Button>
            }
          />
        )}

        {/* 媒体显示区域 */}
        {audioOnly ? (
          // 音频模式：显示音频级别
          <div style={{
            padding: '16px',
            background: '#f6f6f6',
            borderRadius: '8px',
            border: '1px solid #d9d9d9',
            textAlign: 'center'
          }}>
            <div style={{ marginBottom: '8px' }}>
              <Text type="secondary">🎤 音频输入</Text>
            </div>
            <div style={{
              width: '100%',
              height: '20px',
              background: '#e6e6e6',
              borderRadius: '10px',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div
                style={{
                  width: `${audioLevel}%`,
                  height: '100%',
                  background: audioLevel > 70 ? '#52c41a' : audioLevel > 30 ? '#faad14' : '#1890ff',
                  borderRadius: '10px',
                  transition: 'width 0.1s ease-out',
                }}
              />
            </div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
              音频级别: {audioLevel}%
            </div>
          </div>
        ) : (
          // 视频模式：隐藏视频预览
          <div style={{ display: 'none' }}>
            <video ref={videoRef} />
            <canvas ref={canvasRef} />
          </div>
        )}

        {/* 控制按钮 */}
        {analysisEnabled && (
          <Space>
            {!isAnalyzing ? (
              <Button
                type="primary"
                size="small"
                icon={audioOnly ? <AudioOutlined /> : <VideoCameraOutlined />}
                onClick={startAnalysis}
                loading={wsStatus.connecting}
              >
                开始{audioOnly ? '语音' : '情绪'}分析
              </Button>
            ) : (
              <Button
                size="small"
                danger
                icon={<WarningOutlined />}
                onClick={stopAnalysis}
              >
                停止分析
              </Button>
            )}
            
            {wsStatus.reconnectAttempts > 0 && (
              <Tag color="warning">重连 {wsStatus.reconnectAttempts}/3</Tag>
            )}
          </Space>
        )}

        {/* 情绪数据展示 */}
        {isAnalyzing && emotionData && renderEmotionData()}

        {/* 分析会话ID */}
        {analysisSessionId.current && (
          <div style={{
            background: 'rgba(82, 196, 26, 0.1)',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid rgba(82, 196, 26, 0.2)',
            marginTop: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text style={{ fontSize: '12px' }}>分析ID: {analysisSessionId.current.slice(0, 8)}...</Text>
            </div>
          </div>
        )}
      </Space>
    </Card>
  );
};

export default EmotionAnalyzer;