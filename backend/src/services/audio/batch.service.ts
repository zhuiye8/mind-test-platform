/**
 * 音频批量服务
 * 负责批量生成试卷语音文件
 */

import { Prisma } from '@prisma/client';
import prisma from '../../utils/database';
import { audioProgressService } from '../audioProgressService';
import { AudioCoreService } from './core.service';
import { AudioGeneratorService } from './generator.service';
import { BatchAudioResult, VoiceSettings } from './types';

export class AudioBatchService extends AudioCoreService {
  private generator: AudioGeneratorService;

  constructor() {
    super();
    this.generator = new AudioGeneratorService();
  }

  /**
   * 批量生成试卷语音文件 (使用新的批量处理器)
   */
  async batchGenerateAudio(
    paperId: string, 
    voiceSettings?: VoiceSettings,
    onProgress?: (current: number, total: number, questionId: string) => void
  ): Promise<BatchAudioResult> {
    try {
      console.log(`📋 使用新的批量处理器生成试卷 ${paperId} 的语音文件`);
      
      // 委托给新的批量处理器
      const result = await this.processor.processBatchAudio(
        paperId,
        voiceSettings,
        onProgress
      );

      console.log(`📊 新批量处理器完成: 成功 ${result.success}, 失败 ${result.failed}, 批次ID: ${result.batchId}`);
      
      return {
        success: result.success,
        failed: result.failed,
        errors: result.errors,
        totalTime: result.totalTime,
        batchId: result.batchId
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
  ): Promise<BatchAudioResult> {
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
          const result = await this.generator.generateAudioForQuestionWithProgress(
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
   * 单题目语音生成 (使用新的TTS任务管理器)
   */
  async generateSingleQuestionAudio(
    questionId: string,
    voiceSettings?: VoiceSettings,
    onProgress?: (progress: number, status: string) => void
  ): Promise<import('./types').AudioGenerationResult> {
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

      // 创建题目专用目录
      const questionDir = path.join(this.audioDirectory, questionId);
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
        ttsProvider: this.processor ? 'baidu' : 'mock',
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
        const singleQuestionResult = await this.processor.processBatchAudio(
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
}

// 需要导入fs和path
import fs from 'fs/promises';
import path from 'path';