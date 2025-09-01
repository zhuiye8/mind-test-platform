import axios from 'axios';
import fs from 'fs';
import path from 'path';

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

export interface BaiduCreateTaskResponse {
  log_id: number;
  task_id: string;
  task_status: string;
  error_code?: number;
  error_msg?: string;
}

export interface BaiduQueryTaskResponse {
  log_id: number;
  tasks_info: BaiduTaskInfo[];
}

export class BaiduTTSService {
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
      ...config,
    };
  }

  /**
   * 创建TTS任务
   * @param textArray 要转换的文本数组
   * @returns 任务ID
   */
  async createTask(textArray: string[]): Promise<string> {
    try {
      const requestData = {
        text: textArray,
        format: this.config.format,
        voice: this.config.voice,
        lang: this.config.lang,
        speed: this.config.speed,
        pitch: this.config.pitch,
        volume: this.config.volume,
        enable_subtitle: this.config.enableSubtitle,
      };

      const response = await axios({
        method: 'POST',
        url: this.createUrl,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.config.bearerToken}`,
        },
        data: requestData,
      });

      const result: BaiduCreateTaskResponse = response.data;

      if (result.error_code) {
        throw new Error(`百度TTS创建任务失败: ${result.error_msg} (错误码: ${result.error_code})`);
      }

      if (!result.task_id) {
        throw new Error('百度TTS创建任务失败: 未返回任务ID');
      }

      console.log(`✅ 百度TTS任务创建成功，任务ID: ${result.task_id}`);
      return result.task_id;

    } catch (error: any) {
      console.error('百度TTS创建任务失败:', error);
      if (error.response?.data) {
        const errorData = error.response.data;
        throw new Error(`百度TTS API错误: ${errorData.error_msg || errorData.message || '未知错误'}`);
      }
      throw error;
    }
  }

  /**
   * 查询TTS任务状态
   * @param taskIds 任务ID数组
   * @returns 任务信息数组
   */
  async queryTasks(taskIds: string[]): Promise<BaiduTaskInfo[]> {
    try {
      const response = await axios({
        method: 'POST',
        url: this.queryUrl,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.config.bearerToken}`,
        },
        data: {
          task_ids: taskIds,
        },
      });

      const result: BaiduQueryTaskResponse = response.data;

      if (!result.tasks_info || !Array.isArray(result.tasks_info)) {
        throw new Error('百度TTS查询任务失败: 响应格式错误');
      }

      return result.tasks_info;

    } catch (error: any) {
      console.error('百度TTS查询任务失败:', error);
      if (error.response?.data) {
        const errorData = error.response.data;
        throw new Error(`百度TTS API错误: ${errorData.error_msg || errorData.message || '未知错误'}`);
      }
      throw error;
    }
  }

  /**
   * 等待任务完成（轮询，优化进度跟踪）
   * @param taskId 任务ID
   * @param maxAttempts 最大轮询次数，默认60次（5分钟）
   * @param intervalMs 轮询间隔，默认5秒
   * @param onProgress 进度回调
   * @returns 完成的任务信息
   */
  async waitForTaskCompletion(
    taskId: string,
    maxAttempts: number = 60,
    intervalMs: number = 5000,
    onProgress?: (progress: number, status?: string) => void
  ): Promise<BaiduTaskInfo> {
    const startTime = Date.now();
    let lastProgressUpdate = 0;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const tasksInfo = await this.queryTasks([taskId]);
        const taskInfo = tasksInfo.find(task => task.task_id === taskId);

        if (!taskInfo) {
          throw new Error(`未找到任务ID: ${taskId}`);
        }

        const elapsedTime = Date.now() - startTime;
        const estimatedTotal = maxAttempts * intervalMs;
        
        // 根据状态和时间计算更精确的进度
        let progress = 0;
        let statusMessage = '';
        
        switch (taskInfo.task_status) {
          case 'Running':
            // 运行状态：基于时间的线性进度，但不超过85%
            progress = Math.min(85, Math.max(30, (elapsedTime / estimatedTotal) * 100));
            statusMessage = `正在合成中... (${Math.round(elapsedTime / 1000)}秒)`;
            break;
            
          case 'Success':
            progress = 100;
            statusMessage = '合成完成，准备下载';
            break;
            
          case 'Failure':
            progress = 0;
            statusMessage = '合成失败';
            break;
            
          default:
            progress = Math.min(20, (attempt / maxAttempts) * 100);
            statusMessage = `等待处理... (${taskInfo.task_status})`;
        }

        // 避免进度回退和频繁更新
        if (progress > lastProgressUpdate || taskInfo.task_status !== 'Running') {
          onProgress?.(progress, statusMessage);
          lastProgressUpdate = progress;
        }

        console.log(`📊 百度TTS任务 ${taskId} 状态: ${taskInfo.task_status} (${attempt}/${maxAttempts}, 进度: ${Math.round(progress)}%)`);

        if (taskInfo.task_status === 'Success') {
          // 验证返回的URL
          if (!taskInfo.task_result?.speech_url) {
            throw new Error('任务完成但未返回音频URL');
          }
          
          console.log(`✅ 百度TTS任务完成: ${taskId}, 音频URL: ${taskInfo.task_result.speech_url.substring(0, 100)}...`);
          return taskInfo;
        }

        if (taskInfo.task_status === 'Failure') {
          const errorMsg = taskInfo.task_result?.err_msg || '未知错误';
          const errorCode = taskInfo.task_result?.err_no || 'N/A';
          throw new Error(`百度TTS任务失败 (错误码: ${errorCode}): ${errorMsg}`);
        }

        if (taskInfo.task_status === 'Running') {
          if (attempt < maxAttempts) {
            // 动态调整轮询间隔：初期频繁，后期减慢
            const adjustedInterval = attempt < 5 ? intervalMs : Math.min(intervalMs * 2, 15000);
            console.log(`⏳ 百度TTS任务进行中，${adjustedInterval/1000}秒后重试...`);
            await this.sleep(adjustedInterval);
            continue;
          }
        }

      } catch (error: any) {
        if (attempt === maxAttempts) {
          throw error;
        }
        
        console.warn(`⚠️ 百度TTS任务查询失败 (${attempt}/${maxAttempts}):`, error.message);
        onProgress?.(Math.max(lastProgressUpdate - 5, 0), `查询失败，重试中... (${error.message})`);
        
        // 查询失败时增加重试间隔
        const retryInterval = Math.min(intervalMs * 2, 10000);
        await this.sleep(retryInterval);
      }
    }

    throw new Error(`百度TTS任务超时: ${taskId} (超过 ${Math.round(maxAttempts * intervalMs / 1000)} 秒)`);
  }

  /**
   * 下载音频文件（支持重试和URL验证）
   * @param speechUrl 百度TTS返回的音频URL
   * @param outputPath 输出文件路径
   * @param maxRetries 最大重试次数
   * @returns 下载的文件路径
   */
  async downloadAudio(speechUrl: string, outputPath: string, maxRetries: number = 3): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📥 开始下载音频文件 (尝试 ${attempt}/${maxRetries}): ${speechUrl}`);
        
        // 验证URL格式
        if (!this.isValidSpeechUrl(speechUrl)) {
          throw new Error(`无效的音频URL格式: ${speechUrl}`);
        }
        
        // 确保输出目录存在
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // 下载前先清理可能存在的空文件
        if (fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          if (stats.size === 0) {
            fs.unlinkSync(outputPath);
            console.log('🧹 清理了空的旧文件');
          }
        }

        const response = await axios({
          method: 'GET',
          url: speechUrl,
          responseType: 'stream',
          timeout: 60000, // 增加到60秒超时
          maxRedirects: 5, // 允许重定向
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BaiduTTS/1.0)',
            'Accept': 'audio/mpeg, */*',
            'Cache-Control': 'no-cache'
          },
        });

        // 验证响应
        if (response.status !== 200) {
          throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }

        // 验证Content-Type
        const contentType = response.headers['content-type'];
        if (contentType && !contentType.includes('audio')) {
          console.warn(`⚠️ 可疑的Content-Type: ${contentType}, 继续尝试下载...`);
        }

        // 创建写入流
        const writeStream = fs.createWriteStream(outputPath);
        let downloadedBytes = 0;
        
        // 监控下载进度
        response.data.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes % (1024 * 100) === 0) { // 每100KB打印一次
            console.log(`📊 已下载: ${Math.round(downloadedBytes / 1024)}KB`);
          }
        });
        
        // 管道数据
        response.data.pipe(writeStream);

        // 等待下载完成
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            writeStream.destroy();
            reject(new Error('下载超时'));
          }, 60000); // 60秒总超时

          writeStream.on('finish', () => {
            clearTimeout(timeout);
            console.log(`✅ 音频文件下载完成: ${outputPath} (${Math.round(downloadedBytes / 1024)}KB)`);
            resolve();
          });
          
          writeStream.on('error', (error) => {
            clearTimeout(timeout);
            console.error(`❌ 写入文件失败: ${error.message}`);
            reject(error);
          });
          
          response.data.on('error', (error: any) => {
            clearTimeout(timeout);
            console.error(`❌ 网络下载失败: ${error.message}`);
            reject(error);
          });
        });

        // 验证下载的文件
        const validationResult = await this.validateDownloadedFile(outputPath);
        if (!validationResult.isValid) {
          throw new Error(`文件验证失败: ${validationResult.error}`);
        }

        console.log(`✅ 音频文件验证成功: ${outputPath} (${validationResult.fileSize} bytes, 类型: ${validationResult.fileType})`);
        return outputPath;

      } catch (error: any) {
        lastError = error;
        console.error(`❌ 下载尝试 ${attempt}/${maxRetries} 失败:`, error.message);
        
        // 清理失败的文件
        this.cleanupFailedDownload(outputPath);
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 指数退避，最大10秒
          console.log(`⏳ ${retryDelay/1000}秒后重试...`);
          await this.sleep(retryDelay);
        }
      }
    }

    // 所有重试都失败了
    throw new Error(`下载音频文件失败，已重试${maxRetries}次。最后错误: ${lastError?.message}`);
  }

  /**
   * 完整的文本转语音流程
   * @param textArray 文本数组
   * @param outputPath 输出文件路径
   * @param onProgress 进度回调
   * @returns 生成的音频文件路径
   */
  async textToSpeech(
    textArray: string[],
    outputPath: string,
    onProgress?: (status: string, progress: number) => void
  ): Promise<string> {
    try {
      // 步骤1: 创建任务
      onProgress?.('创建TTS任务中...', 10);
      const taskId = await this.createTask(textArray);

      // 步骤2: 等待任务完成
      onProgress?.('等待语音合成完成...', 30);
      const maxAttempts = 60;
      
      const taskInfo = await this.waitForTaskCompletion(
        taskId, 
        maxAttempts, 
        5000,
        (progress, status) => {
          // 将内部进度映射到30%-80%范围
          const mappedProgress = 30 + (progress / 100) * 50;
          onProgress?.(status || '等待语音合成完成...', mappedProgress);
        }
      );

      if (!taskInfo.task_result?.speech_url) {
        throw new Error('百度TTS任务完成但未返回音频URL');
      }

      // 步骤3: 下载音频文件（使用增强的下载逻辑）
      onProgress?.('下载音频文件中...', 80);
      const filePath = await this.downloadAudio(taskInfo.task_result.speech_url, outputPath, 5);

      onProgress?.('音频生成完成', 100);
      return filePath;

    } catch (error) {
      console.error('百度TTS完整流程失败:', error);
      onProgress?.('音频生成失败', 0);
      throw error;
    }
  }

  /**
   * 批量生成音频
   * @param texts 文本数组
   * @param outputDir 输出目录
   * @param fileNamePrefix 文件名前缀
   * @param onProgress 进度回调
   * @returns 生成的文件路径数组
   */
  async batchTextToSpeech(
    texts: string[],
    outputDir: string,
    fileNamePrefix: string = 'audio',
    onProgress?: (current: number, total: number, currentText: string) => void
  ): Promise<string[]> {
    const results: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      try {
        const text = texts[i];
        const fileName = `${fileNamePrefix}_${i + 1}.mp3`;
        const outputPath = path.join(outputDir, fileName);

        onProgress?.(i + 1, texts.length, text.slice(0, 50) + '...');

        const filePath = await this.textToSpeech([text], outputPath);
        results.push(filePath);

      } catch (error: any) {
        const errorMsg = `第${i + 1}个文本生成失败: ${error.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
        results.push(''); // 占位符表示失败
      }
    }

    if (errors.length > 0) {
      console.warn(`批量生成完成，但有 ${errors.length} 个失败:`, errors);
    }

    return results;
  }

  /**
   * 验证音频URL格式
   */
  private isValidSpeechUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      // 百度音频URL通常包含这些域名
      const validDomains = ['bj.bcebos.com', 'bcebos.com', 'baidubce.com'];
      const isValidDomain = validDomains.some(domain => parsedUrl.hostname.includes(domain));
      const hasAudioPath = parsedUrl.pathname.includes('.mp3') || parsedUrl.pathname.includes('speech');
      
      return isValidDomain && hasAudioPath;
    } catch (error) {
      return false;
    }
  }

  /**
   * 验证下载的文件
   */
  private async validateDownloadedFile(filePath: string): Promise<{
    isValid: boolean;
    error?: string;
    fileSize?: number;
    fileType?: string;
  }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { isValid: false, error: '文件不存在' };
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        return { isValid: false, error: '文件为空' };
      }

      // 最小文件大小检查（音频文件通常至少几KB）
      if (stats.size < 1024) {
        return { isValid: false, error: `文件过小: ${stats.size} bytes` };
      }

      // 检查文件头部是否为MP3格式
      const fileHeader = await this.readFileHeader(filePath);
      const isMp3 = this.isMp3File(fileHeader);
      
      if (!isMp3) {
        // 如果不是MP3，检查是否是错误信息的HTML或JSON
        const isTextError = this.isTextErrorFile(fileHeader);
        if (isTextError) {
          return { isValid: false, error: '下载的是错误信息而非音频文件' };
        }
      }

      return {
        isValid: true,
        fileSize: stats.size,
        fileType: isMp3 ? 'MP3' : '未知格式'
      };
    } catch (error: any) {
      return { isValid: false, error: `验证失败: ${error.message}` };
    }
  }

  /**
   * 读取文件头部
   */
  private async readFileHeader(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { start: 0, end: 15 });
      const chunks: Buffer[] = [];
      
      stream.on('data', (chunk: string | Buffer) => {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(bufferChunk);
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * 检查是否为MP3文件
   */
  private isMp3File(header: Buffer): boolean {
    if (header.length < 3) return false;
    
    // MP3文件魔数检查
    // ID3v2: 49 44 33 (ID3)
    // MP3 frame: FF FB, FF FA, FF F3, FF F2等
    const firstBytes = header.slice(0, 3);
    
    // ID3 tag
    if (firstBytes[0] === 0x49 && firstBytes[1] === 0x44 && firstBytes[2] === 0x33) {
      return true;
    }
    
    // MP3 frame sync
    if (firstBytes[0] === 0xFF && (firstBytes[1] & 0xE0) === 0xE0) {
      return true;
    }
    
    return false;
  }

  /**
   * 检查是否为文本错误文件
   */
  private isTextErrorFile(header: Buffer): boolean {
    const text = header.toString('utf8').toLowerCase();
    return text.includes('<html') || text.includes('error') || text.includes('{"');
  }

  /**
   * 清理失败的下载文件
   */
  private cleanupFailedDownload(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🧹 清理失败的下载文件: ${filePath}`);
      }
    } catch (cleanupError) {
      console.warn('清理失败文件时出错:', cleanupError);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  updateConfig(config: Partial<BaiduTTSConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): BaiduTTSConfig {
    return { ...this.config };
  }
}

// 创建默认实例
export const createBaiduTTSService = (bearerToken?: string): BaiduTTSService => {
  const token = bearerToken || process.env.BAIDU_TTS_TOKEN;
  
  if (!token) {
    throw new Error('百度TTS Token未配置，请设置 BAIDU_TTS_TOKEN 环境变量或传入 bearerToken 参数');
  }

  return new BaiduTTSService({
    bearerToken: token,
    format: 'mp3-16k',
    voice: 0,
    lang: 'zh',
    speed: 5,
    pitch: 5,
    volume: 5,
    enableSubtitle: 0,
  });
};