import { audioProgressService } from './audioProgressService';

import type { TaskStatusSummary } from './baiduTTSTaskManager';

/**
 * TTS处理阶段
 */
export type TTSProcessingStage = 
  | 'initializing'    // 初始化
  | 'creating_tasks'  // 创建任务
  | 'waiting_completion' // 等待完成
  | 'downloading'     // 下载文件
  | 'finalizing'      // 完成处理
  | 'completed'       // 全部完成
  | 'error';          // 发生错误

/**
 * 进度信息
 */
export interface TTSProgressInfo {
  stage: TTSProcessingStage;
  stageProgress: number; // 当前阶段的进度 (0-100)
  overallProgress: number; // 总体进度 (0-100)
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  failedTasks: number;
  currentTask?: string;
  estimatedTimeRemaining?: number; // 预估剩余时间（秒）
  message?: string;
}

/**
 * 阶段权重配置
 */
interface StageWeights {
  creating_tasks: number;
  waiting_completion: number;
  downloading: number;
  finalizing: number;
}

/**
 * TTS进度控制器
 * 统一管理TTS处理过程中的进度跟踪和WebSocket推送
 */
export class TTSProgressController {
  private paperId: string;
  private startTime: number = 0;
  private totalTasks: number = 0;
  private currentStage: TTSProcessingStage = 'initializing';
  
  // 各阶段权重（总和应为100）
  private stageWeights: StageWeights = {
    creating_tasks: 10,    // 创建任务 10%
    waiting_completion: 70, // 等待完成 70%
    downloading: 15,       // 下载文件 15%
    finalizing: 5          // 完成处理 5%
  };

  // 阶段进度缓存
  private stageProgress: Record<keyof StageWeights, number> = {
    creating_tasks: 0,
    waiting_completion: 0,
    downloading: 0,
    finalizing: 0
  };

  constructor(paperId: string) {
    this.paperId = paperId;
  }

  /**
   * 开始处理流程
   */
  start(totalTasks: number): void {
    this.startTime = Date.now();
    this.totalTasks = totalTasks;
    this.currentStage = 'creating_tasks';
    
    console.log(`🎯 开始TTS处理流程: ${this.paperId}, 总任务数: ${totalTasks}`);
    
    this.sendProgress({
      stage: 'initializing',
      stageProgress: 0,
      overallProgress: 0,
      totalTasks,
      completedTasks: 0,
      runningTasks: 0,
      failedTasks: 0,
      message: '初始化TTS处理流程...'
    });
  }

  /**
   * 更新任务创建进度
   */
  updateTaskCreation(completed: number, total: number, currentTask?: string): void {
    this.currentStage = 'creating_tasks';
    const stageProgress = Math.round((completed / total) * 100);
    this.stageProgress.creating_tasks = stageProgress;
    
    const overallProgress = this.calculateOverallProgress();
    
    this.sendProgress({
      stage: 'creating_tasks',
      stageProgress,
      overallProgress,
      totalTasks: this.totalTasks,
      completedTasks: 0,
      runningTasks: 0,
      failedTasks: 0,
      currentTask: currentTask || '',
      message: `创建TTS任务中... (${completed}/${total})`
    });
  }

  /**
   * 更新任务等待进度
   */
  updateTaskWaiting(summary: TaskStatusSummary): void {
    this.currentStage = 'waiting_completion';
    
    // 任务创建阶段已完成
    this.stageProgress.creating_tasks = 100;
    
    // 计算等待阶段进度
    const completedTasks = summary.success + summary.failure;
    const stageProgress = summary.total > 0 ? 
      Math.round((completedTasks / summary.total) * 100) : 0;
    this.stageProgress.waiting_completion = stageProgress;
    
    const overallProgress = this.calculateOverallProgress();
    const estimatedTime = this.estimateRemainingTime(summary);
    
    this.sendProgress({
      stage: 'waiting_completion',
      stageProgress,
      overallProgress,
      totalTasks: summary.total,
      completedTasks: summary.success,
      runningTasks: summary.running,
      failedTasks: summary.failure,
      estimatedTimeRemaining: estimatedTime || 0,
      message: `等待语音合成完成... 运行中: ${summary.running}, 已完成: ${completedTasks}`
    });
  }

