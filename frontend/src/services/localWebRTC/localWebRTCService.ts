/**
 * 局域网WebRTC服务 - 简化版
 * 专为本机/局域网部署优化，无需STUN/TURN服务器
 */

export interface LocalWebRTCConfig {
  aiServiceUrl: string;
  signalingUrl: string;
  video: {
    
    width: number;
    height: number;
    frameRate: number;
    bitrate: number;
  };
  audio: {
    sampleRate: number;
    channelCount: number;
    bitrate: number;
  };
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'failed';
  error?: string;
  startTime?: Date;
  stats?: {
    videoFramesSent: number;
    audioPacketsSent: number;
    bytesSent: number;
    rtt: number; // Round Trip Time
  };
}

export class LocalWebRTCService {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private config: LocalWebRTCConfig;
  
  private connectionState: ConnectionState = { status: 'disconnected' };
  private statsTimer: NodeJS.Timeout | null = null;

  constructor(config: LocalWebRTCConfig) {
    this.config = config;
  }

  /**
   * 初始化WebRTC连接
   */
  async initialize(): Promise<void> {
    try {
      this.connectionState = { status: 'connecting', startTime: new Date() };
      
      // 创建RTCPeerConnection (局域网直连，无需ICE服务器)
      this.pc = new RTCPeerConnection({
        iceServers: [] // 空数组，直接P2P连接
      });

      // 设置连接状态监听
      this.setupConnectionHandlers();
      
      // 获取本地媒体流
      await this.captureLocalMedia();
      
      // 创建数据通道
      this.createDataChannel();

    } catch (error) {
      this.connectionState = { 
        status: 'failed', 
        error: error instanceof Error ? error.message : '初始化失败' 
      };
      throw error;
    }
  }

