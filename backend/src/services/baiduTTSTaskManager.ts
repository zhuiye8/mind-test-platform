import axios from 'axios';

/**
 * 百度TTS配置接口
 */
export interface BaiduTTSConfig {
  bearerToken: string;
  format?: 'mp3-16k' | 'mp3-48k' | 'wav' | 'pcm-16k' | 'pcm-8k';
  voice?: number; // 发音人选择，0-511
  lang?: 'zh' | 'en'; // 语言
  speed?: number; // 语速，0-15，默认为5中语速
  pitch?: number; // 音调，0-15，默认为5中语调
  volume?: number; // 音量，0-9，默认为5中音量
  enableSubtitle?: number; // 是否生成字幕，0或1
}

/**
 * 百度TTS任务信息
 */
export interface BaiduTaskInfo {
  task_id: string;
  task_status: 'Running' | 'Success' | 'Failure';
  task_result?: {
    speech_url?: string;
    err_no?: number;
    err_msg?: string;
    sn?: string;
  };
}

/**
 * 百度TTS创建任务响应
 */
export interface BaiduCreateTaskResponse {
  log_id: number;
  task_id: string;
  task_status: string;
  error_code?: number;
  error_msg?: string;
}

/**
 * 百度TTS查询任务响应
 */
export interface BaiduQueryTaskResponse {
  log_id: number;
  tasks_info: BaiduTaskInfo[];
}

/**
 * 任务状态摘要
 */
export interface TaskStatusSummary {
  total: number;
  running: number;
  success: number;
  failure: number;
  successTasks: BaiduTaskInfo[];
  failureTasks: BaiduTaskInfo[];
  runningTasks: BaiduTaskInfo[];
  progressPercentage: number;
}

/**
 * 百度TTS任务管理器
 * 负责百度TTS任务的创建、状态查询和批量管理
 */
export class BaiduTTSTaskManager {
  private config: BaiduTTSConfig;
  private readonly createUrl = 'https://aip.baidubce.com/rpc/2.0/tts/v1/create';
  private readonly queryUrl = 'https://aip.baidubce.com/rpc/2.0/tts/v1/query';

  constructor(config: BaiduTTSConfig) {
    this.config = {
      format: 'mp3-16k',
      voice: 0,
      lang: 'zh',
      speed: 5,
      pitch: 5,
      volume: 5,
      enableSubtitle: 0,
      ...config
    };
  }

  /**
   * 更新TTS配置
   */
  updateConfig(newConfig: Partial<BaiduTTSConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 创建单个TTS任务
   * @param text 要转换的文本
   * @returns 任务ID
   */
  async createSingleTask(text: string): Promise<string> {
    try {
      console.log(`🎵 创建百度TTS任务: "${text.slice(0, 50)}..."`);

      const requestBody = {
        text: [text], // 注意：百度TTS接受文本数组
        format: this.config.format,
        voice: this.config.voice,
        lang: this.config.lang,
        speed: this.config.speed,
        pitch: this.config.pitch,
        volume: this.config.volume,
        enable_subtitle: this.config.enableSubtitle
      };

      const response = await axios.post<BaiduCreateTaskResponse>(
        this.createUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.bearerToken}`
          },
          timeout: 30000
        }
      );

      if (response.data.error_code) {
        console.error('百度TTS错误详情:', {
          error_code: response.data.error_code,
          error_msg: response.data.error_msg,
          request_body: requestBody,
          voice_parameter: this.config.voice,
          bearer_token: this.config.bearerToken ? '***已配置***' : '未配置'
        });
        throw new Error(`百度TTS创建任务失败 (${response.data.error_code}): ${response.data.error_msg}`);
      }

      console.log(`✅ 百度TTS任务创建成功: ${response.data.task_id}, 状态: ${response.data.task_status}`);
      return response.data.task_id;

    } catch (error: any) {
      console.error('创建百度TTS任务失败:', error);
      if (error.response?.data) {
        throw new Error(`百度TTS API错误: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`百度TTS网络错误: ${error.message}`);
    }
  }

