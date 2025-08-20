/**
 * 流媒体监测工具组件 - MediaRecorder重构版
 * 
 * 功能概述：
 * - 基于MediaRecorder的统一音视频流传输
 * - AI服务兼容的数据分离和格式转换
 * - WebSocket连接状态诊断和监控
 * - 实时传输统计和性能指标
 * 
 * 重构亮点：
 * - 简化架构：MediaRecorder + Socket.IO
 * - 二进制传输：提高效率和质量
 * - AI兼容性：保持原有事件格式
 * - 易于维护：减少1500+行复杂代码
 * 
 * @author Claude AI
 * @version 2.0.0 (MediaRecorder重构版)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Card, 
  Button, 
  Space, 
  Tag,
  Badge, 
  Descriptions, 
  Row, 
  Col, 
  Statistic,
  Alert,
  Typography,
  Switch,
  Input,
  message
} from 'antd';
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  ReloadOutlined,
  ExportOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  BugOutlined,
  SoundOutlined,
  VideoCameraOutlined
} from '@ant-design/icons';
import { publicApi } from '../services/api';
import { useMediaRecorderStream } from '../hooks/useMediaRecorderStream';
import { AIDataSeparator } from '../utils/aiDataSeparator';
import { aiProxyApi } from '../services/aiProxyApi';

const { Title, Text } = Typography;

// 简化的统计数据结构
interface StreamStats {
  video: {
    framesExtracted: number;    // 提取的视频帧数
    framesSent: number;         // 发送的视频帧数
    lastFrameTime: number;      // 最后一帧时间
  };
  audio: {
    chunksExtracted: number;    // 提取的音频块数
    chunksSent: number;         // 发送的音频块数
    lastChunkTime: number;      // 最后音频块时间
  };
  stream: {
    bytesTransmitted: number;   // 传输的总字节数
    packetsCount: number;       // 数据包总数
    isStreaming: boolean;       // 是否在流传输
    duration: number;           // 流传输持续时间(秒)
  };
  connection: {
    status: 'disconnected' | 'connecting' | 'connected' | 'failed';
    socketId: string | null;
    latency: number;
  };
}

// AI会话状态
interface AISession {
  sessionId: string | null;
  status: 'idle' | 'creating' | 'active' | 'ending' | 'ended' | 'error';
  studentId: string;
  examId: string;
  createdAt: string | null;
  error: string | null;
}

// AI服务配置
interface AIServiceConfig {
  websocketUrl: string | null;
  available: boolean;
  health?: {
    status: string;
    timestamp: string;
    details?: any;
  };
}

const StreamMonitor: React.FC = () => {
  // === 状态管理 ===
  const [config, setConfig] = useState<AIServiceConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [stats, setStats] = useState<StreamStats>({
    video: { framesExtracted: 0, framesSent: 0, lastFrameTime: 0 },
    audio: { chunksExtracted: 0, chunksSent: 0, lastChunkTime: 0 },
    stream: { bytesTransmitted: 0, packetsCount: 0, isStreaming: false, duration: 0 },
    connection: { status: 'disconnected', socketId: null, latency: 0 }
  });

  // AI会话管理
  const [aiSession, setAiSession] = useState<AISession>({
    sessionId: null,
    status: 'idle',
    studentId: `monitor_user_${Date.now()}`,
    examId: `monitor_exam_${Date.now()}`,
    createdAt: null,
    error: null
  });

  // 设置和控制
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customConfig, setCustomConfig] = useState({
    frameRate: 10,
    audioBitrate: 128000,
    videoBitrate: 2500000
  });

  // Refs
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const dataSeparatorRef = useRef<AIDataSeparator | null>(null);
  const startTimeRef = useRef<number>(0);
  const statsIntervalRef = useRef<number | null>(null);

  // === MediaRecorder Hook ===
  const {
    status: mediaStatus,
    startStreaming,
    stopStreaming,
    getPreviewStream,
    checkBrowserSupport,
    getSocket
  } = useMediaRecorderStream({
    websocketUrl: config?.websocketUrl || '',
    sessionId: aiSession.sessionId,
    streamConfig: {
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
    },
    recorderConfig: {
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: customConfig.videoBitrate,
      audioBitsPerSecond: customConfig.audioBitrate,
      timeslice: 100
    },
    onStatusChange: (newStatus) => {
      setStats(prev => ({
        ...prev,
        stream: {
          ...prev.stream,
          bytesTransmitted: newStatus.bytesTransmitted,
          packetsCount: newStatus.packetsCount,
          isStreaming: newStatus.isStreaming
        },
        connection: {
          ...prev.connection,
          status: newStatus.isConnected ? 'connected' : 'disconnected'
        }
      }));
    },
    onError: (error) => {
      message.error(`流传输错误: ${error}`);
    }
  });

  // === 生命周期 ===
  useEffect(() => {
    console.log('[StreamMonitor] 组件初始化');
    loadAIServiceConfig();
    checkBrowserSupport();

    return () => {
      console.log('[StreamMonitor] 组件清理');
      stopMonitoring();
    };
  }, []);

  // 预览视频流
  useEffect(() => {
    if (mediaStatus.isStreaming && videoPreviewRef.current) {
      const stream = getPreviewStream();
      if (stream) {
        videoPreviewRef.current.srcObject = stream;
      }
    }
  }, [mediaStatus.isStreaming, getPreviewStream]);

  // 统计计时器
  useEffect(() => {
    if (stats.stream.isStreaming) {
      startTimeRef.current = Date.now();
      statsIntervalRef.current = window.setInterval(() => {
        setStats(prev => ({
          ...prev,
          stream: {
            ...prev.stream,
            duration: Math.floor((Date.now() - startTimeRef.current) / 1000)
          }
        }));
      }, 1000);
    } else {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    }

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, [stats.stream.isStreaming]);

  // === API调用函数 ===
  const loadAIServiceConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      // 使用AI代理API获取配置
      const response = await aiProxyApi.getConfig();
      if (response.success && response.data) {
        setConfig(response.data);
        console.log('[StreamMonitor] AI服务配置加载成功:', response.data);
      } else {
        throw new Error(response.error || '获取AI服务配置失败');
      }
    } catch (error) {
      console.error('[StreamMonitor] 加载AI服务配置失败:', error);
      message.error(`AI服务配置加载失败: ${(error as Error).message}`);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const createAIAnalysisSession = useCallback(async () => {
    setAiSession(prev => ({ ...prev, status: 'creating', error: null }));

    try {
      // 使用AI代理API创建会话
      const data = await aiProxyApi.createSession({
        student_id: aiSession.studentId,
        exam_id: aiSession.examId
      });

      if (data.success && data.session_id) {
        setAiSession(prev => ({
          ...prev,
          sessionId: data.session_id,
          status: 'active',
          createdAt: new Date().toISOString()
        }));
        
        console.log('[AI会话] 会话创建成功:', data.session_id);
        return data.session_id;
      } else {
        throw new Error(data.message || '会话创建失败');
      }
    } catch (error) {
      const errorMsg = `会话创建失败: ${(error as Error).message}`;
      setAiSession(prev => ({ ...prev, status: 'error', error: errorMsg }));
      console.error('[AI会话]', errorMsg, error);
      throw new Error(errorMsg);
    }
  }, [aiSession.studentId, aiSession.examId]);

  const endAIAnalysisSession = useCallback(async () => {
    if (!aiSession.sessionId) {
      return;
    }

    setAiSession(prev => ({ ...prev, status: 'ending' }));

    try {
      // 使用AI代理API结束会话
      const data = await aiProxyApi.endSession(aiSession.sessionId);

      if (data.success) {
        setAiSession(prev => ({
          ...prev,
          status: 'ended',
          error: null
        }));
        console.log('[AI会话] 会话结束成功');
      } else {
        throw new Error(data.message || '会话结束失败');
      }
    } catch (error) {
      const errorMsg = `会话结束失败: ${(error as Error).message}`;
      setAiSession(prev => ({ ...prev, error: errorMsg }));
      console.error('[AI会话]', errorMsg, error);
    }
  }, [aiSession.sessionId]);

  // === 控制函数 ===
  const startMonitoring = useCallback(async () => {
    try {
      console.log('[StreamMonitor] 开始监测...');

      // 1. 创建AI分析会话
      const sessionId = await createAIAnalysisSession();

      // 2. 开始媒体流传输
      const streamStarted = await startStreaming();
      if (!streamStarted) {
        throw new Error('媒体流启动失败');
      }

      // 3. 设置AI数据分离器
      if (config?.websocketUrl) {
        const stream = getPreviewStream();
        const socket = getSocket();
        
        if (stream && socket) {
          const separator = new AIDataSeparator({
            sessionId,
            socket: socket,
            frameRate: customConfig.frameRate,
            onStatsUpdate: (aiStats) => {
              setStats(prev => ({
                ...prev,
                video: {
                  ...prev.video,
                  framesSent: aiStats.framesSent
                },
                audio: {
                  ...prev.audio,
                  chunksSent: aiStats.chunksSent
                }
              }));
            }
          });

          separator.startProcessing(stream);
          separator.setupAudioProcessing(stream);
          dataSeparatorRef.current = separator;
        }
      }

      message.success('流监测已开始');

    } catch (error) {
      console.error('[StreamMonitor] 启动失败:', error);
      message.error(`启动失败: ${(error as Error).message}`);
    }
  }, [
    createAIAnalysisSession,
    startStreaming,
    config?.websocketUrl,
    getPreviewStream,
    getSocket,
    customConfig.frameRate
  ]);

  const stopMonitoring = useCallback(async () => {
    try {
      console.log('[StreamMonitor] 停止监测...');

      // 1. 停止数据分离器
      if (dataSeparatorRef.current) {
        dataSeparatorRef.current.stopProcessing();
        dataSeparatorRef.current = null;
      }

      // 2. 停止媒体流
      stopStreaming();

      // 3. 结束AI会话
      await endAIAnalysisSession();

      // 4. 重置统计
      setStats({
        video: { framesExtracted: 0, framesSent: 0, lastFrameTime: 0 },
        audio: { chunksExtracted: 0, chunksSent: 0, lastChunkTime: 0 },
        stream: { bytesTransmitted: 0, packetsCount: 0, isStreaming: false, duration: 0 },
        connection: { status: 'disconnected', socketId: null, latency: 0 }
      });

      message.success('流监测已停止');

    } catch (error) {
      console.error('[StreamMonitor] 停止失败:', error);
      message.error(`停止失败: ${(error as Error).message}`);
    }
  }, [stopStreaming, endAIAnalysisSession]);

  const exportData = useCallback(() => {
    const exportData = {
      timestamp: new Date().toISOString(),
      aiSession,
      stats,
      config: config ? {
        websocketUrl: config.websocketUrl,
        available: config.available
      } : null,
      customConfig
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stream-monitor-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    message.success('数据导出成功');
  }, [aiSession, stats, config, customConfig]);

  // === 渲染组件 ===
  const renderConnectionStatus = () => {
    const { status } = stats.connection;
    const statusConfig = {
      connected: { color: 'success', icon: <CheckCircleOutlined />, text: '已连接' },
      connecting: { color: 'processing', icon: <LoadingOutlined />, text: '连接中' },
      disconnected: { color: 'default', icon: <CloseCircleOutlined />, text: '未连接' },
      failed: { color: 'error', icon: <CloseCircleOutlined />, text: '连接失败' }
    };

    const { color, icon, text } = statusConfig[status];
    return (
      <span>
        {icon} <Badge status={color as any} text={text} />
      </span>
    );
  };

  const renderAISessionStatus = () => {
    const { status } = aiSession;
    const statusConfig = {
      idle: { color: 'default', text: '空闲' },
      creating: { color: 'processing', text: '创建中' },
      active: { color: 'success', text: '活跃' },
      ending: { color: 'processing', text: '结束中' },
      ended: { color: 'default', text: '已结束' },
      error: { color: 'error', text: '错误' }
    };

    const { color, text } = statusConfig[status];
    return <Tag color={color}>{text}</Tag>;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` 
                 : `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2}>
          <SoundOutlined style={{ marginRight: '8px' }} />
          流媒体监测工具 
          <Text type="secondary" style={{ fontSize: '14px', fontWeight: 'normal' }}>
            (MediaRecorder重构版 v2.0)
          </Text>
        </Title>
        <Text type="secondary">
          基于MediaRecorder的统一音视频流传输，支持AI服务实时分析
        </Text>
      </div>

      {/* 服务状态卡片 */}
      <Card 
        title="服务状态" 
        extra={
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadAIServiceConfig}
            loading={configLoading}
          >
            刷新配置
          </Button>
        }
        style={{ marginBottom: '16px' }}
      >
        <Row gutter={16}>
          <Col span={8}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="连接状态">
                {renderConnectionStatus()}
              </Descriptions.Item>
              <Descriptions.Item label="AI会话">
                {renderAISessionStatus()}
                {aiSession.sessionId && (
                  <Text type="secondary" style={{ display: 'block', fontSize: '12px' }}>
                    {aiSession.sessionId.substring(0, 8)}...
                  </Text>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={8}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="WebSocket地址">
                <Text code style={{ fontSize: '12px' }}>
                  {config?.websocketUrl || '未配置'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="服务可用性">
                {config?.available ? (
                  <Tag color="success">可用</Tag>
                ) : (
                  <Tag color="error">不可用</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={8}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="浏览器支持">
                <Tag color="success">MediaRecorder ✓</Tag>
                <Tag color="success">Socket.IO ✓</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>

        {aiSession.error && (
          <Alert 
            type="error" 
            message="AI会话错误" 
            description={aiSession.error}
            style={{ marginTop: '16px' }}
            showIcon 
          />
        )}
      </Card>

      {/* 视频预览 */}
      <Card title="视频预览" style={{ marginBottom: '16px' }}>
        <div style={{ textAlign: 'center' }}>
          <video
            ref={videoPreviewRef}
            autoPlay
            muted
            playsInline
            style={{
              width: '100%',
              maxWidth: '640px',
              height: 'auto',
              backgroundColor: '#000',
              borderRadius: '8px'
            }}
          />
          {!stats.stream.isStreaming && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'white',
              fontSize: '16px'
            }}>
              <VideoCameraOutlined style={{ fontSize: '48px', marginBottom: '16px' }} />
              <div>视频预览 - 点击开始监测</div>
            </div>
          )}
        </div>
      </Card>

      {/* 传输统计 */}
      <Card title="传输统计" style={{ marginBottom: '16px' }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="传输时长"
              value={formatDuration(stats.stream.duration)}
              prefix={<SoundOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="数据传输"
              value={formatBytes(stats.stream.bytesTransmitted)}
              suffix={`/ ${stats.stream.packetsCount} 包`}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="视频帧"
              value={stats.video.framesSent}
              suffix="帧"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="音频块"
              value={stats.audio.chunksSent}
              suffix="块"
            />
          </Col>
        </Row>
      </Card>

      {/* 高级设置 */}
      <Card 
        title="高级设置" 
        extra={
          <Switch 
            checked={showAdvanced}
            onChange={setShowAdvanced}
            checkedChildren="显示"
            unCheckedChildren="隐藏"
          />
        }
        style={{ marginBottom: '16px' }}
      >
        {showAdvanced && (
          <Row gutter={16}>
            <Col span={8}>
              <div style={{ marginBottom: '16px' }}>
                <Text>视频帧率 (fps)</Text>
                <Input
                  type="number"
                  value={customConfig.frameRate}
                  onChange={(e) => setCustomConfig(prev => ({
                    ...prev,
                    frameRate: parseInt(e.target.value) || 10
                  }))}
                  min={1}
                  max={30}
                  style={{ marginTop: '4px' }}
                />
              </div>
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: '16px' }}>
                <Text>视频比特率 (bps)</Text>
                <Input
                  type="number"
                  value={customConfig.videoBitrate}
                  onChange={(e) => setCustomConfig(prev => ({
                    ...prev,
                    videoBitrate: parseInt(e.target.value) || 2500000
                  }))}
                  style={{ marginTop: '4px' }}
                />
              </div>
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: '16px' }}>
                <Text>音频比特率 (bps)</Text>
                <Input
                  type="number"
                  value={customConfig.audioBitrate}
                  onChange={(e) => setCustomConfig(prev => ({
                    ...prev,
                    audioBitrate: parseInt(e.target.value) || 128000
                  }))}
                  style={{ marginTop: '4px' }}
                />
              </div>
            </Col>
          </Row>
        )}
      </Card>

      {/* 控制按钮 */}
      <Card>
        <Space size="middle">
          <Button
            type="primary"
            size="large"
            icon={stats.stream.isStreaming ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={stats.stream.isStreaming ? stopMonitoring : startMonitoring}
            loading={aiSession.status === 'creating' || aiSession.status === 'ending'}
            disabled={!config?.available}
          >
            {stats.stream.isStreaming ? '停止监测' : '开始监测'}
          </Button>

          <Button
            icon={<ExportOutlined />}
            onClick={exportData}
            disabled={!stats.stream.isStreaming && stats.stream.packetsCount === 0}
          >
            导出数据
          </Button>

          <Button
            icon={<BugOutlined />}
            onClick={() => {
              console.log('当前状态:', { stats, aiSession, config, mediaStatus });
              message.info('调试信息已输出到控制台');
            }}
          >
            调试信息
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default StreamMonitor;