  /**
   * 更新文件下载进度
   */
  updateDownloading(completed: number, total: number, currentTask?: string): void {
    this.currentStage = 'downloading';
    
    // 前面阶段已完成
    this.stageProgress.creating_tasks = 100;
    this.stageProgress.waiting_completion = 100;
    
    const stageProgress = total > 0 ? Math.round((completed / total) * 100) : 0;
    this.stageProgress.downloading = stageProgress;
    
    const overallProgress = this.calculateOverallProgress();
    
    this.sendProgress({
      stage: 'downloading',
      stageProgress,
      overallProgress,
      totalTasks: this.totalTasks,
      completedTasks: completed,
      runningTasks: Math.max(0, total - completed),
      failedTasks: 0,
      currentTask: currentTask || '',
      message: `下载音频文件中... (${completed}/${total})`
    });
  }

  /**
   * 更新最终处理进度
   */
  updateFinalizing(progress: number, message?: string): void {
    this.currentStage = 'finalizing';
    
    // 前面阶段已完成
    this.stageProgress.creating_tasks = 100;
    this.stageProgress.waiting_completion = 100;
    this.stageProgress.downloading = 100;
    this.stageProgress.finalizing = Math.min(100, Math.max(0, progress));
    
    const overallProgress = this.calculateOverallProgress();
    
    this.sendProgress({
      stage: 'finalizing',
      stageProgress: this.stageProgress.finalizing,
      overallProgress,
      totalTasks: this.totalTasks,
      completedTasks: this.totalTasks,
      runningTasks: 0,
      failedTasks: 0,
      message: message || '完成最终处理...'
    });
  }

  /**
   * 处理完成
   */
  complete(results: {
    successCount: number;
    failedCount: number;
    totalTime: number;
    errors?: string[];
  }): void {
    this.currentStage = 'completed';
    
    // 所有阶段完成
    Object.keys(this.stageProgress).forEach(stage => {
      this.stageProgress[stage as keyof StageWeights] = 100;
    });
    
    const totalTime = Date.now() - this.startTime;
    
    console.log(`🎉 TTS处理完成: ${this.paperId}, 耗时: ${totalTime}ms`);
    
    // 发送完成消息
    audioProgressService.sendBatchCompleted(this.paperId, {
      success: results.successCount,
      failed: results.failedCount,
      errors: results.errors || [],
      totalTime: results.totalTime
    });
    
    // 发送最终进度状态
    this.sendProgress({
      stage: 'completed',
      stageProgress: 100,
      overallProgress: 100,
      totalTasks: this.totalTasks,
      completedTasks: results.successCount,
      runningTasks: 0,
      failedTasks: results.failedCount,
      message: `处理完成! 成功: ${results.successCount}, 失败: ${results.failedCount}, 耗时: ${Math.round(totalTime/1000)}秒`
    });
  }

  /**
   * 处理错误
   */
  error(errorMessage: string, details?: any): void {
    this.currentStage = 'error';
    
    console.error(`❌ TTS处理错误: ${this.paperId}, 错误: ${errorMessage}`);
    
    audioProgressService.sendError(this.paperId, errorMessage, details);
    
    this.sendProgress({
      stage: 'error',
      stageProgress: 0,
      overallProgress: 0,
      totalTasks: this.totalTasks,
      completedTasks: 0,
      runningTasks: 0,
      failedTasks: this.totalTasks,
      message: `处理失败: ${errorMessage}`
    });
  }

  /**
   * 发送单个题目进度
   */
  sendQuestionProgress(
    questionId: string,
    questionTitle: string,
    status: 'start' | 'progress' | 'completed' | 'error',
    progress?: number,
    error?: string
  ): void {
    audioProgressService.sendQuestionProgress(
      this.paperId,
      questionId,
      questionTitle,
      status,
      progress,
      error
    );
  }

  /**
   * 计算总体进度
   */
  private calculateOverallProgress(): number {
    let totalProgress = 0;
    
    // 按权重计算各阶段贡献的进度
    totalProgress += (this.stageProgress.creating_tasks / 100) * this.stageWeights.creating_tasks;
    totalProgress += (this.stageProgress.waiting_completion / 100) * this.stageWeights.waiting_completion;
    totalProgress += (this.stageProgress.downloading / 100) * this.stageWeights.downloading;
    totalProgress += (this.stageProgress.finalizing / 100) * this.stageWeights.finalizing;
    
    return Math.min(100, Math.max(0, Math.round(totalProgress)));
  }

