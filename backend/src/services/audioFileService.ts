import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../utils/database';
import { createBaiduTTSService, BaiduTTSService } from './baiduTTSService';
import { audioProgressService } from './audioProgressService';
import { AudioBatchProcessor } from './audioBatchProcessor';

interface Question {
  id: string;
  title: string;
  options: any;
  question_type: string;
  questionType: string; // Prisma field name compatibility
}

interface VoiceSettings {
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
}

interface AudioGenerationResult {
  success: boolean;
  audioId?: string;
  filePath?: string;
  fileUrl?: string;
  duration?: number;
  error?: string;
}

export class AudioFileService {
  private readonly uploadDir: string;
  private readonly audioDir: string;
  private readonly tempDir: string;
  private baiduTTSService: BaiduTTSService | null = null;
  private batchProcessor: AudioBatchProcessor;
  
  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.audioDir = path.join(this.uploadDir, 'audio', 'questions');
    this.tempDir = path.join(this.uploadDir, 'temp');
    
    // 同步创建目录，避免并发访问问题
    this.ensureDirectoriesSync();
    this.initializeTTSService();
    this.batchProcessor = new AudioBatchProcessor();
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
   * 为单个题目生成语音文件
   */
  async generateAudioForQuestion(
    questionId: string, 
    voiceSettings?: VoiceSettings
  ): Promise<AudioGenerationResult> {
    try {
      console.log(`🎙️ 开始为题目生成语音文件: ${questionId}`);
      
      // 获取题目信息
      const question = await prisma.question.findUnique({
        where: { id: questionId }
      });

      if (!question) {
        return { success: false, error: '题目不存在' };
      }

      // 计算内容哈希
      const contentHash = this.calculateContentHash(question);
      
      // 检查是否已存在且内容未变化
      const existingAudio = await prisma.questionAudio.findUnique({
        where: { questionId }
      });

      if (existingAudio && existingAudio.contentHash === contentHash && existingAudio.status === 'ready') {
        console.log(`✅ 题目 ${questionId} 语音文件已存在且内容未变化`);
        return {
          success: true,
          audioId: existingAudio.id,
          filePath: existingAudio.filePath,
          fileUrl: existingAudio.fileUrl,
          duration: existingAudio.duration || 0
        };
      }

      // 生成TTS文本
      const ttsText = this.generateTTSText(question);
      
      // 创建题目专用目录
      const questionDir = path.join(this.audioDir, questionId);
      await fs.mkdir(questionDir, { recursive: true });

      const filename = `question_audio.mp3`;
      const filePath = path.join(questionDir, filename);
      const fileUrl = `/api/audio/questions/${questionId}/${filename}`;

      // 更新或创建数据库记录 
      const audioData = {
        filename,
        filePath,
        fileUrl,
        format: 'mp3',
        voiceSettings: voiceSettings ? (voiceSettings as any) : Prisma.DbNull,
        contentHash,
        status: 'generating',
        error: null,
        generatedAt: null
      };

      let audioRecord;
      if (existingAudio) {
        audioRecord = await prisma.questionAudio.update({
          where: { questionId },
          data: audioData
        });
      } else {
        audioRecord = await prisma.questionAudio.create({
          data: {
            ...audioData,
            questionId
          }
        });
      }

      try {
        // 生成音频文件 (这里使用模拟实现，实际可集成Web Speech API)
        const audioBuffer = await this.generateAudioBuffer(ttsText, voiceSettings);
        
        // 保存音频文件
        await fs.writeFile(filePath, audioBuffer);
        
        // 获取文件信息
        const stats = await fs.stat(filePath);
        const duration = await this.getAudioDuration(filePath);

        // 更新记录状态
        await prisma.questionAudio.update({
          where: { id: audioRecord.id },
          data: {
            status: 'ready',
            fileSize: stats.size,
            duration,
            generatedAt: new Date()
          }
        });

        console.log(`✅ 题目 ${questionId} 语音文件生成完成`);
        
        return {
          success: true,
          audioId: audioRecord.id,
          filePath,
          fileUrl,
          duration
        };

      } catch (audioError) {
        // 更新错误状态
        await prisma.questionAudio.update({
          where: { id: audioRecord.id },
          data: {
            status: 'error',
            error: audioError instanceof Error ? audioError.message : String(audioError)
          }
        });

        throw audioError;
      }

    } catch (error) {
      console.error(`❌ 生成题目 ${questionId} 语音失败:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * 生成音频缓冲区 (使用百度TTS或备用模拟实现)
   */
  private async generateAudioBuffer(text: string, voiceSettings?: VoiceSettings): Promise<Buffer> {
    if (this.baiduTTSService) {
      return await this.generateAudioWithBaiduTTS(text, voiceSettings);
    } else {
      return await this.generateMockAudio(text, voiceSettings);
    }
  }

  /**
   * 使用百度TTS生成音频
   */
  private async generateAudioWithBaiduTTS(text: string, voiceSettings?: VoiceSettings): Promise<Buffer> {
    try {
      console.log(`🎵 使用百度TTS生成语音: "${text.slice(0, 50)}..." (${voiceSettings?.voice || 'default'})`);
      
      // 更新百度TTS配置
      if (voiceSettings) {
        const baiduConfig = {
          voice: this.mapVoiceSettingsToBaiduVoice(voiceSettings.voice),
          speed: Math.round((voiceSettings.rate || 1) * 5), // 转换为百度TTS的0-15范围
          pitch: Math.round((voiceSettings.pitch || 1) * 5), // 转换为百度TTS的0-15范围
          volume: Math.round((voiceSettings.volume || 1) * 5), // 转换为百度TTS的0-9范围
        };
        this.baiduTTSService?.updateConfig(baiduConfig);
      }

      // 创建临时文件路径
      const tempFileName = `temp_audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const tempFilePath = path.join(this.tempDir, tempFileName);

      try {
        // 使用百度TTS生成音频文件
        await this.baiduTTSService?.textToSpeech([text], tempFilePath);

        // 读取生成的音频文件
        const audioBuffer = await fs.readFile(tempFilePath);
        
        // 删除临时文件
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          console.warn('清理临时文件失败:', cleanupError);
        }

        console.log(`✅ 百度TTS音频生成成功，大小: ${audioBuffer.length} bytes`);
        return audioBuffer;

      } catch (ttsError) {
        // 清理可能的临时文件
        try {
          await fs.unlink(tempFilePath);
        } catch {}
        throw ttsError;
      }

    } catch (error) {
      console.error('百度TTS生成音频失败:', error);
      // 回退到模拟实现
      console.log('🔄 回退到模拟音频生成...');
      return await this.generateMockAudio(text, voiceSettings);
    }
  }