  /**
   * 获取本地媒体流 - 局域网高质量配置
   */
  private async captureLocalMedia(): Promise<void> {
    const constraints: MediaStreamConstraints = {
      video: {
        width: { exact: this.config.video.width },
        height: { exact: this.config.video.height },
        frameRate: { exact: this.config.video.frameRate }
      },
      audio: {
        sampleRate: { exact: this.config.audio.sampleRate },
        channelCount: { exact: this.config.audio.channelCount },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // 添加轨道到peer connection
    if (this.pc) {
      this.localStream.getTracks().forEach(track => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    console.log('本地媒体流获取成功:', {
      video: this.localStream.getVideoTracks().length > 0,
      audio: this.localStream.getAudioTracks().length > 0,
      constraints
    });
  }

  /**
   * 创建数据通道用于传输答题数据
   */
  private createDataChannel(): void {
    if (!this.pc) return;

    this.dataChannel = this.pc.createDataChannel('exam-data', {
      ordered: true,
      maxPacketLifeTime: 1000, // 1秒超时
      maxRetransmits: 3
    });

    this.dataChannel.onopen = () => {
      console.log('数据通道已打开');
    };

    this.dataChannel.onmessage = (event) => {
      // 处理来自AI服务的消息(情绪分析结果等)
      try {
        const data = JSON.parse(event.data);
        this.handleAIMessage(data);
      } catch (error) {
        console.error('解析AI消息失败:', error);
      }
    };

    this.dataChannel.onerror = (error) => {
      console.error('数据通道错误:', error);
    };
  }

  /**
   * 建立与AI服务的连接
   */
  async connectToAIService(examId: string, participantInfo: any): Promise<void> {
    if (!this.pc) {
      throw new Error('WebRTC未初始化');
    }

    try {
      // 创建offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // 发送offer到AI服务
      const response = await fetch(`${this.config.aiServiceUrl}/webrtc/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sdp: offer.sdp,
          type: 'offer',
          exam_id: examId,
          participant_info: participantInfo,
          timestamp: Date.now()
        })
      });

      if (!response.ok) {
        throw new Error(`AI服务连接失败: ${response.statusText}`);
      }

      const { sdp: answerSdp } = await response.json();
      
      // 设置远程描述
      await this.pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
      );

      this.connectionState = { status: 'connected', startTime: new Date() };
      this.startStatsCollection();

    } catch (error) {
      this.connectionState = { 
        status: 'failed', 
        error: error instanceof Error ? error.message : '连接AI服务失败' 
      };
      throw error;
    }
  }

  /**
   * 发送答题数据
   */
  sendAnswerData(data: {
    type: string;
    questionId?: string;
    answer?: any;
    timestamp: number;
    [key: string]: any;
  }): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('数据通道未就绪，无法发送数据');
      return false;
    }

    try {
      this.dataChannel.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('发送答题数据失败:', error);
      return false;
    }
  }

  /**
   * 处理来自AI服务的消息
   */
  private handleAIMessage(data: any): void {
    switch (data.type) {
      case 'emotion_analysis':
        this.onEmotionAnalysis?.(data.result);
        break;
      case 'heart_rate':
        this.onHeartRateDetected?.(data.rate);
        break;
      case 'system_message':
        console.log('AI系统消息:', data.message);
        break;
      default:
        console.log('未知AI消息类型:', data);
    }
  }

  /**
   * 设置连接状态处理器
   */
  private setupConnectionHandlers(): void {
    if (!this.pc) return;

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE连接状态变化:', this.pc!.iceConnectionState);
    };

    this.pc.onconnectionstatechange = () => {
      console.log('连接状态变化:', this.pc!.connectionState);
      
      if (this.pc!.connectionState === 'failed') {
        this.connectionState = { status: 'failed', error: '连接失败' };
        this.onConnectionFailed?.();
      }
    };

    this.pc.onicegatheringstatechange = () => {
      console.log('ICE收集状态变化:', this.pc!.iceGatheringState);
    };
  }

  /**
   * 开始收集连接统计数据
   */
  private startStatsCollection(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
    }

    this.statsTimer = setInterval(async () => {
      if (!this.pc) return;

      try {
        const stats = await this.pc.getStats();
        const statsData = this.parseRTCStats(stats);
        
        if (statsData) {
          this.connectionState.stats = statsData;
          this.onStatsUpdate?.(statsData);
        }
        
      } catch (error) {
        console.error('获取连接统计失败:', error);
      }
    }, 5000); // 每5秒更新一次
  }

  /**
   * 解析RTC统计数据
   */
  private parseRTCStats(stats: RTCStatsReport): ConnectionState['stats'] {
    let videoFramesSent = 0;
    let audioPacketsSent = 0;
    let bytesSent = 0;
    let rtt = 0;

    stats.forEach((report) => {
      switch (report.type) {
        case 'outbound-rtp':
          if (report.kind === 'video') {
            videoFramesSent += report.framesSent || 0;
          } else if (report.kind === 'audio') {
            audioPacketsSent += report.packetsSent || 0;
          }
          bytesSent += report.bytesSent || 0;
          break;
        case 'candidate-pair':
          if (report.state === 'succeeded') {
            rtt = report.currentRoundTripTime * 1000 || 0; // 转换为毫秒
          }
          break;
      }
    });

    return { videoFramesSent, audioPacketsSent, bytesSent, rtt };
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    // 清除统计定时器
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }

    // 关闭数据通道
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    // 停止本地媒体流
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // 关闭peer connection
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.connectionState = { status: 'disconnected' };
    console.log('WebRTC连接已断开');
  }

  // 获取器
  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  isConnected(): boolean {
    return this.connectionState.status === 'connected';
  }

  // 事件回调
  onEmotionAnalysis?: (result: any) => void;
  onHeartRateDetected?: (rate: number) => void;
  onConnectionFailed?: () => void;
  onStatsUpdate?: (stats: NonNullable<ConnectionState['stats']>) => void;
}

// 默认配置
export const DEFAULT_CONFIG: LocalWebRTCConfig = {
  aiServiceUrl: 'http://localhost:5000',
  signalingUrl: 'ws://localhost:5000/socket.io',
  video: {
    width: 1280,
    height: 720,
    frameRate: 30, // 局域网可以30fps
    bitrate: 4000000 // 4Mbps
  },
  audio: {
    sampleRate: 48000,
    channelCount: 2, // 立体声
    bitrate: 128000 // 128kbps
  }
};