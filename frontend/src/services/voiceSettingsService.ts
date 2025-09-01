/**
 * 语音设置服务 - 管理语音交互的配置和设置
 * 提供TTS和STT的配置管理、语音列表获取等功能
 */

export interface VoiceSettings {
  ttsEnabled: boolean;      // TTS开关
  sttEnabled: boolean;      // STT开关
  volume: number;          // 音量 (0-1)
  rate: number;            // 语速 (0.5-2)
  autoPlay: boolean;       // 自动播放
  voiceIndex: number;      // 语音索引
}

/**
 * 语音设置管理类
 * 提供设置的加载、保存、验证等功能
 */
export class VoiceSettingsManager {
  private static readonly STORAGE_KEY = 'voice_interaction_settings';
  private static readonly DEFAULT_SETTINGS: VoiceSettings = {
    ttsEnabled: true,
    sttEnabled: true,
    volume: 0.8,
    rate: 1.0,
    autoPlay: false,
    voiceIndex: 0,
  };

  /**
   * 加载语音设置
   * @returns 语音设置对象
   */
  static loadSettings(): VoiceSettings {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        return this.validateSettings(settings);
      }
    } catch (error) {
      console.warn('加载语音设置失败，使用默认设置:', error);
    }
    return { ...this.DEFAULT_SETTINGS };
  }

  /**
   * 保存语音设置
   * @param settings 要保存的设置
   */
  static saveSettings(settings: VoiceSettings): void {
    try {
      const validatedSettings = this.validateSettings(settings);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(validatedSettings));
    } catch (error) {
      console.error('保存语音设置失败:', error);
    }
  }

  /**
   * 验证和修正设置值
   * @param settings 待验证的设置
   * @returns 验证后的设置
   */
  private static validateSettings(settings: Partial<VoiceSettings>): VoiceSettings {
    return {
      ttsEnabled: Boolean(settings.ttsEnabled ?? this.DEFAULT_SETTINGS.ttsEnabled),
      sttEnabled: Boolean(settings.sttEnabled ?? this.DEFAULT_SETTINGS.sttEnabled),
      volume: Math.max(0, Math.min(1, Number(settings.volume) || this.DEFAULT_SETTINGS.volume)),
      rate: Math.max(0.5, Math.min(2, Number(settings.rate) || this.DEFAULT_SETTINGS.rate)),
      autoPlay: Boolean(settings.autoPlay ?? this.DEFAULT_SETTINGS.autoPlay),
      voiceIndex: Math.max(0, Number(settings.voiceIndex) || this.DEFAULT_SETTINGS.voiceIndex),
    };
  }

  /**
   * 重置为默认设置
   * @returns 默认设置对象
   */
  static resetToDefault(): VoiceSettings {
    const defaultSettings = { ...this.DEFAULT_SETTINGS };
    this.saveSettings(defaultSettings);
    return defaultSettings;
  }
}

/**
 * 语音列表管理类
 * 处理浏览器语音合成可用语音的获取和管理
 */
export class VoiceListManager {
  private static availableVoices: SpeechSynthesisVoice[] = [];
  private static isLoaded = false;
  private static loadPromise: Promise<SpeechSynthesisVoice[]> | null = null;

  /**
   * 获取可用语音列表
   * @returns Promise<SpeechSynthesisVoice[]>
   */
  static async getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
    if (this.isLoaded) {
      return this.availableVoices;
    }

    // 如果正在加载，返回现有的Promise
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.loadVoices();
    return this.loadPromise;
  }

  /**
   * 加载语音列表
   * @returns Promise<SpeechSynthesisVoice[]>
   */
  private static loadVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      const loadVoiceList = () => {
        const voices = speechSynthesis.getVoices();
        if (voices.length > 0) {
          // 优先选择中文语音
          const chineseVoices = voices.filter(voice => 
            voice.lang.startsWith('zh') || 
            voice.name.includes('Chinese') ||
            voice.name.includes('中文') ||
            voice.name.includes('国语') ||
            voice.name.includes('普通话')
          );

          // 将中文语音排在前面
          this.availableVoices = [
            ...chineseVoices,
            ...voices.filter(voice => !chineseVoices.includes(voice))
          ];

          this.isLoaded = true;
          this.loadPromise = null;
          
          console.log(`语音列表加载完成，共${voices.length}个语音，其中${chineseVoices.length}个中文语音`);
          resolve(this.availableVoices);
        } else {
          // 语音列表可能还未加载完成，稍后重试
          setTimeout(loadVoiceList, 100);
        }
      };

      // 监听语音变化事件
      speechSynthesis.addEventListener('voiceschanged', loadVoiceList);
      
      // 立即尝试加载
      loadVoiceList();
    });
  }

  /**
   * 获取推荐的中文语音索引
   * @returns 推荐的语音索引
   */
  static getRecommendedChineseVoiceIndex(): number {
    if (!this.isLoaded) {
      return 0;
    }

    // 寻找最佳的中文语音
    const preferredNames = ['中文', '国语', '普通话', 'Chinese', 'zh-CN'];
    
    for (const name of preferredNames) {
      const index = this.availableVoices.findIndex(voice => 
        voice.name.includes(name) || voice.lang.includes(name)
      );
      if (index !== -1) {
        return index;
      }
    }

    // 如果没找到特定的，返回第一个中文语音
    const chineseIndex = this.availableVoices.findIndex(voice => 
      voice.lang.startsWith('zh')
    );

    return chineseIndex !== -1 ? chineseIndex : 0;
  }

  /**
   * 根据索引获取语音对象
   * @param index 语音索引
   * @returns 语音对象或null
   */
  static getVoiceByIndex(index: number): SpeechSynthesisVoice | null {
    if (!this.isLoaded || index < 0 || index >= this.availableVoices.length) {
      return null;
    }
    return this.availableVoices[index];
  }

  /**
   * 强制重新加载语音列表
   * @returns Promise<SpeechSynthesisVoice[]>
   */
  static async reloadVoices(): Promise<SpeechSynthesisVoice[]> {
    this.isLoaded = false;
    this.loadPromise = null;
    this.availableVoices = [];
    return this.getAvailableVoices();
  }
}