  /**
   * 映射语音设置到百度TTS发音人
   */
  private mapVoiceSettingsToBaiduVoice(voice?: string): number {
    const voiceMap: Record<string, number> = {
      'female': 0,    // 女声
      'male': 1,      // 男声
      'child': 4,     // 童声
      'default': 0,
    };
    
    return voiceMap[voice || 'default'] || 0;
  }

  /**
   * 生成模拟音频 (备用方案)
   */
  private async generateMockAudio(text: string, voiceSettings?: VoiceSettings): Promise<Buffer> {
    console.log(`🎵 生成模拟语音: "${text.slice(0, 50)}..." (${voiceSettings?.voice || 'default'})`);
    
    // 模拟音频生成延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 生成一个更像MP3文件头的模拟数据
    const mp3Header = Buffer.from([
      0xFF, 0xFB, 0x90, 0x00,  // MP3 header
      0x00, 0x00, 0x00, 0x00,  // padding
    ]);
    
    const textData = Buffer.from(`MOCK_AUDIO_DATA_FOR_${Date.now()}_${text.slice(0, 20)}`);
    const mockAudioData = Buffer.concat([mp3Header, textData]);
    
    console.log(`⚠️ 使用模拟音频数据，大小: ${mockAudioData.length} bytes`);
    return mockAudioData;
  }

