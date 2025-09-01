import { audioManager } from '../utils/audioManager';
import { voiceMatchService } from '../services/voiceMatchService';
import { getPrecisionTracker } from '../utils/precisionTimeTracker';

/**
 * STT语音识别服务 - 处理语音转文本的业务逻辑
 * 提供语音识别、语音匹配、音量监控等功能
 */

// 声明全局接口扩展
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export interface STTCallbacks {
  onRecognitionStart?: () => void;
  onRecognitionEnd?: () => void;
  onRecognitionResult?: (text: string, isFinal: boolean) => void;
  onRecognitionError?: (error: string) => void;
  onVoiceMatch?: (result: any) => void;
  onVolumeChange?: (level: number) => void;
  onStateChange?: (state: STTState) => void;
  onTimelineEvent?: (event: string, timestamp: number, metadata?: any) => void;
}

export enum STTState {
  IDLE = 'idle',
  LISTENING = 'listening', 
  PROCESSING = 'processing'
}

export interface VoiceMatchResult {
  matched: boolean;
  option: string | null;
  confidence: number;
  reasons: string[];
}

/**
 * STT语音识别管理器
 * 提供完整的语音识别和匹配服务
 */
export class STTService {
  private recognition: any = null;
  private isActive = false;
  private state: STTState = STTState.IDLE;
  private callbacks: STTCallbacks;
  private currentQuestionText = '';
  private currentQuestionOptions: Record<string, any> = {};
  private isMatching = false;
  private volumeMonitoringActive = false;

  constructor(callbacks: STTCallbacks = {}) {
    this.callbacks = callbacks;
    this.initializeRecognition();
  }

  /**
   * 初始化语音识别器
   */
  private initializeRecognition(): void {
    if (!this.checkSTTSupport()) {
      console.error('STT: 浏览器不支持语音识别');
      this.callbacks.onRecognitionError?.('浏览器不支持语音识别功能');
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      
      this.setupRecognitionConfig();
      this.setupRecognitionEvents();
      
      console.log('STT: 语音识别器初始化成功');
    } catch (error) {
      console.error('STT: 语音识别器初始化失败:', error);
      this.callbacks.onRecognitionError?.('语音识别初始化失败');
    }
  }

  /**
   * 配置语音识别参数
   */
  private setupRecognitionConfig(): void {
    if (!this.recognition) return;

    this.recognition.continuous = true;           // 持续识别
    this.recognition.interimResults = true;       // 返回临时结果
    this.recognition.lang = 'zh-CN';             // 中文识别
    this.recognition.maxAlternatives = 1;         // 最大候选数
  }

  /**
   * 设置识别事件监听
   */
  private setupRecognitionEvents(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      console.log('STT: 语音识别开始');
      this.isActive = true;
      this.setState(STTState.LISTENING);
      this.callbacks.onRecognitionStart?.();
      this.callbacks.onTimelineEvent?.('voice_recognition_start', Date.now());
      audioManager.onRecognitionStart();
    };

    this.recognition.onresult = (event: any) => {
      const results = event.results;
      const lastResult = results[results.length - 1];
      const transcript = lastResult.transcript.trim();
      const isFinal = lastResult.isFinal;

      console.log(`STT: 识别${isFinal ? '完成' : '中'}:`, transcript);
      
      this.callbacks.onRecognitionResult?.(transcript, isFinal);
      this.callbacks.onTimelineEvent?.('voice_recognition_result', Date.now(), { 
        text: transcript, 
        isFinal 
      });

      if (isFinal && transcript) {
        this.setState(STTState.PROCESSING);
        this.handleFinalResult(transcript);
      }
    };

    this.recognition.onerror = (event: any) => {
      const errorMessage = this.getErrorMessage(event.error);
      console.error('STT: 语音识别错误:', event.error, errorMessage);
      
      this.callbacks.onRecognitionError?.(errorMessage);
      this.setState(STTState.IDLE);
      this.isActive = false;
      audioManager.onRecognitionError(event.error);
      this.callbacks.onTimelineEvent?.('voice_recognition_error', Date.now(), { 
        error: event.error, 
        message: errorMessage 
      });
    };

