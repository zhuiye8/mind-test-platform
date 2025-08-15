import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';

/**
 * 下载结果
 */
export interface DownloadResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  error?: string;
  duration?: number; // 估算的音频时长
}

/**
 * 下载配置
 */
export interface DownloadOptions {
  maxRetries?: number;
  timeoutMs?: number;
  validateMp3?: boolean;
  estimateDuration?: boolean;
}

/**
 * 音频文件下载器
 * 专门处理从百度TTS speech_url下载MP3文件的逻辑
 */
export class AudioFileDownloader {
  private readonly defaultOptions: Required<DownloadOptions> = {
    maxRetries: 3,
    timeoutMs: 60000, // 60秒超时
    validateMp3: true,
    estimateDuration: true
  };

  /**
   * 从speech_url下载音频文件
   * @param speechUrl 百度TTS返回的音频下载URL
   * @param outputPath 输出文件路径
   * @param options 下载配置
   * @returns 下载结果
   */
  async downloadFromSpeechUrl(
    speechUrl: string,
    outputPath: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const config = { ...this.defaultOptions, ...options };
    let lastError: Error | null = null;

    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    console.log(`📥 开始下载音频文件: ${speechUrl} → ${outputPath}`);

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        console.log(`🔄 下载尝试 ${attempt}/${config.maxRetries}`);

        // 验证URL格式
        if (!this.isValidSpeechUrl(speechUrl)) {
          throw new Error(`无效的speech_url格式: ${speechUrl}`);
        }

        // 检查URL是否可能已过期（403错误特别处理）
        if (attempt > 1) {
          console.log(`🔄 重试下载 (尝试 ${attempt}/${config.maxRetries}): ${speechUrl.slice(0, 100)}...`);
        }

        // 清理可能存在的部分下载文件
        await this.cleanupPartialFile(outputPath);

        // 执行下载
        await this.performDownload(speechUrl, outputPath, config);

        // 验证下载的文件
        const validation = await this.validateDownloadedFile(outputPath, config);
        if (!validation.isValid) {
          throw new Error(`文件验证失败: ${validation.error}`);
        }

        console.log(`✅ 音频文件下载成功: ${outputPath} (${validation.fileSize} bytes)`);

        return {
          success: true,
          filePath: outputPath,
          fileSize: validation.fileSize || 0,
          duration: validation.duration || 0
        };

      } catch (error: any) {
        lastError = error;
        console.error(`❌ 下载尝试 ${attempt}/${config.maxRetries} 失败:`, error.message);

        // 检查是否是403认证错误（URL可能已过期）
        if (error.message.includes('403') || error.message.includes('Forbidden')) {
          console.warn(`🔑 检测到403认证错误，可能是speech_url已过期`);
          // 对于403错误，不需要重试太多次
          if (attempt >= 2) {
            const authError = new Error(`speech_url认证过期或无效: ${speechUrl.slice(0, 100)}...`);
            throw authError;
          }
        }

        // 清理失败的文件
        await this.cleanupPartialFile(outputPath);

        // 如果不是最后一次尝试，等待后重试
        if (attempt < config.maxRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 指数退避
          console.log(`⏳ ${retryDelay / 1000}秒后重试...`);
          await this.sleep(retryDelay);
        }
      }
    }

    // 所有重试都失败了
    const errorMsg = `下载音频文件失败，已重试${config.maxRetries}次。最后错误: ${lastError?.message}`;
    console.error(errorMsg);

    return {
      success: false,
      error: errorMsg
    };
  }

  /**
   * 批量下载音频文件
   * @param downloadTasks 下载任务数组
   * @param onProgress 进度回调
   * @returns 下载结果数组
   */
  async batchDownload(
    downloadTasks: Array<{
      speechUrl: string;
      outputPath: string;
      taskId: string;
    }>,
    onProgress?: (completed: number, total: number, current: string) => void,
    options: DownloadOptions = {}
  ): Promise<Map<string, DownloadResult>> {
    const results = new Map<string, DownloadResult>();
    
    console.log(`📦 开始批量下载${downloadTasks.length}个音频文件`);

    // 限制并发下载数，避免过多网络连接
    const concurrency = 3;
    const batches: typeof downloadTasks[] = [];
    
    for (let i = 0; i < downloadTasks.length; i += concurrency) {
      batches.push(downloadTasks.slice(i, i + concurrency));
    }

    let completedCount = 0;

    for (const batch of batches) {
      const batchPromises = batch.map(async (task) => {
        try {
          onProgress?.(completedCount, downloadTasks.length, task.taskId);
          
          const result = await this.downloadFromSpeechUrl(
            task.speechUrl,
            task.outputPath,
            options
          );
          
          results.set(task.taskId, result);
          completedCount++;
          
          onProgress?.(completedCount, downloadTasks.length, task.taskId);
          
          return { taskId: task.taskId, success: result.success };
          
        } catch (error: any) {
          completedCount++;
          const errorResult: DownloadResult = {
            success: false,
            error: error.message
          };
          results.set(task.taskId, errorResult);
          
          onProgress?.(completedCount, downloadTasks.length, task.taskId);
          
          return { taskId: task.taskId, success: false };
        }
      });

      // 等待当前批次完成
      await Promise.allSettled(batchPromises);
      
      // 批次间添加小延迟
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.sleep(300);
      }
    }

    const successCount = Array.from(results.values()).filter(r => r.success).length;
    console.log(`📊 批量下载完成: 成功${successCount}个，失败${downloadTasks.length - successCount}个`);

    return results;
  }

  /**
   * 执行实际的文件下载
   */
  private async performDownload(
    speechUrl: string,
    outputPath: string,
    config: Required<DownloadOptions>
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('下载超时'));
      }, config.timeoutMs);

      axios({
        method: 'GET',
        url: speechUrl,
        responseType: 'stream',
        timeout: config.timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AudioDownloader/1.0)',
          'Accept': 'audio/mpeg, audio/*, */*'
        }
      })
        .then(response => {
          // 验证响应
          if (response.status !== 200) {
            const statusError = new Error(`HTTP错误 ${response.status}: ${response.statusText}`);
            
            // 特别处理403认证错误
            if (response.status === 403) {
              throw new Error(`403 Forbidden - speech_url可能已过期或认证无效`);
            }
            
            throw statusError;
          }

          const writeStream = createWriteStream(outputPath);
          let downloadedBytes = 0;

          response.data.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            if (downloadedBytes % (1024 * 100) === 0) { // 每100KB打印一次
              console.log(`📊 已下载: ${Math.round(downloadedBytes / 1024)}KB`);
            }
          });

          response.data.pipe(writeStream);

          writeStream.on('finish', () => {
            clearTimeout(timeout);
            console.log(`✅ 下载完成: ${Math.round(downloadedBytes / 1024)}KB`);
            resolve();
          });

          writeStream.on('error', (error) => {
            clearTimeout(timeout);
            reject(new Error(`写入文件失败: ${error.message}`));
          });

          response.data.on('error', (error: any) => {
            clearTimeout(timeout);
            reject(new Error(`网络下载失败: ${error.message}`));
          });
        })
        .catch(error => {
          clearTimeout(timeout);
          if (error.code === 'ECONNABORTED') {
            reject(new Error('下载请求超时'));
          } else {
            reject(new Error(`下载请求失败: ${error.message}`));
          }
        });
    });
  }

  /**
   * 验证下载的音频文件
   */
  private async validateDownloadedFile(
    filePath: string,
    config: Required<DownloadOptions>
  ): Promise<{
    isValid: boolean;
    error?: string;
    fileSize?: number;
    duration?: number;
  }> {
    try {
      // 检查文件是否存在
      const stats = await fs.stat(filePath);
      if (stats.size === 0) {
        return { isValid: false, error: '文件为空' };
      }

      // 检查最小文件大小（音频文件通常至少几KB）
      if (stats.size < 1024) {
        return { isValid: false, error: `文件过小: ${stats.size} bytes` };
      }

      let duration: number | undefined;

      // MP3格式验证
      if (config.validateMp3) {
        const isMp3 = await this.validateMp3Format(filePath);
        if (!isMp3) {
          // 检查是否是错误响应（HTML/JSON）
          const isTextError = await this.isTextErrorFile(filePath);
          if (isTextError) {
            return { isValid: false, error: '下载的是错误信息而非音频文件' };
          }
        }
      }

      // 估算音频时长
      if (config.estimateDuration) {
        duration = this.estimateAudioDuration(stats.size);
      }

      return {
        isValid: true,
        fileSize: stats.size,
        duration: duration || 0
      };

    } catch (error: any) {
      return { isValid: false, error: `验证失败: ${error.message}` };
    }
  }

  /**
   * 验证MP3文件格式
   */
  private async validateMp3Format(filePath: string): Promise<boolean> {
    try {
      const buffer = await fs.readFile(filePath, { encoding: null });
      if (buffer.length < 10) return false;

      // 检查MP3文件头
      // ID3v2: 49 44 33 (ID3)
      if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
        return true;
      }

      // MP3 frame sync: FF FB, FF FA, FF F3, FF F2等
      if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 检查是否是文本错误文件
   */
  private async isTextErrorFile(filePath: string): Promise<boolean> {
    try {
      const buffer = await fs.readFile(filePath, { encoding: null });
      const text = buffer.slice(0, 1000).toString('utf8').toLowerCase();
      
      return text.includes('<html') || 
             text.includes('error') || 
             text.includes('{"error') ||
             text.includes('<!doctype');
    } catch {
      return false;
    }
  }

  /**
   * 估算音频时长（基于文件大小的粗略估算）
   */
  private estimateAudioDuration(fileSize: number): number {
    // 假设128kbps的MP3编码
    const bitrate = 128 * 1024; // 128kbps in bits per second
    const bytesPerSecond = bitrate / 8;
    const estimatedSeconds = fileSize / bytesPerSecond;
    
    // 限制在合理范围内（最少1秒，最多300秒）
    return Math.max(1, Math.min(Math.round(estimatedSeconds), 300));
  }

  /**
   * 验证speech_url格式
   */
  private isValidSpeechUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      
      // 支持HTTP和HTTPS协议（百度TTS返回的是HTTP）
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return false;
      }

      // 检查是否是百度相关域名，包含新的aipe-speech域名
      const validDomains = [
        'bj.bcebos.com', 
        'bcebos.com', 
        'baidubce.com',
        'aipe-speech.bj.bcebos.com'  // 添加百度语音合成专用域名
      ];
      const isValidDomain = validDomains.some(domain => 
        parsedUrl.hostname.includes(domain) || parsedUrl.hostname === domain
      );

      console.log(`🔍 URL验证: ${url} → 域名: ${parsedUrl.hostname}, 协议: ${parsedUrl.protocol}, 有效: ${isValidDomain}`);
      
      return isValidDomain;
    } catch (error) {
      console.error('URL解析失败:', error);
      return false;
    }
  }

  /**
   * 清理部分下载的文件
   */
  private async cleanupPartialFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      console.log(`🧹 清理了部分下载文件: ${filePath}`);
    } catch {
      // 文件不存在，无需处理
    }
  }

  /**
   * 工具方法：延迟执行
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取文件大小（如果文件存在）
   */
  async getFileSize(filePath: string): Promise<number | null> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return null;
    }
  }

  /**
   * 检查文件是否存在且有效
   */
  async isValidAudioFile(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size < 1024) return false; // 太小的文件认为无效
      
      // 简单的MP3格式检查
      return await this.validateMp3Format(filePath);
    } catch {
      return false;
    }
  }
}