/**

 * 音频管理服务
 * 负责音频文件的管理、删除、更新检查和状态查询
 */

import fs from 'fs/promises';
import path from 'path';
import prisma from '../../utils/database';
import { AudioCoreService } from './core.service';
import { CleanupResult, PaperAudioStatus, QuestionAudioStatus } from './types';

export class AudioManagementService extends AudioCoreService {
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
      const questionDir = path.join(this.audioDirectory, questionId);
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

    const filePath = path.join(this.audioDirectory, questionId, filename);
    
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
  async cleanupOrphanedAudio(): Promise<CleanupResult> {
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
  async getPaperAudioStatusAggregated(paperId: string): Promise<PaperAudioStatus> {
    // 获取试卷所有题目
    const questions = await prisma.question.findMany({
      where: { paperId },
      orderBy: { questionOrder: 'asc' }
    });

    const questionStatus: QuestionAudioStatus[] = [];
    const summary = {
      total: questions.length,
      ready: 0,
      generating: 0,
      error: 0,
      none: 0,
      needUpdate: 0,
      completionRate: 0
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
          const filePath = path.join(this.audioDirectory, question.id, audio.filename);
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

    summary.completionRate = summary.total > 0 ? Math.round((summary.ready / summary.total) * 100) : 0;

    return {
      paperId,
      questions: questionStatus,
      summary
    };
  }

  /**
   * 批量检查题目音频状态
   */
  async batchCheckAudioStatus(questionIds: string[]): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    for (const questionId of questionIds) {
      const audio = await prisma.questionAudio.findUnique({
        where: { questionId }
      });

      if (audio) {
        let fileExists = false;
        if (audio.filename) {
          const filePath = path.join(this.audioDirectory, questionId, audio.filename);
          try {
            await fs.access(filePath);
            fileExists = true;
          } catch {}
        }

        results[questionId] = {
          exists: true,
          status: audio.status,
          fileExists,
          duration: audio.duration,
          fileUrl: fileExists ? `/api/audio/questions/${questionId}/${audio.filename}` : null,
          generatedAt: audio.generatedAt,
          error: audio.error
        };
      } else {
        results[questionId] = {
          exists: false,
          status: 'none',
          fileExists: false,
          duration: null,
          fileUrl: null,
          generatedAt: null,
          error: null
        };
      }
    }

    return results;
  }

  /**
   * 获取音频文件统计信息
   */
  async getAudioStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    readyFiles: number;
    errorFiles: number;
    generatingFiles: number;
    orphanedFiles: number;
  }> {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      readyFiles: 0,
      errorFiles: 0,
      generatingFiles: 0,
      orphanedFiles: 0
    };

    try {
      const audioRecords = await prisma.questionAudio.findMany({
        include: { question: true }
      });

      stats.totalFiles = audioRecords.length;

      for (const audio of audioRecords) {
        if (audio.fileSize) {
          stats.totalSize += audio.fileSize;
        }

        switch (audio.status) {
          case 'ready':
            stats.readyFiles++;
            break;
          case 'error':
            stats.errorFiles++;
            break;
          case 'generating':
            stats.generatingFiles++;
            break;
        }

        if (!audio.question) {
          stats.orphanedFiles++;
        }
      }

      return stats;
    } catch (error) {
      console.error('获取音频统计失败:', error);
      return stats;
    }
  }
}