import { globalSpeechQueue, SpeechQueue } from '../utils/speechQueue';
import type { VoiceSettings } from './voiceSettingsService';

/**
 * TTS语音播报服务 - 处理文本转语音的业务逻辑
 * 提供单独播报、完整播报等功能，管理语音队列
 */

export interface TTSConfig {
  volume: number;
  rate: number;
  voiceIndex: number;
}

export interface TTSCallbacks {
  onStart?: (text: string) => void;
  onEnd?: (text: string) => void;
  onError?: (error: string) => void;
  onQueueComplete?: () => void;
  onTimelineEvent?: (event: string, timestamp: number, metadata?: any) => void;
}

/**
 * TTS语音播报管理器
 * 提供统一的文本转语音服务
 */
export class TTSService {
  private speechQueue: SpeechQueue;
  private callbacks: TTSCallbacks;

  constructor(callbacks: TTSCallbacks = {}) {
    this.speechQueue = globalSpeechQueue;
    this.callbacks = callbacks;
    this.setupCallbacks();
  }

  /**
   * 设置语音队列回调
   */
  private setupCallbacks() {
    this.speechQueue
      .onStart((item) => {
        this.callbacks.onStart?.(item.text);
        this.callbacks.onTimelineEvent?.('tts_start', Date.now(), { text: item.text });
      })
      .onEnd((item) => {
        this.callbacks.onEnd?.(item.text);
        this.callbacks.onTimelineEvent?.('tts_end', Date.now(), { text: item.text });
      })
      .onError((item, error) => {
        const errorMessage = `语音播报失败: ${error}`;
        this.callbacks.onError?.(errorMessage);
        this.callbacks.onTimelineEvent?.('tts_error', Date.now(), { 
          text: item.text, 
          error: errorMessage 
        });
      })
      .onQueueComplete(() => {
        this.callbacks.onQueueComplete?.();
        this.callbacks.onTimelineEvent?.('tts_queue_complete', Date.now());
      });
  }

  /**
   * 单独播报题目文本
   * @param questionText 题目文本
   * @param config TTS配置
   * @param enabled 是否启用TTS
   * @param disabled 是否禁用功能
   */
  speakQuestionOnly(
    questionText: string, 
    config: TTSConfig, 
    enabled: boolean = true,
    disabled: boolean = false
  ): void {
    if (!enabled || !questionText || disabled) {
      console.log('TTS播报被跳过:', { enabled, questionText: !!questionText, disabled });
      return;
    }

    console.log('TTS开始播报题目:', questionText.slice(0, 50) + '...');
    
    this.speechQueue.stop(); // 停止当前播放
    
    this.speechQueue.add([{
      text: questionText,
      volume: config.volume,
      rate: config.rate,
      voiceIndex: config.voiceIndex
    }]);
  }

  /**
   * 完整播报（题目+选项）
   * @param questionText 题目文本
   * @param questionOptions 题目选项
   * @param config TTS配置
   * @param enabled 是否启用TTS
   * @param disabled 是否禁用功能
   */
  speakQuestionWithOptions(
    questionText: string,
    questionOptions: Record<string, string | { text?: string; label?: string; score?: number; value?: number }> | undefined,
    config: TTSConfig,
    enabled: boolean = true,
    disabled: boolean = false
  ): void {
    if (!enabled || !questionText || disabled) {
      console.log('完整TTS播报被跳过:', { enabled, questionText: !!questionText, disabled });
      return;
    }

    console.log('TTS开始完整播报（题目+选项）');
    
    this.speechQueue.stop(); // 停止当前播放
    
    // 构建播报内容列表
    const items = [];
    
    // 添加题目
    items.push({
      text: questionText,
      volume: config.volume,
      rate: config.rate,
      voiceIndex: config.voiceIndex
    });

    // 添加选项（如果存在）
    if (questionOptions && Object.keys(questionOptions).length > 0) {
      // 添加选项提示
      items.push({
        text: "请从以下选项中选择：",
        volume: config.volume,
        rate: config.rate,
        voiceIndex: config.voiceIndex
      });

      // 添加各个选项
      Object.entries(questionOptions).forEach(([key, option]) => {
        const optionText = this.extractOptionText(key, option);
        if (optionText) {
          items.push({
            text: optionText,
            volume: config.volume,
            rate: config.rate * 0.9, // 选项播报稍慢一点
            voiceIndex: config.voiceIndex
          });
        }
      });

      // 添加结束提示
      items.push({
        text: "请说出你的选择。",
        volume: config.volume,
        rate: config.rate,
        voiceIndex: config.voiceIndex
      });
    }

    this.speechQueue.add(items);
  }