    this.recognition.onend = () => {
      console.log('STT: 语音识别结束');
      this.setState(STTState.IDLE);
      this.isActive = false;
      this.callbacks.onRecognitionEnd?.();
      audioManager.onRecognitionEnd();
      this.callbacks.onTimelineEvent?.('voice_recognition_end', Date.now());
      this.stopVolumeMonitoring();
    };
  }

  /**
   * 处理最终识别结果
   * @param text 识别文本
   */
  private async handleFinalResult(text: string): Promise<void> {
    if (!this.currentQuestionText || !this.currentQuestionOptions) {
      console.log('STT: 无题目信息，跳过语音匹配');
      this.setState(STTState.IDLE);
      return;
    }

    try {
      await this.performVoiceMatch(text);
    } catch (error) {
      console.error('STT: 语音匹配处理失败:', error);
      this.callbacks.onRecognitionError?.('语音匹配失败，请手动选择或重试');
    } finally {
      this.setState(STTState.IDLE);
      this.isActive = false;
    }
  }

  /**
   * 执行语音匹配
   * @param voiceText 识别的语音文本
   */
  private async performVoiceMatch(voiceText: string): Promise<void> {
    if (this.isMatching) {
      console.log('STT: 正在进行语音匹配，跳过重复请求');
      return;
    }

    this.isMatching = true;
    console.log('STT: 开始语音匹配:', voiceText);

    try {
      const tracker = getPrecisionTracker();
      tracker.recordVoiceEvent('voice_recognized', { text: voiceText });
      
      const matchResult = await voiceMatchService.matchAnswer(
        voiceText,
        this.currentQuestionText,
        this.currentQuestionOptions,
        'current_question'
      );
      
      tracker.recordVoiceEvent('voice_matched', matchResult);
      this.callbacks.onVoiceMatch?.(matchResult);
      
      if (matchResult.matched && matchResult.option) {
        console.log('STT: 语音匹配成功:', matchResult.option);
        // 匹配成功的处理逻辑由回调函数处理
      } else {
        console.log('STT: 语音匹配失败，需要用户手动选择');
      }
      
    } catch (error) {
      console.error('STT: 语音匹配异常:', error);
      this.callbacks.onRecognitionError?.('语音匹配失败，请手动选择或重试');
    } finally {
      this.isMatching = false;
    }
  }

  /**
   * 开始语音识别
   * @param questionText 当前题目文本
   * @param questionOptions 当前题目选项
   */
  async startRecognition(
    questionText: string = '',
    questionOptions: Record<string, any> = {}
  ): Promise<void> {
    if (!this.recognition) {
      throw new Error('语音识别器未初始化');
    }

    if (this.isActive) {
      console.log('STT: 语音识别已在运行中');
      return;
    }

    // 更新当前题目信息
    this.currentQuestionText = questionText;
    this.currentQuestionOptions = questionOptions;

    try {
      console.log('STT: 启动语音识别');
      await this.startVolumeMonitoring();
      this.recognition.start();
    } catch (error: any) {
      console.error('STT: 语音识别启动失败:', error);
      this.stopVolumeMonitoring();
      
      const errorMessage = this.getStartErrorMessage(error);
      this.callbacks.onRecognitionError?.(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * 停止语音识别
   */
  stopRecognition(): void {
    console.log('STT: 停止语音识别');
    
    if (this.recognition && this.isActive) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.warn('STT: 停止识别时出错:', error);
      }
    }
    
    this.stopVolumeMonitoring();
    this.setState(STTState.IDLE);
    this.isActive = false;
    this.isMatching = false;
  }

  /**
   * 开始音量监控
   */
  private async startVolumeMonitoring(): Promise<void> {
    if (this.volumeMonitoringActive) return;

    try {
      await audioManager.startVolumeMonitoring((level: number) => {
        this.callbacks.onVolumeChange?.(level);
      });
      this.volumeMonitoringActive = true;
      console.log('STT: 音量监控已启动');
    } catch (error) {
      console.warn('STT: 音量监控启动失败:', error);
      // 音量监控失败不应该阻止语音识别
    }
  }

  /**
   * 停止音量监控
   */
  private stopVolumeMonitoring(): void {
    if (!this.volumeMonitoringActive) return;

    audioManager.stopVolumeMonitoring();
    this.volumeMonitoringActive = false;
    this.callbacks.onVolumeChange?.(0);
    console.log('STT: 音量监控已停止');
  }

  /**
   * 设置状态
   * @param newState 新状态
   */
  private setState(newState: STTState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange?.(newState);
    }
  }

  /**
   * 获取当前状态
   * @returns 当前STT状态
   */
  getState(): STTState {
    return this.state;
  }

  /**
   * 检查是否正在识别
   * @returns 是否正在识别
   */
  isRecognizing(): boolean {
    return this.isActive;
  }

  /**
   * 检查是否正在匹配
   * @returns 是否正在匹配
   */
  isMatchingVoice(): boolean {
    return this.isMatching;
  }

  /**
   * 更新回调函数
   * @param newCallbacks 新的回调函数
   */
  updateCallbacks(newCallbacks: Partial<STTCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...newCallbacks };
  }

  /**
   * 销毁STT服务
   */
  destroy(): void {
    this.stopRecognition();
    this.stopVolumeMonitoring();
    this.recognition = null;
    this.callbacks = {};
  }

  /**
   * 检查STT支持
   * @returns 是否支持语音识别
   */
  private checkSTTSupport(): boolean {
    return typeof window !== 'undefined' && 
           (window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * 获取错误消息
   * @param errorCode 错误代码
   * @returns 用户友好的错误消息
   */
  private getErrorMessage(errorCode: string): string {
    const errorMessages: Record<string, string> = {
      'no-speech': '没有检测到语音，请重新尝试',
      'audio-capture': '音频捕获失败，请检查麦克风',
      'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问',
      'service-not-available': '语音识别服务不可用，请稍后重试',
      'bad-grammar': '语音识别配置错误',
      'language-not-supported': '不支持当前语言（中文）',
      'network': '网络错误，请检查网络连接'
    };

    return errorMessages[errorCode] || `语音识别失败: ${errorCode}`;
  }

  /**
   * 获取启动错误消息
   * @param error 错误对象
   * @returns 用户友好的错误消息
   */
  private getStartErrorMessage(error: any): string {
    if (error.name === 'InvalidStateError') {
      return '语音识别器状态异常，请稍后再试';
    } else if (error.name === 'NotAllowedError') {
      return '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问';
    } else if (error.name === 'ServiceNotAvailableError') {
      return '语音识别服务不可用，请检查网络连接';
    }
    return error.message || '语音识别启动失败';
  }
}

/**
 * STT工具函数集合
 */
export const STTUtils = {
  /**
   * 检查浏览器STT支持
   * @returns 是否支持语音识别
   */
  checkSTTSupport: (): boolean => {
    return typeof window !== 'undefined' && 
           (window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  /**
   * 获取STT支持状态描述
   * @returns 支持状态描述
   */
  getSTTSupportStatus: (): string => {
    if (!STTUtils.checkSTTSupport()) {
      return '浏览器不支持语音识别功能';
    }
    return '语音识别功能可用';
  },

  /**
   * 检查麦克风权限
   * @returns Promise<boolean> 是否有麦克风权限
   */
  checkMicrophonePermission: async (): Promise<boolean> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // 关闭流
      return true;
    } catch (error) {
      console.warn('麦克风权限检查失败:', error);
      return false;
    }
  },

  /**
   * 请求麦克风权限
   * @returns Promise<boolean> 是否获得权限
   */
  requestMicrophonePermission: async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // 立即关闭
      return true;
    } catch (error) {
      console.error('请求麦克风权限失败:', error);
      return false;
    }
  }
};