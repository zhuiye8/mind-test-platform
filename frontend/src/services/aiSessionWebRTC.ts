/**
 * AI Session WebRTC Service
 * 根据重构计划实现的AI会话和WebRTC管理服务
 */

import { io, Socket } from 'socket.io-client';

const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:5000';

interface AISessionConfig {
  sessionId: string;
  examId?: string;
  examResultId?: string;
  candidateId: string;
}

interface WebRTCConfig {
  iceServers: RTCIceServer[]; // Host-only: empty array
  audio?: MediaStreamConstraints['audio'];
  video?: MediaStreamConstraints['video'];
}

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'failed' | 'degraded';
  error?: string;
}

class AISessionWebRTCService {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private sessionConfig: AISessionConfig | null = null;
  private connectionState: ConnectionState = { status: 'disconnected' };
  private retryCount = 0;
  private readonly MAX_RETRIES = 3;
  
  // Event handlers
  private onConnectionStateChange?: (state: ConnectionState) => void;
  private onError?: (error: Error) => void;
  
  constructor() {
    this.bindMethods();
  }
  
  private bindMethods() {
    this.handleSocketConnect = this.handleSocketConnect.bind(this);
    this.handleSocketDisconnect = this.handleSocketDisconnect.bind(this);
    this.handleSocketError = this.handleSocketError.bind(this);
    this.handleICEConnectionStateChange = this.handleICEConnectionStateChange.bind(this);
  }
  
  /**
   * 初始化AI会话和WebRTC连接
   */
  async initialize(
    sessionConfig: AISessionConfig,
    webrtcConfig: WebRTCConfig = { iceServers: [] },
    handlers?: {
      onConnectionStateChange?: (state: ConnectionState) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<void> {
    try {
      this.sessionConfig = sessionConfig;
      this.onConnectionStateChange = handlers?.onConnectionStateChange;
      this.onError = handlers?.onError;
      
      this.updateConnectionState('connecting');
      
      // 1. 初始化WebRTC
      await this.initializeWebRTC(webrtcConfig);
      
      // 3. 建立Socket.IO连接
      await this.connectSocket();
      
      // 4. 获取本地媒体流
      await this.getLocalMedia(webrtcConfig);
      
      // 5. 建立WebRTC连接
      await this.establishWebRTCConnection();
      
      this.updateConnectionState('connected');
      
    } catch (error) {
      console.error('AI Session WebRTC initialization failed:', error);
      await this.handleConnectionError(error as Error);
    }
  }
  
  /**
   * 初始化WebRTC
   */
  private async initializeWebRTC(config: WebRTCConfig): Promise<void> {
    // Host-only configuration: empty iceServers array
    this.peerConnection = new RTCPeerConnection({
      iceServers: config.iceServers, // Should be empty for host-only
      iceCandidatePoolSize: 0,
    });
    
    // Set up event handlers
    this.peerConnection.addEventListener('iceconnectionstatechange', this.handleICEConnectionStateChange);
    
    this.peerConnection.addEventListener('icecandidate', (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('ice-candidate', {
          session_id: this.sessionConfig?.sessionId,
          candidate: event.candidate,
        });
      }
    });
  }
  
  /**
   * 连接Socket.IO服务
   */
  private async connectSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(AI_SERVICE_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: this.MAX_RETRIES,
      });
      
      this.socket.on('connect', () => {
        console.log('Socket.IO connected');
        this.handleSocketConnect();
        resolve();
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
        this.handleSocketError(error);
        reject(error);
      });
      
      this.socket.on('disconnect', this.handleSocketDisconnect);
      