  /**
   * 批量创建TTS任务
   * @param texts 文本数组，每个文本对应一个任务
   * @returns Map<text, taskId> 文本到任务ID的映射
   */
  async createBatchTasks(
    texts: string[],
    onProgress?: (completed: number, total: number, currentText: string) => void
  ): Promise<Map<string, string>> {
    const taskMap = new Map<string, string>();
    const errors: string[] = [];

    console.log(`📋 开始批量创建${texts.length}个百度TTS任务`);

    // 并发创建任务，但限制并发数避免API限流
    const concurrency = 5; // 同时最多5个请求
    const batches: string[][] = [];
    
    for (let i = 0; i < texts.length; i += concurrency) {
      batches.push(texts.slice(i, i + concurrency));
    }

    let completedCount = 0;

    for (const batch of batches) {
      const batchPromises = batch.map(async (text) => {
        try {
          const taskId = await this.createSingleTask(text);
          taskMap.set(text, taskId);
          completedCount++;
          
          // 进度回调
          onProgress?.(completedCount, texts.length, text.slice(0, 30));
          
          return { success: true, text, taskId };
        } catch (error: any) {
          completedCount++;
          const errorMsg = `文本 "${text.slice(0, 30)}...": ${error.message}`;
          errors.push(errorMsg);
          
          // 即使失败也要报告进度
          onProgress?.(completedCount, texts.length, text.slice(0, 30));
          
          return { success: false, text, error: errorMsg };
        }
      });

      // 等待当前批次完成
      await Promise.allSettled(batchPromises);
      
      // 批次间添加小延迟，避免API限流
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.sleep(500);
      }
    }

    if (errors.length > 0) {
      console.warn(`⚠️ 批量创建完成，但有${errors.length}个任务失败:`, errors);
    }

    console.log(`✅ 批量任务创建完成: 成功${taskMap.size}个，失败${errors.length}个`);
    
