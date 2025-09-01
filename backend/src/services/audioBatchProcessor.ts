import { BaiduTTSTaskManager, createBaiduTTSTaskManager, TaskStatusSummary } from './baiduTTSTaskManager';
import { AudioFileDownloader } from './audioFileDownloader';
import { TTSProgressController } from './ttsProgressController';
import path from 'path';
import crypto from 'crypto';
import prisma from '../utils/database';

/**
 * 批量处理结果
 */
export interface BatchProcessingResult {
  success: number;
  failed: number;
  errors: string[];
  totalTime: number;
  batchId: string;
}

/**
 * 语音设置
 */
export interface VoiceSettings {
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
}

/**
 * 题目信息
 */
interface Question {
  id: string;
  title: string;
  options: any;
  question_type?: string;
  questionType: string;
  questionOrder: number;
}

/**
 * 音频批量处理器
 * 使用新的TTS任务管理器实现批量音频生成
 */
export class AudioBatchProcessor {
  private readonly uploadDir: string;
  private readonly audioDir: string;
  private ttsTaskManager: BaiduTTSTaskManager | null = null;
  private downloader: AudioFileDownloader;
  
  // 静态初始化控制
  private static isInitialized = false;

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.audioDir = path.join(this.uploadDir, 'audio', 'questions');
    this.downloader = new AudioFileDownloader();
    