      // WebRTC signaling handlers
      this.socket.on('webrtc-offer', this.handleWebRTCOffer.bind(this));
      this.socket.on('webrtc-answer', this.handleWebRTCAnswer.bind(this));
      this.socket.on('ice-candidate', this.handleRemoteICECandidate.bind(this));
    });
  }
  
  /**
   * 获取本地媒体流
   */
  private async getLocalMedia(config: WebRTCConfig): Promise<void> {
    try {
      const constraints: MediaStreamConstraints = {
        video: config.video !== false ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 },
        } : false,
        audio: config.audio !== false ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : false,
      };
      
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Add tracks to peer connection
      if (this.peerConnection && this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
      }
      
    } catch (error) {
      console.error('Failed to get local media:', error);
      // 无媒体降级：仅提交答案，不进行AI分析
      this.updateConnectionState('degraded', 'Media access failed, degraded mode active');
    }
  }
  
  /**
   * 建立WebRTC连接
   */
  private async establishWebRTCConnection(): Promise<void> {
    if (!this.peerConnection || !this.socket) {
      throw new Error('WebRTC or Socket.IO not initialized');
    }
    
    // Create and send offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    this.socket.emit('webrtc-offer', {
      session_id: this.sessionConfig?.sessionId,
      offer: offer,
    });
  }
  
  /**
   * 处理WebRTC Offer
   */
  private async handleWebRTCOffer(data: { session_id: string; offer: RTCSessionDescriptionInit }) {
    if (!this.peerConnection) return;
    
    try {
      await this.peerConnection.setRemoteDescription(data.offer);
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      if (this.socket) {
        this.socket.emit('webrtc-answer', {
          session_id: data.session_id,
          answer: answer,
        });
      }
    } catch (error) {
      console.error('Error handling WebRTC offer:', error);
    }
  }
  
  /**
   * 处理WebRTC Answer
   */
  private async handleWebRTCAnswer(data: { session_id: string; answer: RTCSessionDescriptionInit }) {
    if (!this.peerConnection) return;
    
    try {
      await this.peerConnection.setRemoteDescription(data.answer);
    } catch (error) {
      console.error('Error handling WebRTC answer:', error);
    }
  }
  
  /**
   * 处理远程ICE候选
   */
  private async handleRemoteICECandidate(data: { session_id: string; candidate: RTCIceCandidateInit }) {
    if (!this.peerConnection) return;
    
    try {
      await this.peerConnection.addIceCandidate(data.candidate);
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  }
  
  /**
   * 处理ICE连接状态变化
   */
  private handleICEConnectionStateChange() {
    if (!this.peerConnection) return;
    
    const state = this.peerConnection.iceConnectionState;
    console.log('ICE Connection State:', state);
    
    switch (state) {
      case 'connected':
      case 'completed':
        this.updateConnectionState('connected');
        this.retryCount = 0; // Reset retry count on success
        break;
      case 'disconnected':
        this.updateConnectionState('disconnected');
        break;
      case 'failed':
        this.handleICEConnectionFailed();
        break;
    }
  }
  
  /**
   * 处理ICE连接失败
   */
  private async handleICEConnectionFailed() {
    if (this.retryCount < this.MAX_RETRIES) {
      this.retryCount++;
      console.log(`ICE connection failed, retrying (${this.retryCount}/${this.MAX_RETRIES})...`);
      
      // 指数退避重试
      const delay = Math.pow(2, this.retryCount) * 1000;
      setTimeout(() => {
        this.reconnect();
      }, delay);
    } else {
      console.log('ICE connection failed after maximum retries, entering degraded mode');
      this.updateConnectionState('degraded', 'Connection failed, degraded mode active');
    }
  }
  
  /**
   * 重新连接
   */
  private async reconnect() {
    try {
      this.updateConnectionState('connecting');
      await this.establishWebRTCConnection();
    } catch (error) {
      console.error('Reconnection failed:', error);
      await this.handleConnectionError(error as Error);
    }
  }
  
  /**
   * 处理连接错误
   */
  private async handleConnectionError(error: Error) {
    this.updateConnectionState('failed', error.message);
    if (this.onError) {
      this.onError(error);
    }
  }
  
  /**
   * Socket.IO事件处理器
   */
  private handleSocketConnect() {
    console.log('Socket.IO connected successfully');
  }
  
  private handleSocketDisconnect() {
    console.log('Socket.IO disconnected');
    this.updateConnectionState('disconnected');
  }
  
  private handleSocketError(error: Error) {
    console.error('Socket.IO error:', error);
  }
  
  /**
   * 更新连接状态
   */
  private updateConnectionState(status: ConnectionState['status'], error?: string) {
    this.connectionState = { status, error };
    if (this.onConnectionStateChange) {
      this.onConnectionStateChange(this.connectionState);
    }
  }
  
  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    try {
      // AI会话结束现在由后端在提交时处理，前端只负责清理连接
      
      // 关闭WebRTC连接
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }
      
      // 停止本地媒体流
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }
      
      // 断开Socket.IO连接
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      
      this.updateConnectionState('disconnected');
      console.log('AI Session WebRTC disconnected successfully');
      
    } catch (error) {
      console.error('Error during disconnect:', error);
    }
  }
  
  
  /**
   * 获取连接状态
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }
  
  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connectionState.status === 'connected';
  }
  
  /**
   * 检查是否处于降级模式
   */
  isDegraded(): boolean {
    return this.connectionState.status === 'degraded';
  }
}

// Export singleton instance
export const aiSessionWebRTC = new AISessionWebRTCService();
export default aiSessionWebRTC;