  /**
   * 获取音频时长
   */
  private async getAudioDuration(filePath: string): Promise<number> {
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
   * 删除题目语音文件
   */
  async deleteAudioFile(questionId: string): Promise<boolean> {
    try {
      const audioRecord = await prisma.questionAudio.findUnique({
        where: { questionId }
      });

      if (!audioRecord) {
        return true; // 文件不存在视为删除成功
      }

      // 删除物理文件
      const questionDir = path.join(this.audioDir, questionId);
      try {
        await fs.rm(questionDir, { recursive: true, force: true });
        console.log(`🗑️ 删除语音文件目录: ${questionDir}`);
      } catch (fsError) {
        console.warn(`警告: 删除文件失败 ${questionDir}:`, fsError);
      }

      // 删除数据库记录
      await prisma.questionAudio.delete({
        where: { questionId }
      });

      console.log(`✅ 题目 ${questionId} 语音文件已删除`);
      return true;

    } catch (error) {
      console.error(`❌ 删除题目 ${questionId} 语音失败:`, error);
      return false;
    }
  }

  /**
   * 检查并更新语音文件 (当题目内容改变时)
   */
  async updateAudioIfNeeded(questionId: string): Promise<{ needsUpdate: boolean; currentHash?: string; }> {
    try {
      const question = await prisma.question.findUnique({
        where: { id: questionId }
      });

      if (!question) {
        return { needsUpdate: false };
      }

      const currentHash = this.calculateContentHash(question);
      
      const audioRecord = await prisma.questionAudio.findUnique({
        where: { questionId }
      });

      if (!audioRecord) {
        // 没有语音文件，需要创建
        return { needsUpdate: true, currentHash };
      }

      if (audioRecord.contentHash !== currentHash) {
        // 内容已变化，需要更新
        console.log(`🔄 题目 ${questionId} 内容已变化，需要更新语音文件`);
        return { needsUpdate: true, currentHash };
      }

      return { needsUpdate: false, currentHash };

    } catch (error) {
      console.error(`检查题目 ${questionId} 语音更新失败:`, error);
      return { needsUpdate: false };
    }
  }

  /**
   * 批量生成试卷语音文件 (使用新的批量处理器)
   */
  async batchGenerateAudio(
    paperId: string, 
    voiceSettings?: VoiceSettings,
    onProgress?: (current: number, total: number, questionId: string) => void
  ): Promise<{ success: number; failed: number; errors: string[]; totalTime: number; }> {
    try {
      console.log(`📋 使用新的批量处理器生成试卷 ${paperId} 的语音文件`);
      
      // 委托给新的批量处理器
      const result = await this.batchProcessor.processBatchAudio(
        paperId,
        voiceSettings,
        onProgress
      );

      console.log(`📊 新批量处理器完成: 成功 ${result.success}, 失败 ${result.failed}, 批次ID: ${result.batchId}`);
      
      return {
        success: result.success,
        failed: result.failed,
        errors: result.errors,
        totalTime: result.totalTime
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      console.error(`❌ 新批量处理器失败:`, error);
      audioProgressService.sendError(paperId, errorMsg, { paperId });
      
      return { 
        success: 0, 
        failed: 0, 
        errors: [errorMsg],
        totalTime: 0
      };
    }
  }

  /**
   * 批量生成试卷语音文件 (旧版本，保留向后兼容)
   * @deprecated 请使用新的批量处理器版本
   */
  async batchGenerateAudioLegacy(
    paperId: string, 
    voiceSettings?: VoiceSettings,
    onProgress?: (current: number, total: number, questionId: string) => void
  ): Promise<{ success: number; failed: number; errors: string[]; totalTime: number; }> {
    const startTime = Date.now();
    
    try {
      console.log(`📋 使用旧版批量生成试卷 ${paperId} 的语音文件`);
      
      // 获取试卷所有题目
      const questions = await prisma.question.findMany({
        where: { paperId },
        orderBy: { questionOrder: 'asc' }
      });

      if (questions.length === 0) {
        const error = '试卷没有题目';
        audioProgressService.sendError(paperId, error);
        return { success: 0, failed: 0, errors: [error], totalTime: 0 };
      }

      const results = { success: 0, failed: 0, errors: [] as string[] };

      // 逐个生成语音文件
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        
        // 发送整体进度更新
        audioProgressService.sendBatchProgress(
          paperId,
          i + 1,
          questions.length,
          question.id,
          question.title
        );

        // 发送题目开始生成
        audioProgressService.sendQuestionProgress(
          paperId,
          question.id,
          question.title,
          'start'
        );

        // 传统回调支持
        if (onProgress) {
          onProgress(i + 1, questions.length, question.id);
        }

        console.log(`🎯 处理题目 ${i + 1}/${questions.length}: ${question.title.slice(0, 30)}...`);

        try {
          // 使用增强的生成方法，包含进度回调
          const result = await this.generateAudioForQuestionWithProgress(
            question.id, 
            voiceSettings,
            (progress) => {
              audioProgressService.sendQuestionProgress(
                paperId,
                question.id,
                question.title,
                'progress',
                progress
              );
            }
          );
          
          if (result.success) {
            results.success++;
            audioProgressService.sendQuestionProgress(
              paperId,
              question.id,
              question.title,
              'completed'
            );
          } else {
            results.failed++;
            const errorMsg = `题目 ${i + 1}: ${result.error || '未知错误'}`;
            results.errors.push(errorMsg);
            audioProgressService.sendQuestionProgress(
              paperId,
              question.id,
              question.title,
              'error',
              0,
              result.error
            );
          }
        } catch (questionError) {
          results.failed++;
          const errorMsg = `题目 ${i + 1}: ${questionError instanceof Error ? questionError.message : String(questionError)}`;
          results.errors.push(errorMsg);
          audioProgressService.sendQuestionProgress(
            paperId,
            question.id,
            question.title,
            'error',
            0,
            errorMsg
          );
        }

        // 避免并发过多，添加小延迟
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const totalTime = Date.now() - startTime;
      const finalResults = { ...results, totalTime };

      // 发送完成消息
      audioProgressService.sendBatchCompleted(paperId, finalResults);

      console.log(`📊 旧版批量生成完成: 成功 ${results.success}, 失败 ${results.failed}, 耗时 ${Math.round(totalTime)}ms`);
      return finalResults;

    } catch (error) {
      const totalTime = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      console.error(`❌ 旧版批量生成试卷 ${paperId} 语音失败:`, error);
      audioProgressService.sendError(paperId, errorMsg, { paperId, totalTime });
      
      return { 
        success: 0, 
        failed: 0, 
        errors: [errorMsg],
        totalTime
      };
    }
  }

  /**
   * 为单个题目生成语音文件 (支持进度回调)
   */
  private async generateAudioForQuestionWithProgress(
    questionId: string, 
    voiceSettings?: VoiceSettings,
    onProgress?: (progress: number) => void
  ): Promise<AudioGenerationResult> {
    try {
      onProgress?.(10);
      console.log(`🎙️ 开始为题目生成语音文件: ${questionId}`);
      
      // 获取题目信息
      const question = await prisma.question.findUnique({
        where: { id: questionId }
      });

      if (!question) {
        return { success: false, error: '题目不存在' };
      }

      onProgress?.(20);

      // 计算内容哈希
      const contentHash = this.calculateContentHash(question);
      
      // 检查是否已存在且内容未变化
      const existingAudio = await prisma.questionAudio.findUnique({
        where: { questionId }
      });

      if (existingAudio && existingAudio.contentHash === contentHash && existingAudio.status === 'ready') {
        console.log(`✅ 题目 ${questionId} 语音文件已存在且内容未变化`);
        onProgress?.(100);
        return {
          success: true,
          audioId: existingAudio.id,
          filePath: existingAudio.filePath,
          fileUrl: existingAudio.fileUrl,
          duration: existingAudio.duration || 0
        };
      }

      onProgress?.(30);

      // 生成TTS文本
      const ttsText = this.generateTTSText(question);
      
      // 创建题目专用目录
      const questionDir = path.join(this.audioDir, questionId);
      await fs.mkdir(questionDir, { recursive: true });

      const filename = `question_audio.mp3`;
      const filePath = path.join(questionDir, filename);
      const fileUrl = `/api/audio/questions/${questionId}/${filename}`;

      onProgress?.(40);

      // 更新或创建数据库记录 
      const audioData = {
        filename,
        filePath,
        fileUrl,
        format: 'mp3',
        voiceSettings: voiceSettings ? (voiceSettings as any) : Prisma.DbNull,
        contentHash,
        status: 'generating',
        error: null,
        generatedAt: null,
        // 重置TTS相关字段
        ttsTaskId: null,
        ttsProvider: this.baiduTTSService ? 'baidu' : null,
        ttsTaskStatus: null,
        ttsTaskCreatedAt: null,
        ttsSpeechUrl: null,
        ttsAttempts: 0
      };

      let audioRecord;
      if (existingAudio) {
        audioRecord = await prisma.questionAudio.update({
          where: { questionId },
          data: audioData
        });
      } else {
        audioRecord = await prisma.questionAudio.create({
          data: {
            ...audioData,
            questionId
          }
        });
      }

      onProgress?.(50);

      try {
        // 生成音频文件，使用增强的进度回调
        const audioBuffer = await this.generateAudioBufferWithProgress(
          ttsText, 
          voiceSettings,
          (ttsProgress) => onProgress?.(50 + ttsProgress * 0.4), // 50-90%
          questionId // 传递questionId用于任务ID记录
        );
        
        onProgress?.(90);

        // 保存音频文件
        await fs.writeFile(filePath, audioBuffer);
        
        // 获取文件信息
        const stats = await fs.stat(filePath);
        const duration = await this.getAudioDuration(filePath);

        onProgress?.(95);

        // 更新记录状态
        await prisma.questionAudio.update({
          where: { id: audioRecord.id },
          data: {
            status: 'ready',
            fileSize: stats.size,
            duration,
            generatedAt: new Date()
          }
        });

        onProgress?.(100);

        console.log(`✅ 题目 ${questionId} 语音文件生成完成`);
        
        return {
          success: true,
          audioId: audioRecord.id,
          filePath,
          fileUrl,
          duration
        };

      } catch (audioError) {
        // 更新错误状态
        await prisma.questionAudio.update({
          where: { id: audioRecord.id },
          data: {
            status: 'error',
            error: audioError instanceof Error ? audioError.message : String(audioError)
          }
        });

        throw audioError;
      }

    } catch (error) {
      console.error(`❌ 生成题目 ${questionId} 语音失败:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * 生成音频缓冲区 (支持进度回调)
   */
  private async generateAudioBufferWithProgress(
    text: string, 
    voiceSettings?: VoiceSettings,
    onProgress?: (progress: number) => void,
    questionId?: string
  ): Promise<Buffer> {
    if (this.baiduTTSService) {
      return await this.generateAudioWithBaiduTTSProgress(text, voiceSettings, onProgress, questionId);
    } else {
      return await this.generateMockAudioWithProgress(text, voiceSettings, onProgress);
    }
  }

  /**
   * 使用百度TTS生成音频 (支持进度回调和任务ID记录)
   */
  private async generateAudioWithBaiduTTSProgress(
    text: string, 
    voiceSettings?: VoiceSettings,
    onProgress?: (progress: number) => void,
    questionId?: string // 新增参数用于记录任务ID
  ): Promise<Buffer> {
    let taskId: string | null = null;
    
    try {
      console.log(`🎵 使用百度TTS生成语音: "${text.slice(0, 50)}..." (${voiceSettings?.voice || 'default'})`);
      
      onProgress?.(5); // 开始任务配置
      
      // 更新百度TTS配置
      if (voiceSettings) {
        const baiduConfig = {
          voice: this.mapVoiceSettingsToBaiduVoice(voiceSettings.voice),
          speed: Math.round((voiceSettings.rate || 1) * 5),
          pitch: Math.round((voiceSettings.pitch || 1) * 5),
          volume: Math.round((voiceSettings.volume || 1) * 5),
        };
        this.baiduTTSService?.updateConfig(baiduConfig);
      }

      onProgress?.(10); // 配置完成

      // 创建百度TTS任务
      taskId = await this.baiduTTSService?.createTask([text]) || null;
      console.log(`🆔 百度TTS任务创建成功: ${taskId}`);

      // 如果有questionId，记录任务ID到数据库
      if (questionId && taskId) {
        await prisma.questionAudio.updateMany({
          where: { questionId },
          data: {
            ttsTaskId: taskId,
            ttsTaskStatus: 'Running',
            ttsTaskCreatedAt: new Date()
          }
        });

        // 增加重试次数需要单独处理
        await prisma.questionAudio.updateMany({
          where: { questionId },
          data: {
            ttsAttempts: {
              increment: 1
            }
          }
        });
      }

      onProgress?.(20); // 任务创建完成

      // 等待任务完成
      if (!taskId) {
        throw new Error('百度TTS任务创建失败');
      }
      
      onProgress?.(30); // 开始等待任务完成
      
      const taskInfo = await this.baiduTTSService?.waitForTaskCompletion(taskId, 60, 5000, (progress) => {
        // 任务完成进度：30% - 80%
        const adjustedProgress = 30 + (progress * 0.5);
        onProgress?.(Math.round(adjustedProgress));
      });
      
      if (!taskInfo?.task_result?.speech_url) {
        throw new Error('百度TTS任务完成但未返回音频URL');
      }

      onProgress?.(80); // 任务完成，准备下载

      // 更新数据库任务状态
      if (questionId) {
        await prisma.questionAudio.updateMany({
          where: { questionId },
          data: {
            ttsTaskStatus: taskInfo?.task_status || 'Unknown',
            ttsSpeechUrl: taskInfo?.task_result?.speech_url || null
          }
        });
      }

      // 创建临时文件路径
      const tempFileName = `temp_audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const tempFilePath = path.join(this.tempDir, tempFileName);

      onProgress?.(85); // 开始下载

      try {
        // 下载音频文件
        await this.baiduTTSService?.downloadAudio(taskInfo?.task_result?.speech_url!, tempFilePath);

        onProgress?.(95); // 下载完成

        // 读取生成的音频文件
        const audioBuffer = await fs.readFile(tempFilePath);
        
        // 删除临时文件
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          console.warn('清理临时文件失败:', cleanupError);
        }

        onProgress?.(100);

        console.log(`✅ 百度TTS音频生成成功，任务ID: ${taskId}，大小: ${audioBuffer.length} bytes`);
        return audioBuffer;

      } catch (downloadError) {
        // 清理可能的临时文件
        try {
          await fs.unlink(tempFilePath);
        } catch {}
        throw downloadError;
      }

    } catch (error) {
      console.error(`❌ 百度TTS生成音频失败 (任务ID: ${taskId}):`, error);

      // 更新数据库错误状态
      if (questionId && taskId) {
        await prisma.questionAudio.updateMany({
          where: { questionId },
          data: {
            ttsTaskStatus: 'Failure',
            error: error instanceof Error ? error.message : String(error)
          }
        });
      }

      // 回退到模拟实现
      console.log('🔄 回退到模拟音频生成...');
      return await this.generateMockAudioWithProgress(text, voiceSettings, onProgress);
    }
  }

  /**
   * 生成模拟音频 (支持进度回调)
   */
  private async generateMockAudioWithProgress(
    text: string, 
    voiceSettings?: VoiceSettings,
    onProgress?: (progress: number) => void
  ): Promise<Buffer> {
    console.log(`🎵 生成模拟语音: "${text.slice(0, 50)}..." (${voiceSettings?.voice || 'default'})`);
    
    onProgress?.(30);
    
    // 模拟音频生成延迟和进度
    for (let i = 30; i <= 90; i += 20) {
      await new Promise(resolve => setTimeout(resolve, 200));
      onProgress?.(i);
    }
    
    // 生成一个更像MP3文件头的模拟数据
    const mp3Header = Buffer.from([
      0xFF, 0xFB, 0x90, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);
    
    const textData = Buffer.from(`MOCK_AUDIO_DATA_FOR_${Date.now()}_${text.slice(0, 20)}`);
    const mockAudioData = Buffer.concat([mp3Header, textData]);
    
    onProgress?.(100);
    
    console.log(`⚠️ 使用模拟音频数据，大小: ${mockAudioData.length} bytes`);
    return mockAudioData;
  }

  /**
   * 获取题目语音文件信息
   */
  async getAudioInfo(questionId: string) {
    return await prisma.questionAudio.findUnique({
      where: { questionId }
    });
  }

  /**
   * 获取语音文件物理路径
   */
  async getAudioFilePath(questionId: string, filename: string): Promise<string | null> {
    const audioRecord = await prisma.questionAudio.findUnique({
      where: { questionId }
    });

    if (!audioRecord || audioRecord.filename !== filename) {
      return null;
    }

    const filePath = path.join(this.audioDir, questionId, filename);
    
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  /**
   * 清理孤立的语音文件
   */
  async cleanupOrphanedAudio(): Promise<{ cleaned: number; errors: string[]; }> {
    const result = { cleaned: 0, errors: [] as string[] };
    
    try {
      // 获取所有语音记录
      const audioRecords = await prisma.questionAudio.findMany({
        include: { question: true }
      });

      for (const audioRecord of audioRecords) {
        if (!audioRecord.question) {
          // 题目已被删除，清理语音文件
          console.log(`🧹 清理孤立语音文件: ${audioRecord.questionId}`);
          
          const success = await this.deleteAudioFile(audioRecord.questionId);
          if (success) {
            result.cleaned++;
          } else {
            result.errors.push(`清理 ${audioRecord.questionId} 失败`);
          }
        }
      }

      console.log(`✅ 清理完成，已清理 ${result.cleaned} 个孤立语音文件`);
      return result;

    } catch (error) {
      console.error('清理孤立语音文件失败:', error);
      result.errors.push(error instanceof Error ? error.message : String(error));
      return result;
    }
  }

  /**
   * 单题目语音生成 (使用新的TTS任务管理器)
   */
  async generateSingleQuestionAudio(
    questionId: string,
    voiceSettings?: VoiceSettings,
    onProgress?: (progress: number, status: string) => void
  ): Promise<AudioGenerationResult> {
    try {
      console.log(`🎙️ 使用新TTS管理器生成单题目语音: ${questionId}`);
      
      onProgress?.(10, '初始化...');

      // 获取题目信息
      const question = await prisma.question.findUnique({
        where: { id: questionId }
      });

      if (!question) {
        return { success: false, error: '题目不存在' };
      }

      onProgress?.(20, '检查题目内容...');

      // 计算内容哈希，检查是否需要重新生成
      const contentHash = this.calculateContentHash(question);
      const existingAudio = await prisma.questionAudio.findUnique({
        where: { questionId }
      });

      if (existingAudio && existingAudio.contentHash === contentHash && existingAudio.status === 'ready') {
        console.log(`✅ 题目 ${questionId} 语音文件已存在且内容未变化`);
        onProgress?.(100, '使用现有音频文件');
        return {
          success: true,
          audioId: existingAudio.id,
          filePath: existingAudio.filePath,
          fileUrl: existingAudio.fileUrl,
          duration: existingAudio.duration || 0
        };
      }

      onProgress?.(30, '准备TTS任务...');

      // 生成TTS文本（暂时注释，批量处理器会自己处理）
      // const ttsText = this.generateTTSText(question);
      
      // 创建题目专用目录
      const questionDir = path.join(this.audioDir, questionId);
      await fs.mkdir(questionDir, { recursive: true });

      const filename = 'question_audio.mp3';
      const filePath = path.join(questionDir, filename);
      const fileUrl = `/api/audio/questions/${questionId}/${filename}`;

      // 创建或更新数据库记录
      const audioData = {
        filename,
        filePath,
        fileUrl,
        format: 'mp3',
        voiceSettings: voiceSettings ? (voiceSettings as any) : Prisma.DbNull,
        contentHash,
        status: 'generating',
        error: null,
        generatedAt: null,
        ttsTaskId: null,
        ttsProvider: this.batchProcessor ? 'baidu' : 'mock',
        ttsTaskStatus: null,
        ttsTaskCreatedAt: null,
        ttsSpeechUrl: null,
        ttsAttempts: 0
      };

      let audioRecord;
      if (existingAudio) {
        audioRecord = await prisma.questionAudio.update({
          where: { questionId },
          data: audioData
        });
      } else {
        audioRecord = await prisma.questionAudio.create({
          data: {
            ...audioData,
            questionId
          }
        });
      }

      onProgress?.(40, '生成语音文件...');

      try {
        // 使用批量处理器的单题目模式
        const singleQuestionResult = await this.batchProcessor.processBatchAudio(
          'single_' + questionId, // 使用特殊的paperId来标识单题目处理
          voiceSettings,
          (current, total, qId) => {
            if (qId === questionId) {
              const progress = 40 + (current / total) * 50; // 40%-90%
              onProgress?.(progress, `生成中... (${current}/${total})`);
            }
          }
        );

        if (singleQuestionResult.success > 0) {
          onProgress?.(95, '更新数据库...');

          // 获取文件信息
          const stats = await fs.stat(filePath);
          const duration = await this.getAudioDuration(filePath);

          // 更新记录状态
          await prisma.questionAudio.update({
            where: { id: audioRecord.id },
            data: {
              status: 'ready',
              fileSize: stats.size,
              duration,
              generatedAt: new Date()
            }
          });

          onProgress?.(100, '生成完成');

          console.log(`✅ 单题目 ${questionId} 语音文件生成完成`);
          
          return {
            success: true,
            audioId: audioRecord.id,
            filePath,
            fileUrl,
            duration
          };
        } else {
          throw new Error(`批量处理器生成失败: ${singleQuestionResult.errors.join(', ')}`);
        }

      } catch (audioError) {
        // 更新错误状态
        await prisma.questionAudio.update({
          where: { id: audioRecord.id },
          data: {
            status: 'error',
            error: audioError instanceof Error ? audioError.message : String(audioError)
          }
        });

        throw audioError;
      }

    } catch (error) {
      console.error(`❌ 生成单题目 ${questionId} 语音失败:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * 验证试卷权限
   */
  async getPaperWithPermissionCheck(paperId: string, teacherId: string) {
    return await prisma.paper.findFirst({
      where: {
        id: paperId,
        teacherId
      }
    });
  }

  /**
   * 获取试卷音频状态聚合数据
   */
  async getPaperAudioStatusAggregated(paperId: string) {
    // 获取试卷所有题目
    const questions = await prisma.question.findMany({
      where: { paperId },
      orderBy: { questionOrder: 'asc' }
    });

    const questionStatus = [];
    const summary = {
      total: questions.length,
      ready: 0,
      generating: 0,
      error: 0,
      none: 0,
      needUpdate: 0
    };

    for (const question of questions) {
      // 获取题目对应的音频记录
      const audio = await prisma.questionAudio.findUnique({
        where: { questionId: question.id }
      });
      let audioStatus = 'none';
      let audioUrl = null;
      let audioAccessible = false;
      let duration = null;

      if (audio) {
        audioStatus = audio.status || 'none';
        duration = audio.duration;
        
        // 检查文件是否存在
        if (audioStatus === 'ready' && audio.filename) {
          const filePath = path.join(this.audioDir, question.id, audio.filename);
          try {
            await fs.access(filePath);
            audioAccessible = true;
            audioUrl = `/api/audio/questions/${question.id}/${audio.filename}`;
          } catch {
            audioAccessible = false;
            audioStatus = 'error'; // 文件丢失，状态改为错误
          }
        }
      }

      // 检查是否需要更新
      const needsUpdate = await this.updateAudioIfNeeded(question.id);

      questionStatus.push({
        id: question.id,
        title: question.title,
        questionOrder: question.questionOrder,
        audioStatus,
        audioUrl,
        audioAccessible,
        duration,
        needsUpdate: needsUpdate.needsUpdate
      });

      // 统计汇总
      switch (audioStatus) {
        case 'ready':
          summary.ready++;
          break;
        case 'generating':
          summary.generating++;
          break;
        case 'error':
          summary.error++;
          break;
        default:
          summary.none++;
      }

      if (needsUpdate.needsUpdate) {
        summary.needUpdate++;
      }
    }

    return {
      paperId,
      questions: questionStatus,
      summary: {
        ...summary,
        completionRate: summary.total > 0 ? Math.round((summary.ready / summary.total) * 100) : 0
      }
    };
  }
}

// 单例导出
export const audioFileService = new AudioFileService();