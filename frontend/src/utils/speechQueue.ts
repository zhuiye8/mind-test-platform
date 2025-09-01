// 语音合成队列管理器 - 支持题目+选项逐个播报
export interface SpeechConfig {
  lang?: string;
  volume?: number;
  rate?: number;
  pitch?: number;
  voiceIndex?: number;
}

export interface QueueItem {
  id: string;
  text: string;
  config?: SpeechConfig;
  delay?: number; // 播报后的延迟时间（毫秒）
}

export class SpeechQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private availableVoices: SpeechSynthesisVoice[] = [];
  private defaultConfig: SpeechConfig = {
    lang: 'zh-CN',
    volume: 0.8,
    rate: 1.0,
    pitch: 1.0,
    voiceIndex: 0
  };

  // 事件回调
  private onStartCallback?: (item: QueueItem) => void;
  private onEndCallback?: (item: QueueItem) => void;
  private onErrorCallback?: (item: QueueItem, error: any) => void;
  private onQueueCompleteCallback?: () => void;

  constructor(defaultConfig?: Partial<SpeechConfig>) {
    this.defaultConfig = { ...this.defaultConfig, ...defaultConfig };
    this.loadVoices();
    
    // 监听语音列表变化
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.addEventListener('voiceschanged', this.loadVoices.bind(this));
      
      // 解决队列卡死问题：定期检查和重启
      setInterval(() => {
        if (speechSynthesis.speaking && this.isProcessing) {
          console.log('SpeechQueue: 检查语音合成状态');
        }
      }, 5000);
    }
  }

  // 加载可用语音（优先选择中文语音）
  private loadVoices(): void {
    if (typeof speechSynthesis !== 'undefined') {
      const voices = speechSynthesis.getVoices();
      
      // 优先选择中文语音
      const chineseVoices = voices.filter(voice => 
        voice.lang.includes('zh') || 
        voice.lang.includes('CN') ||
        voice.name.includes('中文') ||
        voice.name.includes('Chinese')
      );
      
      this.availableVoices = chineseVoices.length > 0 ? chineseVoices : voices;
      console.log('SpeechQueue: 加载语音列表', this.availableVoices.length, '中文语音:', chineseVoices.length);
      
      // 自动选择最佳中文语音
      if (chineseVoices.length > 0) {
        // 优先选择本地语音
        const localVoice = chineseVoices.find(voice => voice.localService);
        if (localVoice) {
          this.defaultConfig.voiceIndex = 0; // 使用第一个本地中文语音
        }
      }
    }
  }

  // 设置事件回调
  onStart(callback: (item: QueueItem) => void): SpeechQueue {
    this.onStartCallback = callback;
    return this;
  }

  onEnd(callback: (item: QueueItem) => void): SpeechQueue {
    this.onEndCallback = callback;
    return this;
  }

  onError(callback: (item: QueueItem, error: any) => void): SpeechQueue {
    this.onErrorCallback = callback;
    return this;
  }

  onQueueComplete(callback: () => void): SpeechQueue {
    this.onQueueCompleteCallback = callback;
    return this;
  }

  // 添加单个播报项到队列
  add(text: string, config?: Partial<SpeechConfig>, delay?: number): string {
    const id = `speech_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const item: QueueItem = {
      id,
      text: text.trim(),
      config: { ...this.defaultConfig, ...config },
      delay: delay || 0
    };

    this.queue.push(item);
    console.log(`SpeechQueue: 添加播报项 [${id}]: "${text}"`);

    // 如果队列空闲，立即开始处理
    if (!this.isProcessing) {
      this.processNext();
    }

    return id;
  }

  // 添加题目完整播报（题目 + 选项）
  addQuestionWithOptions(
    questionTitle: string, 
    options: Record<string, any>, 
    config?: Partial<SpeechConfig>
  ): string[] {
    const ids: string[] = [];

    // 1. 播报题目
    ids.push(this.add(questionTitle, config, 500));

    // 2. 播报选项提示
    ids.push(this.add("请选择以下选项之一：", config, 300));

    // 3. 逐个播报选项
    const entries = Object.entries(options);
    entries.forEach(([key, option], index) => {
      const optionText = this.extractOptionText(option);
      const isLast = index === entries.length - 1;
      
      // 选项播报格式：选项A：非常同意
      const speechText = `选项${key}：${optionText}`;
      const delay = isLast ? 800 : 1000; // 最后一个选项后延迟800ms，其他1000ms
      
      ids.push(this.add(speechText, config, delay));
    });

    // 4. 播报结束提示
    ids.push(this.add("请说出您选择的选项，或点击对应按钮。", config, 0));

    console.log(`SpeechQueue: 添加完整题目播报，共 ${ids.length} 项`);
    return ids;
  }

  // 添加选项播报（仅选项）
  addOptionsOnly(options: Record<string, any>, config?: Partial<SpeechConfig>): string[] {
    const ids: string[] = [];

    ids.push(this.add("可选择的选项有：", config, 300));

    const entries = Object.entries(options);
    entries.forEach(([key, option], index) => {
      const optionText = this.extractOptionText(option);
      const isLast = index === entries.length - 1;
      
      const speechText = `${key}：${optionText}`;
      const delay = isLast ? 500 : 800;
      
      ids.push(this.add(speechText, config, delay));
    });

    return ids;
  }

  // 提取选项文本
  private extractOptionText(option: any): string {
    if (typeof option === 'string') {
      return option;
    }
    if (typeof option === 'object' && option !== null) {
      return option.text || option.label || option.value || '未知选项';
    }
    return String(option);
  }

  // 处理队列中的下一项
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      console.log('SpeechQueue: 队列播报完成');
      this.onQueueCompleteCallback?.();
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift()!;

    try {
      await this.speakItem(item);
    } catch (error) {
      console.error('SpeechQueue: 播报失败', error);
      this.onErrorCallback?.(item, error);
    }

    // 处理下一项
    this.processNext();
  }

  // 播报单个项目（增强中文支持）
  private speakItem(item: QueueItem): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!item.text) {
        resolve();
        return;
      }

      try {
        // 解决队列卡死问题：如果队列卡死，重启
        if (speechSynthesis.speaking && speechSynthesis.pending) {
          console.warn('SpeechQueue: 检测到队列卡死，重启语音合成');
          speechSynthesis.cancel();
          // 短暂延迟后重试
          setTimeout(() => this.speakItem(item).then(resolve).catch(reject), 100);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(item.text);
        const config = item.config || this.defaultConfig;

        // 设置语音参数（中文优化）
        utterance.lang = config.lang || 'zh-CN';
        utterance.volume = config.volume || 0.8;
        utterance.rate = config.rate || 0.9; // 中文语音适当放慢
        utterance.pitch = config.pitch || 1.0;

        // 智能选择中文语音
        if (this.availableVoices.length > 0) {
          let selectedVoice = null;
          
          // 优先使用指定的语音
          if (config.voiceIndex !== undefined && this.availableVoices[config.voiceIndex]) {
            selectedVoice = this.availableVoices[config.voiceIndex];
          } else {
            // 自动选择最佳中文语音
            selectedVoice = this.availableVoices.find(voice => 
              voice.lang.includes('zh-CN') && voice.localService
            ) || this.availableVoices.find(voice => 
              voice.lang.includes('zh')
            ) || this.availableVoices[0];
          }
          
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log(`SpeechQueue: 使用语音: ${selectedVoice.name} (${selectedVoice.lang})`);
          }
        }

        // 设置事件处理
        utterance.onstart = () => {
          console.log(`SpeechQueue: 开始播报 [${item.id}]: "${item.text}"`);
          this.onStartCallback?.(item);
        };

        utterance.onend = () => {
          console.log(`SpeechQueue: 播报完成 [${item.id}]`);
          this.onEndCallback?.(item);
          
          // 应用延迟
          if (item.delay && item.delay > 0) {
            setTimeout(resolve, item.delay);
          } else {
            // 中文语音需要额外的间隔时间
            setTimeout(resolve, 200);
          }
        };

        utterance.onerror = (event) => {
          console.error(`SpeechQueue: 播报错误 [${item.id}]:`, event.error);
          this.onErrorCallback?.(item, event.error);
          
          // 对于某些错误，尝试重试
          if (event.error === 'interrupted' || event.error === 'synthesis-failed') {
            console.log('SpeechQueue: 尝试重试播报');
            setTimeout(() => this.speakItem(item).then(resolve).catch(reject), 500);
          } else {
            reject(new Error(`播报失败: ${event.error}`));
          }
        };

        this.currentUtterance = utterance;
        speechSynthesis.speak(utterance);

      } catch (error) {
        console.error('SpeechQueue: 创建播报失败', error);
        reject(error);
      }
    });
  }

  // 暂停播报
  pause(): void {
    if (speechSynthesis.speaking) {
      speechSynthesis.pause();
      console.log('SpeechQueue: 暂停播报');
    }
  }

  // 恢复播报
  resume(): void {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      console.log('SpeechQueue: 恢复播报');
    }
  }

  // 停止当前播报并清空队列
  stop(): void {
    speechSynthesis.cancel();
    this.queue = [];
    this.currentUtterance = null;
    this.isProcessing = false;
    console.log('SpeechQueue: 停止播报并清空队列');
  }

  // 清空队列但不停止当前播报
  clear(): void {
    this.queue = [];
    console.log('SpeechQueue: 清空队列');
  }

  // 获取队列状态
  getStatus(): {
    queueLength: number;
    isProcessing: boolean;
    currentItem: QueueItem | null;
    isSpeaking: boolean;
    isPaused: boolean;
  } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      currentItem: this.currentUtterance ? { 
        id: 'current', 
        text: this.currentUtterance.text 
      } : null,
      isSpeaking: speechSynthesis.speaking,
      isPaused: speechSynthesis.paused
    };
  }

  // 更新默认配置
  updateDefaultConfig(config: Partial<SpeechConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
    console.log('SpeechQueue: 更新默认配置', this.defaultConfig);
  }

  // 获取可用语音列表
  getAvailableVoices(): SpeechSynthesisVoice[] {
    return this.availableVoices.filter(voice => 
      voice.lang.includes('zh') || voice.lang.includes('CN')
    );
  }

  // 销毁队列
  destroy(): void {
    this.stop();
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.removeEventListener('voiceschanged', this.loadVoices.bind(this));
    }
    console.log('SpeechQueue: 队列已销毁');
  }
}

// 全局实例
export const globalSpeechQueue = new SpeechQueue();