    this.initializeTTSServiceOnce();
  }
  
  /**
   * 确保TTS服务只初始化一次
   */
  private initializeTTSServiceOnce(): void {
    if (AudioBatchProcessor.isInitialized) {
      return;
    }
    
    this.initializeTTSService();
    AudioBatchProcessor.isInitialized = true;
  }

  /**
   * 初始化百度TTS服务
   */
  private initializeTTSService(): void {
    try {
      const token = process.env.BAIDU_TTS_TOKEN;
      if (token) {
        this.ttsTaskManager = createBaiduTTSTaskManager(token, {
          format: 'mp3-16k',
          voice: 4105, 
          lang: 'zh',
          speed: 5,
          pitch: 5,
          volume: 5
        });
        console.log('✅ 百度TTS任务管理器初始化成功');
      } else {
        console.warn('⚠️ 未配置百度TTS Token，将使用模拟音频生成');
      }
    } catch (error) {
      console.error('❌ 百度TTS任务管理器初始化失败:', error);
      this.ttsTaskManager = null;
    }
  }

  /**
   * 批量生成试卷语音文件 (新的重构版本)
   */
  async processBatchAudio(
    paperId: string,
    voiceSettings?: VoiceSettings,
    onProgress?: (current: number, total: number, questionId: string) => void
  ): Promise<BatchProcessingResult> {
    const batchId = this.generateBatchId();
    const progressController = new TTSProgressController(paperId);
    
    try {
      console.log(`📋 开始批量音频处理: ${paperId} (批次ID: ${batchId})`);

      // 获取试卷所有题目
      const questions = await prisma.question.findMany({
        where: { paperId },
        orderBy: { questionOrder: 'asc' }
      });

      if (questions.length === 0) {
        const error = '试卷没有题目';
        progressController.error(error);
        return { success: 0, failed: 0, errors: [error], totalTime: 0, batchId };
      }

      // 开始处理流程
      progressController.start(questions.length);

      // 更新TTS配置
      if (voiceSettings && this.ttsTaskManager) {
        this.updateTTSConfig(voiceSettings);
      }

      // 阶段1: 预处理 - 检查需要生成的题目
      const questionsToProcess = await this.filterQuestionsNeedingAudio(questions, batchId);
      console.log(`📝 需要处理的题目: ${questionsToProcess.length}/${questions.length}`);

      if (questionsToProcess.length === 0) {
        progressController.complete({
          successCount: questions.length,
          failedCount: 0,
          totalTime: 0
        });
        return { success: questions.length, failed: 0, errors: [], totalTime: 0, batchId };
      }

      // 阶段2: 批量创建TTS任务
      const { taskMap, taskTexts } = await this.createBatchTasks(
        questionsToProcess,
        progressController,
        onProgress
      );

      if (taskMap.size === 0) {
        const error = '所有TTS任务创建失败';
        progressController.error(error);
        return { success: 0, failed: questions.length, errors: [error], totalTime: 0, batchId };
      }

      // 阶段3: 等待任务完成
      const finalSummary = await this.waitForTasksCompletion(
        Array.from(taskMap.values()),
        progressController
      );

      // 阶段4: 下载成功的音频文件
      const downloadResults = await this.downloadSuccessfulTasks(
        finalSummary,
        taskMap,
        taskTexts,
        questionsToProcess,
        progressController
      );

      // 阶段5: 更新数据库状态
      const finalResults = await this.updateDatabaseStatus(
        questionsToProcess,
        downloadResults,
        progressController
      );

      // 完成处理
      progressController.complete(finalResults);

      console.log(`📊 批量音频处理完成: 成功${finalResults.successCount}, 失败${finalResults.failedCount}`);
      return {
        success: finalResults.successCount,
        failed: finalResults.failedCount,
        errors: finalResults.errors || [],
        totalTime: finalResults.totalTime,
        batchId
      };

    } catch (error: any) {
      console.error(`❌ 批量音频处理失败 (${paperId}):`, error);
      progressController.error(error.message);
      
      return {
        success: 0,
        failed: 0,
        errors: [error.message],
        totalTime: 0,
        batchId
      };
    }
  }

  /**
   * 过滤需要生成音频的题目
   */
  private async filterQuestionsNeedingAudio(
    questions: Question[],
    batchId: string
  ): Promise<Question[]> {
    const questionsNeedingAudio: Question[] = [];

    for (const question of questions) {
      const contentHash = this.calculateContentHash(question);
      
      // 检查是否已存在且内容未变化
      const existingAudio = await prisma.questionAudio.findUnique({
        where: { questionId: question.id }
      });

      const needsGeneration = !existingAudio || 
                            existingAudio.contentHash !== contentHash || 
                            existingAudio.status !== 'ready';

      if (needsGeneration) {
        questionsNeedingAudio.push(question);
        
        // 预先创建或更新数据库记录
        await this.prepareAudioRecord(question, contentHash, batchId);
      }
    }

    return questionsNeedingAudio;
  }

  /**
   * 批量创建TTS任务
   */
  private async createBatchTasks(
    questions: Question[],
    progressController: TTSProgressController,
    onProgress?: (current: number, total: number, questionId: string) => void
  ): Promise<{
    taskMap: Map<string, string>; // questionId -> taskId
    taskTexts: Map<string, string>; // taskId -> ttsText
  }> {
    const taskMap = new Map<string, string>();
    const taskTexts = new Map<string, string>();

    if (!this.ttsTaskManager) {
      // 使用模拟任务ID
      questions.forEach((question, index) => {
        const mockTaskId = `mock_task_${Date.now()}_${index}`;
        taskMap.set(question.id, mockTaskId);
        taskTexts.set(mockTaskId, this.generateTTSText(question));
        progressController.updateTaskCreation(index + 1, questions.length, question.title);
        onProgress?.(index + 1, questions.length, question.id);
      });
      return { taskMap, taskTexts };
    }

    // 准备所有TTS文本
    const ttsTexts = questions.map(q => this.generateTTSText(q));

    // 批量创建任务
    const createdTaskMap = await this.ttsTaskManager.createBatchTasks(
      ttsTexts,
      (completed, total, currentText) => {
        progressController.updateTaskCreation(completed, total, currentText);
        
        // 找到对应的题目ID
        const questionIndex = ttsTexts.findIndex(text => text === currentText);
        if (questionIndex >= 0 && questions[questionIndex]) {
          onProgress?.(completed, total, questions[questionIndex].id);
        }
      }
    );

    // 建立 questionId -> taskId 和 taskId -> ttsText 的映射
    questions.forEach((question, index) => {
      const ttsText = ttsTexts[index];
      const taskId = createdTaskMap.get(ttsText);
      
      if (taskId) {
        taskMap.set(question.id, taskId);
        taskTexts.set(taskId, ttsText);
        
        // 更新数据库中的任务ID
        this.updateQuestionTaskId(question.id, taskId);
      }
    });

    console.log(`✅ 批量任务创建完成: 成功${taskMap.size}个任务`);
    return { taskMap, taskTexts };
  }

  /**
   * 等待所有任务完成
   */
  private async waitForTasksCompletion(
    taskIds: string[],
    progressController: TTSProgressController
  ): Promise<TaskStatusSummary> {
    if (!this.ttsTaskManager) {
      // 模拟等待过程
      for (let i = 0; i <= 100; i += 20) {
        const mockSummary: TaskStatusSummary = {
          total: taskIds.length,
          running: Math.max(0, taskIds.length - Math.floor(i / 20)),
          success: Math.min(taskIds.length, Math.floor(i / 20)),
          failure: 0,
          successTasks: [],
          failureTasks: [],
          runningTasks: [],
          progressPercentage: i
        };
        progressController.updateTaskWaiting(mockSummary);
        await this.sleep(1000);
      }
      
      // 返回模拟的成功结果
      return {
        total: taskIds.length,
        running: 0,
        success: taskIds.length,
        failure: 0,
        successTasks: taskIds.map(id => ({
          task_id: id,
          task_status: 'Success' as const,
          task_result: {
            speech_url: `https://mock.bcebos.com/mock_${id}.mp3`
          }
        })),
        failureTasks: [],
        runningTasks: [],
        progressPercentage: 100
      };
    }

    return await this.ttsTaskManager.waitForAllTasksCompletion(taskIds, {
      maxAttempts: 120,
      intervalMs: 5000,
      onProgress: (summary) => {
        progressController.updateTaskWaiting(summary);
      }
    });
  }

  /**
   * 下载成功的任务
   */
  private async downloadSuccessfulTasks(
    summary: TaskStatusSummary,
    taskMap: Map<string, string>, // questionId -> taskId
    _taskTexts: Map<string, string>, // taskId -> ttsText (reserved for future use)
    questions: Question[],
    progressController: TTSProgressController
  ): Promise<Map<string, any>> {
    const downloadResults = new Map();

    if (summary.successTasks.length === 0) {
      progressController.updateDownloading(0, 0);
      return downloadResults;
    }

    // 获取下载URL映射
    const downloadUrls = this.ttsTaskManager?.getDownloadUrls(summary.successTasks) || new Map();
    console.log(`📥 获取到${downloadUrls.size}个下载URL`);
    
    // 打印所有下载URL（用于调试）
    downloadUrls.forEach((url, taskId) => {
      console.log(`🔗 任务${taskId}: ${url.substring(0, 100)}...`);
    });
    
    // 准备下载任务
    const downloadTasks = [];
    const taskIdToQuestionId = new Map<string, string>();

    for (const [questionId, taskId] of taskMap) {
      if (downloadUrls.has(taskId)) {
        const question = questions.find(q => q.id === questionId);
        if (question) {
          const questionDir = path.join(this.audioDir, questionId);
          const outputPath = path.join(questionDir, 'question_audio.mp3');
          
          downloadTasks.push({
            speechUrl: downloadUrls.get(taskId)!,
            outputPath,
            taskId
          });
          
          taskIdToQuestionId.set(taskId, questionId);
        }
      }
    }

    // 批量下载
    const results = await this.downloader.batchDownload(
      downloadTasks,
      (completed, total, currentTaskId) => {
        const questionId = taskIdToQuestionId.get(currentTaskId);
        progressController.updateDownloading(completed, total, questionId);
      },
      {
        maxRetries: 3,
        timeoutMs: 60000,
        validateMp3: true,
        estimateDuration: true
      }
    );

    // 转换结果映射 taskId -> result 为 questionId -> result
    for (const [taskId, result] of results) {
      const questionId = taskIdToQuestionId.get(taskId);
      if (questionId) {
        downloadResults.set(questionId, result);
      }
    }

    return downloadResults;
  }

  /**
   * 更新数据库状态
   */
  private async updateDatabaseStatus(
    questions: Question[],
    downloadResults: Map<string, any>,
    progressController: TTSProgressController
  ): Promise<{
    successCount: number;
    failedCount: number;
    totalTime: number;
    errors: string[];
  }> {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    
    progressController.updateFinalizing(0, '更新数据库状态...');

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const downloadResult = downloadResults.get(question.id);
      
      try {
        if (downloadResult?.success) {
          // 更新为成功状态
          await prisma.questionAudio.updateMany({
            where: { questionId: question.id },
            data: {
              status: 'ready',
              fileSize: downloadResult.fileSize,
              duration: downloadResult.duration,
              generatedAt: new Date(),
              error: null
            }
          });
          successCount++;
        } else {
          // 更新为失败状态
          await prisma.questionAudio.updateMany({
            where: { questionId: question.id },
            data: {
              status: 'error',
              error: downloadResult?.error || '生成失败'
            }
          });
          failedCount++;
          errors.push(`${question.title}: ${downloadResult?.error || '生成失败'}`);
        }
        
        // 更新进度
        const progress = Math.round(((i + 1) / questions.length) * 100);
        progressController.updateFinalizing(progress, `更新数据库状态... (${i + 1}/${questions.length})`);
        
      } catch (error: any) {
        failedCount++;
        errors.push(`${question.title}: 数据库更新失败 - ${error.message}`);
      }
    }

    return {
      successCount,
      failedCount,
      totalTime: Date.now(),
      errors
    };
  }

  /**
   * 生成TTS文本
   */
  private generateTTSText(question: Question | any): string {
    let ttsText = question.title;
    
    const questionType = question.question_type || question.questionType;
    if (questionType === 'single_choice' || questionType === 'multiple_choice') {
      if (question.options && typeof question.options === 'object') {
        ttsText += '。选项有：';
        const optionEntries = Object.entries(question.options);
        optionEntries.forEach(([key, value]) => {
          const optionText = typeof value === 'string' ? value : 
            (typeof value === 'object' && value && 'text' in value) ? String(value.text) : String(value);
          ttsText += `${key}、${optionText}`;
          if (optionEntries.indexOf([key, value]) < optionEntries.length - 1) {
            ttsText += '。';
          }
        });
      }
    }
    
    return ttsText;
  }

  /**
   * 计算题目内容哈希
   */
  private calculateContentHash(question: Question | any): string {
    const questionType = question.question_type || question.questionType;
    const content = `${question.title}|${JSON.stringify(question.options)}|${questionType}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 准备音频记录
   */
  private async prepareAudioRecord(question: Question, contentHash: string, _batchId: string): Promise<void> {
    const questionDir = path.join(this.audioDir, question.id);
    const filename = 'question_audio.mp3';
    const filePath = path.join(questionDir, filename);
    const fileUrl = `/api/audio/questions/${question.id}/${filename}`;

    const audioData = {
      filename,
      filePath,
      fileUrl,
      format: 'mp3',
      contentHash,
      status: 'generating',
      error: null,
      generatedAt: null,
      ttsTaskId: null,
      ttsProvider: this.ttsTaskManager ? 'baidu' : 'mock',
      ttsTaskStatus: null,
      ttsTaskCreatedAt: null,
      ttsSpeechUrl: null,
      ttsAttempts: 0
    };

    await prisma.questionAudio.upsert({
      where: { questionId: question.id },
      update: audioData,
      create: {
        ...audioData,
        questionId: question.id
      }
    });
  }

  /**
   * 更新题目的任务ID
   */
  private async updateQuestionTaskId(questionId: string, taskId: string): Promise<void> {
    await prisma.questionAudio.updateMany({
      where: { questionId },
      data: {
        ttsTaskId: taskId,
        ttsTaskStatus: 'Running',
        ttsTaskCreatedAt: new Date()
      }
    });
  }

  /**
   * 更新TTS配置
   */
  private updateTTSConfig(voiceSettings: VoiceSettings): void {
    if (!this.ttsTaskManager) return;

    const baiduConfig = {
      voice: this.mapVoiceSettingsToBaiduVoice(voiceSettings.voice),
      speed: Math.round((voiceSettings.rate || 1) * 5),
      pitch: Math.round((voiceSettings.pitch || 1) * 5),
      volume: Math.round((voiceSettings.volume || 1) * 5),
    };

    this.ttsTaskManager.updateConfig(baiduConfig);
  }

  /**
   * 映射语音设置到百度TTS发音人
   */
  private mapVoiceSettingsToBaiduVoice(voice?: string): number {
    const voiceMap: Record<string, number> = {
      'female': 0,
      'male': 1,
      'child': 4,
      'default': 0,
    };
    return voiceMap[voice || 'default'] || 0;
  }

  /**
   * 生成批次ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 工具方法：延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}