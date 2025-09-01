/**

 * 音频服务统一导出文件
 * 整合所有音频相关服务，提供完整的AudioFileService兼容接口
 */

import { AudioCoreService } from './core.service';
import { AudioGeneratorService } from './generator.service';
import { AudioBatchService } from './batch.service';
import { AudioManagementService } from './management.service';
import { VoiceSettings, AudioGenerationResult, BatchAudioResult, PaperAudioStatus, CleanupResult } from './types';

// 导出类型
export * from './types';

/**
 * 完整的音频文件服务类
 * 整合所有分离的服务模块，保持原有接口兼容性
 */
export class AudioFileService extends AudioCoreService {
  private generator: AudioGeneratorService;
  private batchService: AudioBatchService;
  private managementService: AudioManagementService;

  constructor() {
    super();
    this.generator = new AudioGeneratorService();
    this.batchService = new AudioBatchService();
    this.managementService = new AudioManagementService();
  }

  // ==================== 单个题目音频生成 ====================
  
  /**
   * 为单个题目生成语音文件
   */
  async generateAudioForQuestion(
    questionId: string, 
    voiceSettings?: VoiceSettings
  ): Promise<AudioGenerationResult> {
    return this.generator.generateAudioForQuestion(questionId, voiceSettings);
  }

  /**
   * 单题目语音生成 (使用新的TTS任务管理器)
   */
  async generateSingleQuestionAudio(
    questionId: string,
    voiceSettings?: VoiceSettings,
    onProgress?: (progress: number, status: string) => void
  ): Promise<AudioGenerationResult> {
    return this.batchService.generateSingleQuestionAudio(questionId, voiceSettings, onProgress);
  }

  // ==================== 批量音频生成 ====================

  /**
   * 批量生成试卷语音文件 (使用新的批量处理器)
   */
  async batchGenerateAudio(
    paperId: string, 
    voiceSettings?: VoiceSettings,
    onProgress?: (current: number, total: number, questionId: string) => void
  ): Promise<BatchAudioResult> {
    return this.batchService.batchGenerateAudio(paperId, voiceSettings, onProgress);
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
    return this.batchService.batchGenerateAudioLegacy(paperId, voiceSettings, onProgress);
  }

  // ==================== 音频文件管理 ====================

  /**
   * 删除题目语音文件
   */
  async deleteAudioFile(questionId: string): Promise<boolean> {
    return this.managementService.deleteAudioFile(questionId);
  }

  /**
   * 检查并更新语音文件 (当题目内容改变时)
   */
  async updateAudioIfNeeded(questionId: string): Promise<{ needsUpdate: boolean; currentHash?: string; }> {
    return this.managementService.updateAudioIfNeeded(questionId);
  }

  /**
   * 获取题目语音文件信息
   */
  async getAudioInfo(questionId: string) {
    return this.managementService.getAudioInfo(questionId);
  }

  /**
   * 获取语音文件物理路径
   */
  async getAudioFilePath(questionId: string, filename: string): Promise<string | null> {
    return this.managementService.getAudioFilePath(questionId, filename);
  }

  /**
   * 清理孤立的语音文件
   */
  async cleanupOrphanedAudio(): Promise<CleanupResult> {
    return this.managementService.cleanupOrphanedAudio();
  }

  /**
   * 验证试卷权限
   */
  async getPaperWithPermissionCheck(paperId: string, teacherId: string) {
    return this.managementService.getPaperWithPermissionCheck(paperId, teacherId);
  }

  /**
   * 获取试卷音频状态聚合数据
   */
  async getPaperAudioStatusAggregated(paperId: string): Promise<PaperAudioStatus> {
    return this.managementService.getPaperAudioStatusAggregated(paperId);
  }

  /**
   * 批量检查题目音频状态
   */
  async batchCheckAudioStatus(questionIds: string[]): Promise<Record<string, any>> {
    return this.managementService.batchCheckAudioStatus(questionIds);
  }

  /**
   * 获取音频文件统计信息
   */
  async getAudioStats() {
    return this.managementService.getAudioStats();
  }
}

// 单例导出
export const audioFileService = new AudioFileService();