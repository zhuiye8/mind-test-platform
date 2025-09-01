/**

 * 音频核心服务
 * 负责基础配置、目录管理和核心功能
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createBaiduTTSService, BaiduTTSService } from '../baiduTTSService';
import { AudioBatchProcessor } from '../audioBatchProcessor';
import { Question } from './types';

export class AudioCoreService {
  protected readonly uploadDir: string;
  protected readonly audioDir: string;
  protected readonly tempDir: string;
  protected baiduTTSService: BaiduTTSService | null = null;
  protected batchProcessor: AudioBatchProcessor;
  
  // 静态初始化控制
  private static isInitialized = false;
  
  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.audioDir = path.join(this.uploadDir, 'audio', 'questions');
    this.tempDir = path.join(this.uploadDir, 'temp');
    
    // 确保只初始化一次
    this.initializeOnce();
    this.batchProcessor = new AudioBatchProcessor();
  }
  
  /**
   * 确保只初始化一次
   */
  private initializeOnce(): void {
    if (AudioCoreService.isInitialized) {
      return;
    }
    
    // 同步创建目录，避免并发访问问题
    this.ensureDirectoriesSync();
    this.initializeTTSService();
    
    AudioCoreService.isInitialized = true;
  }

  /**
   * 初始化百度TTS服务
   */
  private initializeTTSService(): void {
    try {
      const token = process.env.BAIDU_TTS_TOKEN;
      if (token) {
        this.baiduTTSService = createBaiduTTSService(token);
        console.log('✅ 百度TTS服务初始化成功');
      } else {
        console.warn('⚠️ 未配置百度TTS Token，将使用模拟音频生成');
      }
    } catch (error) {
      console.error('❌ 百度TTS服务初始化失败:', error);
      this.baiduTTSService = null;
    }
  }

  /**
   * 确保目录存在（同步版本，避免构造函数中的并发问题）
   */
  private ensureDirectoriesSync(): void {
    try {
      const fsSync = require('fs');
      fsSync.mkdirSync(this.uploadDir, { recursive: true });
      fsSync.mkdirSync(this.audioDir, { recursive: true });
      fsSync.mkdirSync(this.tempDir, { recursive: true });
      console.log('📁 音频文件目录同步初始化完成');
    } catch (error) {
      console.error('创建音频目录失败:', error);
    }
  }

  /**
   * 计算题目内容哈希
   */
  calculateContentHash(question: Question | any): string {
    // 将题目内容和选项组合成字符串计算哈希
    const questionType = question.question_type || question.questionType;
    const content = `${question.title}|${JSON.stringify(question.options)}|${questionType}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 生成题目内容的TTS文本
   */
  generateTTSText(question: Question | any): string {
    let ttsText = question.title;
    
    // 如果是选择题，添加选项
    const questionType = question.question_type || question.questionType;
    if (questionType === 'single_choice' || questionType === 'multiple_choice') {
      if (question.options && typeof question.options === 'object') {
        ttsText += '。选项有：';
        const optionEntries = Object.entries(question.options);
        optionEntries.forEach(([key, value], index) => {
          const optionText = typeof value === 'string' ? value : 
            (typeof value === 'object' && value && 'text' in value) ? String(value.text) : String(value);
          ttsText += `${key}、${optionText}`;
          if (index < optionEntries.length - 1) {
            ttsText += '。';
          }
        });
      }
    }
    
    return ttsText;
  }

  /**
   * 映射语音设置到百度TTS发音人
   */
  protected mapVoiceSettingsToBaiduVoice(voice?: string): number {
    const voiceMap: Record<string, number> = {
      'female': 0,    // 女声
      'male': 1,      // 男声
      'child': 4,     // 童声
      'default': 0,
    };
    
    return voiceMap[voice || 'default'] || 0;
  }

  /**
   * 获取音频时长
   */
  protected async getAudioDuration(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      
      // 对于真实的MP3文件，尝试读取文件头估算时长
      if (stats.size > 100 && this.baiduTTSService) {
        // 读取文件头检查是否为真实MP3
        const buffer = await fs.readFile(filePath, { encoding: null, flag: 'r' });
        if (buffer.length > 10 && buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
          // 真实MP3文件，基于文件大小估算时长（粗略估算：128kbps）
          const durationSeconds = Math.max(1, Math.round(stats.size / (128 * 1024 / 8))); // 128kbps
          console.log(`📊 MP3文件时长估算: ${durationSeconds}秒 (文件大小: ${stats.size} bytes)`);
          return Math.min(durationSeconds, 300); // 最大5分钟
        }
      }
      
      // 回退到基于文本长度的估算
      const estimatedDuration = Math.max(2, Math.min(30, stats.size / 1000)); // 基于文件大小的简单估算
      console.log(`📊 基于文件大小的时长估算: ${estimatedDuration}秒`);
      return estimatedDuration;
      
    } catch (error) {
      console.warn('获取音频时长失败，使用默认值:', error);
      return 5; // 默认5秒
    }
  }

  /**
   * 获取语音文件物理路径
   */
  async getAudioFilePath(questionId: string, filename: string): Promise<string | null> {
    const filePath = path.join(this.audioDir, questionId, filename);
    
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  // 获取器方法
  get audioDirectory(): string {
    return this.audioDir;
  }

  get tempDirectory(): string {
    return this.tempDir;
  }

  get ttsService(): BaiduTTSService | null {
    return this.baiduTTSService;
  }

  get processor(): AudioBatchProcessor {
    return this.batchProcessor;
  }
}