  /**
   * 提取选项文本内容
   * @param key 选项键
   * @param option 选项值
   * @returns 格式化的选项文本
   */
  private extractOptionText(key: string, option: string | { text?: string; label?: string; score?: number; value?: number }): string {
    let optionText = '';
    
    if (typeof option === 'string') {
      optionText = option;
    } else if (typeof option === 'object' && option !== null) {
      optionText = option.text || option.label || String(option.value || '');
    }

    if (!optionText) {
      return '';
    }

    // 格式化选项文本：选项A：内容
    const formattedKey = key.toUpperCase();
    return `选项${formattedKey}：${optionText}`;
  }

  /**
   * 停止当前播报
   */
  stopSpeaking(): void {
    console.log('TTS停止播报');
    this.speechQueue.stop();
  }

  /**
   * 暂停当前播报
   */
  pauseSpeaking(): void {
    console.log('TTS暂停播报');
    this.speechQueue.pause();
  }

  /**
   * 恢复播报
   */
  resumeSpeaking(): void {
    console.log('TTS恢复播报');
    this.speechQueue.resume();
  }

  /**
   * 检查是否正在播报
   * @returns 是否正在播报
   */
  isSpeaking(): boolean {
    return this.speechQueue.isPlaying();
  }

  /**
   * 获取当前队列长度
   * @returns 队列中待播报项目数量
   */
  getQueueLength(): number {
    return this.speechQueue.getQueueLength();
  }

  /**
   * 清空播报队列
   */
  clearQueue(): void {
    console.log('TTS清空播报队列');
    this.speechQueue.stop();
  }

  /**
   * 更新回调函数
   * @param newCallbacks 新的回调函数集合
   */
  updateCallbacks(newCallbacks: Partial<TTSCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...newCallbacks };
    this.setupCallbacks();
  }
}

/**
 * TTS工具函数集合
 */
export const TTSUtils = {
  /**
   * 从VoiceSettings创建TTSConfig
   * @param settings 语音设置
   * @returns TTS配置对象
   */
  createConfigFromSettings: (settings: VoiceSettings): TTSConfig => ({
    volume: settings.volume,
    rate: settings.rate,
    voiceIndex: settings.voiceIndex,
  }),

  /**
   * 验证TTS配置
   * @param config TTS配置
   * @returns 验证后的配置
   */
  validateConfig: (config: TTSConfig): TTSConfig => ({
    volume: Math.max(0, Math.min(1, config.volume || 0.8)),
    rate: Math.max(0.5, Math.min(2, config.rate || 1.0)),
    voiceIndex: Math.max(0, config.voiceIndex || 0),
  }),

  /**
   * 估算文本播报时长（秒）
   * @param text 文本内容
   * @param rate 播报语速
   * @returns 估算时长（秒）
   */
  estimatePlayDuration: (text: string, rate: number = 1.0): number => {
    // 根据中文文本特点估算：平均每分钟200-300字
    const wordsPerMinute = 250;
    const textLength = text.length;
    const baseDurationMinutes = textLength / wordsPerMinute;
    const adjustedDuration = baseDurationMinutes / rate;
    return Math.max(1, Math.round(adjustedDuration * 60)); // 最少1秒
  },

  /**
   * 检查浏览器TTS支持
   * @returns 是否支持语音合成
   */
  checkTTSSupport: (): boolean => {
    return typeof window !== 'undefined' && 
           'speechSynthesis' in window && 
           typeof speechSynthesis !== 'undefined';
  },

  /**
   * 获取TTS支持状态描述
   * @returns 支持状态描述
   */
  getTTSSupportStatus: (): string => {
    if (!TTSUtils.checkTTSSupport()) {
      return '浏览器不支持语音合成功能';
    }

    try {
      const voices = speechSynthesis.getVoices();
      if (voices.length === 0) {
        return '语音合成功能可用，但暂未加载语音包';
      }
      return `语音合成功能正常，共${voices.length}个可用语音`;
    } catch (error) {
      return '语音合成功能异常';
    }
  }
};