    return taskMap;
  }

  /**
   * 批量查询任务状态
   * @param taskIds 任务ID数组
   * @returns 任务状态摘要
   */
  async queryBatchTaskStatus(taskIds: string[]): Promise<TaskStatusSummary> {
    if (taskIds.length === 0) {
      return {
        total: 0,
        running: 0,
        success: 0,
        failure: 0,
        successTasks: [],
        failureTasks: [],
        runningTasks: [],
        progressPercentage: 0
      };
    }

    try {
      console.log(`📊 批量查询${taskIds.length}个百度TTS任务状态`);

      const requestBody = {
        task_ids: taskIds
      };

      const response = await axios.post<BaiduQueryTaskResponse>(
        this.queryUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.bearerToken}`
          },
          timeout: 30000
        }
      );

      const tasksInfo = response.data.tasks_info || [];
      
      // 统计各状态的任务
      const summary: TaskStatusSummary = {
        total: taskIds.length,
        running: 0,
        success: 0,
        failure: 0,
        successTasks: [],
        failureTasks: [],
        runningTasks: [],
        progressPercentage: 0
      };

      tasksInfo.forEach(task => {
        const status = (task.task_status || '').toString().toLowerCase();
        switch (status) {
          case 'running':
          case 'processing':
            summary.running++;
            summary.runningTasks.push(task);
            break;
          case 'success':
            summary.success++;
            summary.successTasks.push(task);
            break;
          case 'failure':
          case 'failed':
            summary.failure++;
            summary.failureTasks.push(task);
            break;
          default:
            console.warn(`⚠️ 未识别的百度TTS任务状态: ${task.task_status}`);
            summary.running++;
            summary.runningTasks.push(task);
            break;
        }
      });

      // 计算进度百分比
      const completedTasks = summary.success + summary.failure;
      summary.progressPercentage = summary.total > 0 ? 
        Math.round((completedTasks / summary.total) * 100) : 0;

      console.log(`📈 任务状态统计: 总计${summary.total}, 运行中${summary.running}, 成功${summary.success}, 失败${summary.failure}, 进度${summary.progressPercentage}%`);

      return summary;

    } catch (error: any) {
      console.error('批量查询百度TTS任务状态失败:', error);
      if (error.response?.data) {
        throw new Error(`百度TTS查询API错误: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`百度TTS查询网络错误: ${error.message}`);
    }
  }

  /**
   * 等待所有任务完成
   * @param taskIds 任务ID数组
   * @param options 轮询配置
   * @returns 最终的任务状态摘要
   */
  async waitForAllTasksCompletion(
    taskIds: string[],
    options: {
      maxAttempts?: number;
      intervalMs?: number;
      onProgress?: (summary: TaskStatusSummary) => void;
    } = {}
  ): Promise<TaskStatusSummary> {
    const {
      maxAttempts = 120, // 默认最多轮询120次（10分钟）
      intervalMs = 5000,  // 默认5秒间隔
      onProgress
    } = options;

    console.log(`⏳ 开始等待${taskIds.length}个任务完成，最多轮询${maxAttempts}次`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const summary = await this.queryBatchTaskStatus(taskIds);
        
        // 发送进度更新
        onProgress?.(summary);

        // 检查是否所有任务都完成了（成功或失败）
        const allCompleted = summary.running === 0;
        
        if (allCompleted) {
          console.log(`🎉 所有任务已完成 (尝试${attempt}/${maxAttempts}): 成功${summary.success}个，失败${summary.failure}个`);
          return summary;
        }

        console.log(`⏳ 轮询${attempt}/${maxAttempts}: 还有${summary.running}个任务运行中，${intervalMs/1000}秒后重试`);
        
        if (attempt < maxAttempts) {
          await this.sleep(intervalMs);
        }

      } catch (error: any) {
        console.warn(`⚠️ 第${attempt}次轮询失败:`, error.message);
        
        if (attempt === maxAttempts) {
          throw error;
        }
        
        // 查询失败时等待更长时间再重试
        await this.sleep(intervalMs * 2);
      }
    }

    throw new Error(`任务等待超时: 在${maxAttempts * intervalMs / 1000}秒内未完成所有任务`);
  }

  /**
   * 获取成功任务的下载信息
   * @param successTasks 成功的任务数组
   * @returns Map<taskId, speechUrl> 任务ID到下载URL的映射
   */
  getDownloadUrls(successTasks: BaiduTaskInfo[]): Map<string, string> {
    const downloadMap = new Map<string, string>();
    
    successTasks.forEach(task => {
      const urls: string[] = [];

      const result = task.task_result as any;
      if (result) {
        if (typeof result.speech_url === 'string') {
          urls.push(result.speech_url);
        }
        if (Array.isArray(result.speech_urls)) {
          result.speech_urls.filter((url: unknown) => typeof url === 'string').forEach((url: string) => urls.push(url));
        }
        if (Array.isArray(result.speech_list)) {
          result.speech_list.filter((segment: any) => typeof segment?.speech_url === 'string').forEach((segment: any) => urls.push(segment.speech_url));
        }
        if (Array.isArray(result.speech_segment)) {
          result.speech_segment.filter((segment: any) => typeof segment?.speech_url === 'string').forEach((segment: any) => urls.push(segment.speech_url));
        }
      }

      const firstUrl = urls.find(url => !!url);

      if (firstUrl) {
        downloadMap.set(task.task_id, firstUrl);
      } else {
        const raw = JSON.stringify(task.task_result || {});
        const preview = raw.length > 200 ? `${raw.slice(0, 200)}...` : raw;
        console.warn(`⚠️ 成功任务${task.task_id}缺少speech_url，原始task_result: ${preview}`);
      }
    });

    console.log(`📥 获取到${downloadMap.size}个下载URL`);
    return downloadMap;
  }

  /**
   * 验证配置是否有效
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.bearerToken) {
      errors.push('bearerToken is required');
    }

    if (this.config.voice !== undefined && (this.config.voice < 0 || this.config.voice > 20101)) {
      errors.push('voice must be between 0 and 20101');
    }

    if (this.config.speed !== undefined && (this.config.speed < 0 || this.config.speed > 15)) {
      errors.push('speed must be between 0 and 15');
    }

    if (this.config.pitch !== undefined && (this.config.pitch < 0 || this.config.pitch > 15)) {
      errors.push('pitch must be between 0 and 15');
    }

    if (this.config.volume !== undefined && (this.config.volume < 0 || this.config.volume > 9)) {
      errors.push('volume must be between 0 and 9');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): BaiduTTSConfig {
    return { ...this.config };
  }

  /**
   * 工具方法：延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建百度TTS任务管理器实例
 */
export function createBaiduTTSTaskManager(bearerToken: string, config?: Partial<BaiduTTSConfig>): BaiduTTSTaskManager {
  const fullConfig: BaiduTTSConfig = {
    bearerToken,
    ...config
  };

  const manager = new BaiduTTSTaskManager(fullConfig);
  
  // 验证配置
  const validation = manager.validateConfig();
  if (!validation.isValid) {
    throw new Error(`百度TTS配置无效: ${validation.errors.join(', ')}`);
  }

  return manager;
}
