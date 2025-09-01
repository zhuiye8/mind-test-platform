/**

 * 音频生成服务
 * 负责单个题目的语音文件生成
 */

import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../../utils/database';
import { AudioCoreService } from './core.service';
import { AudioGenerationResult, VoiceSettings } from './types';

export class AudioGeneratorService extends AudioCoreService {
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
      const questionDir = path.join(this.audioDirectory, questionId);
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
   * 为单个题目生成语音文件 (支持进度回调)
   */
  async generateAudioForQuestionWithProgress(
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
      const questionDir = path.join(this.audioDirectory, questionId);
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
        ttsProvider: this.ttsService ? 'baidu' : null,
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
   * 生成音频缓冲区 (使用百度TTS)
   */
  private async generateAudioBuffer(text: string, voiceSettings?: VoiceSettings): Promise<Buffer> {
    if (this.ttsService) {
      return await this.generateAudioWithBaiduTTS(text, voiceSettings);
    } else {
      throw new Error('百度TTS服务未配置，无法生成音频文件');
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
        this.ttsService?.updateConfig(baiduConfig);
      }

      // 创建临时文件路径
      const tempFileName = `temp_audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`;
      const tempFilePath = path.join(this.tempDirectory, tempFileName);

      try {
        // 使用百度TTS生成音频文件
        await this.ttsService?.textToSpeech([text], tempFilePath);

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
      throw error;
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
    if (this.ttsService) {
      return await this.generateAudioWithBaiduTTSProgress(text, voiceSettings, onProgress, questionId);
    } else {
      throw new Error('百度TTS服务未配置，无法生成音频文件');
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
        this.ttsService?.updateConfig(baiduConfig);
      }

      onProgress?.(10); // 配置完成

      // 创建百度TTS任务
      taskId = await this.ttsService?.createTask([text]) || null;
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
      
      const taskInfo = await this.ttsService?.waitForTaskCompletion(taskId, 60, 5000, (progress) => {
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
      const tempFilePath = path.join(this.tempDirectory, tempFileName);

      onProgress?.(85); // 开始下载

      try {
        // 下载音频文件
        await this.ttsService?.downloadAudio(taskInfo?.task_result?.speech_url!, tempFilePath);

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

      // 不再回退到模拟实现
      throw error;
    }
  }

}