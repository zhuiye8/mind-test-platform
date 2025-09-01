// 统一音频管理器 - 解决MediaStream冲突问题
export const AudioState = {
  IDLE: 'idle' as const,
  DEVICE_TESTING: 'device_testing' as const,
  RECOGNITION_READY: 'recognition_ready' as const,
  RECOGNIZING: 'recognizing' as const,
  ERROR: 'error' as const
} as const;

export type AudioState = typeof AudioState[keyof typeof AudioState];

export interface AudioConfig {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
}

export class AudioManager {
  private static instance: AudioManager | null = null;
  private currentState: AudioState = AudioState.IDLE;
  private sharedStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyzer: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrame: number | null = null;
  private stateChangeListeners: ((state: AudioState) => void)[] = [];

  private constructor() {}

  // 单例模式
  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  // 状态管理
  getCurrentState(): AudioState {
    return this.currentState;
  }

  private setState(newState: AudioState) {
    const oldState = this.currentState;
    this.currentState = newState;
    console.log(`AudioManager: ${oldState} -> ${newState}`);
    
    // 通知状态变更监听器
    this.stateChangeListeners.forEach(listener => listener(newState));
  }

  onStateChange(listener: (state: AudioState) => void) {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(l => l !== listener);
    };
  }

  // 获取共享音频流（用于设备检测）
  async getSharedAudioStream(config: AudioConfig = {}): Promise<MediaStream> {
    try {
      if (this.sharedStream && this.isStreamActive(this.sharedStream)) {
        return this.sharedStream;
      }

      // 释放之前的流
      this.releaseSharedStream();

      this.setState(AudioState.DEVICE_TESTING);
      
      const constraints = {
        audio: {
          echoCancellation: config.echoCancellation ?? true,
          noiseSuppression: config.noiseSuppression ?? true,
          autoGainControl: config.autoGainControl ?? true,
          ...(config.sampleRate && { sampleRate: config.sampleRate })
        }
      };

      this.sharedStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log('AudioManager: 创建共享音频流成功');
      return this.sharedStream;
    } catch (error) {
      this.setState(AudioState.ERROR);
      console.error('AudioManager: 获取音频流失败', error);
      throw error;
    }
  }

  // 初始化音频分析器（用于音量检测）
  async initializeAnalyzer(stream?: MediaStream): Promise<AnalyserNode> {
    try {
      const audioStream = stream || this.sharedStream;
      if (!audioStream) {
        throw new Error('没有可用的音频流');
      }

      // 清理之前的分析器
      this.cleanupAnalyzer();

      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 检查AudioContext状态
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.source = this.audioContext.createMediaStreamSource(audioStream);
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 256;
      this.analyzer.smoothingTimeConstant = 0.8;
      
      this.source.connect(this.analyzer);
      
      console.log('AudioManager: 音频分析器初始化成功');
      return this.analyzer;
    } catch (error) {
      this.setState(AudioState.ERROR);
      console.error('AudioManager: 音频分析器初始化失败', error);
      throw error;
    }
  }

  // 获取音量级别
  getMicrophoneLevel(): number {
    if (!this.analyzer) return 0;

    try {
      const dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
      this.analyzer.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      return Math.min(100, (average / 255) * 100);
    } catch (error) {
      console.warn('AudioManager: 获取音量级别失败', error);
      return 0;
    }
  }

  // 开始音量监控（带回调）
  startVolumeMonitoring(callback: (level: number) => void): void {
    if (!this.analyzer) {
      console.warn('AudioManager: 音频分析器未初始化');
      return;
    }

    const updateLevel = () => {
      if (!this.analyzer) return;
      
      const level = this.getMicrophoneLevel();
      callback(level);
      
      this.animationFrame = requestAnimationFrame(updateLevel);
    };

    updateLevel();
  }

  // 停止音量监控
  stopVolumeMonitoring(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  // 为语音识别准备（释放设备测试流）
  async prepareForRecognition(): Promise<void> {
    console.log('AudioManager: 准备语音识别，释放设备测试流');
    
    // 停止音量监控
    this.stopVolumeMonitoring();
    
    // 清理设备测试相关资源
    this.cleanupAnalyzer();
    this.releaseSharedStream();
    
    // 设置状态
    this.setState(AudioState.RECOGNITION_READY);
    
    // 关键：添加延迟确保资源完全释放
    await this.delay(500);
  }

  // 语音识别开始
  onRecognitionStart(): void {
    this.setState(AudioState.RECOGNIZING);
  }

  // 语音识别结束
  onRecognitionEnd(): void {
    this.setState(AudioState.IDLE);
  }

  // 语音识别错误
  onRecognitionError(error: string): void {
    console.error('AudioManager: 语音识别错误', error);
    this.setState(AudioState.ERROR);
  }

  // 检查流是否活跃
  private isStreamActive(stream: MediaStream): boolean {
    const audioTracks = stream.getAudioTracks();
    return audioTracks.length > 0 && audioTracks.every(track => 
      track.readyState === 'live' && track.enabled
    );
  }

  // 释放共享流
  private releaseSharedStream(): void {
    if (this.sharedStream) {
      this.sharedStream.getTracks().forEach(track => {
        track.stop();
        console.log('AudioManager: 停止音频轨道', track.label);
      });
      this.sharedStream = null;
    }
  }

  // 清理分析器
  private cleanupAnalyzer(): void {
    this.stopVolumeMonitoring();
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close().catch(console.warn);
      this.audioContext = null;
    }
    
    this.analyzer = null;
  }

  // 延迟工具函数
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 完全清理所有资源
  cleanup(): void {
    console.log('AudioManager: 清理所有资源');
    
    this.cleanupAnalyzer();
    this.releaseSharedStream();
    this.setState(AudioState.IDLE);
  }

  // 检查浏览器支持
  static isSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext))
    );
  }

  // 获取音频设备信息
  static async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
      console.error('AudioManager: 获取音频设备失败', error);
      return [];
    }
  }
}

// 导出单例实例
export const audioManager = AudioManager.getInstance();