  /**
   * 估算剩余时间
   */
  private estimateRemainingTime(summary: TaskStatusSummary): number | undefined {
    if (summary.total === 0 || summary.running === 0) {
      return undefined;
    }
    
    const elapsedTime = Date.now() - this.startTime;
    const completedTasks = summary.success + summary.failure;
    
    if (completedTasks === 0) {
      return undefined;
    }
    
    // 基于已完成任务的平均时间估算
    const averageTimePerTask = elapsedTime / completedTasks;
    const estimatedTimeForRemaining = averageTimePerTask * summary.running;
    
    // 转换为秒，并添加一些缓冲时间
    return Math.ceil((estimatedTimeForRemaining * 1.2) / 1000);
  }

  /**
   * 发送进度更新
   */
  private sendProgress(progressInfo: TTSProgressInfo): void {
    // 发送详细的批量状态更新
    audioProgressService.sendBatchStatusUpdate(this.paperId, {
      stage: progressInfo.stage,
      stageProgress: progressInfo.stageProgress,
      overallProgress: progressInfo.overallProgress,
      totalTasks: progressInfo.totalTasks,
      completedTasks: progressInfo.completedTasks,
      runningTasks: progressInfo.runningTasks,
      failedTasks: progressInfo.failedTasks,
      estimatedTimeRemaining: progressInfo.estimatedTimeRemaining || 0,
      message: progressInfo.message || ''
    });

    // 发送传统的批量进度消息（向后兼容）
    audioProgressService.sendBatchProgress(
      this.paperId,
      progressInfo.completedTasks,
      progressInfo.totalTasks,
      progressInfo.currentTask || '',
      progressInfo.message || ''
    );

    // 发送阶段更新消息
    audioProgressService.sendStageUpdate(
      this.paperId,
      progressInfo.stage,
      progressInfo.stageProgress,
      progressInfo.message,
      {
        overallProgress: progressInfo.overallProgress,
        totalTasks: progressInfo.totalTasks,
        completedTasks: progressInfo.completedTasks,
        runningTasks: progressInfo.runningTasks,
        failedTasks: progressInfo.failedTasks,
      }
    );
    
    // 详细的进度日志
    console.log(`📊 TTS进度 [${this.paperId}]: 阶段=${progressInfo.stage}, 总体进度=${progressInfo.overallProgress}%, 阶段进度=${progressInfo.stageProgress}%`);
  }

  /**
   * 获取当前进度信息
   */
  getCurrentProgress(): TTSProgressInfo {
    return {
      stage: this.currentStage,
      stageProgress: this.getCurrentStageProgress(),
      overallProgress: this.calculateOverallProgress(),
      totalTasks: this.totalTasks,
      completedTasks: 0, // 需要外部更新
      runningTasks: 0,   // 需要外部更新
      failedTasks: 0     // 需要外部更新
    };
  }

  /**
   * 获取当前阶段进度
   */
  private getCurrentStageProgress(): number {
    switch (this.currentStage) {
      case 'creating_tasks':
        return this.stageProgress.creating_tasks;
      case 'waiting_completion':
        return this.stageProgress.waiting_completion;
      case 'downloading':
        return this.stageProgress.downloading;
      case 'finalizing':
        return this.stageProgress.finalizing;
      default:
        return 0;
    }
  }

  /**
   * 更新阶段权重配置
   */
  updateStageWeights(newWeights: Partial<StageWeights>): void {
    this.stageWeights = { ...this.stageWeights, ...newWeights };
    
    // 确保总权重为100
    const totalWeight = Object.values(this.stageWeights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 100) > 0.1) {
      console.warn(`⚠️ 阶段权重总和不等于100: ${totalWeight}`);
    }
  }

  /**
   * 获取处理统计信息
   */
  getStatistics(): {
    totalTime: number;
    averageTimePerTask: number;
    currentStage: TTSProcessingStage;
    efficiency: number; // 效率指标
  } {
    const totalTime = Date.now() - this.startTime;
    const averageTimePerTask = this.totalTasks > 0 ? totalTime / this.totalTasks : 0;
    const efficiency = this.calculateOverallProgress() / Math.max(1, totalTime / 1000); // 进度/秒
    
    return {
      totalTime,
      averageTimePerTask,
      currentStage: this.currentStage,
      efficiency
    };
  }
}
