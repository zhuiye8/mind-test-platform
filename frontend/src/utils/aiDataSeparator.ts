/**
 * AI数据分离器
 * 将MediaRecorder的统一数据流分离为AI服务所需的视频帧和音频数据格式
 */

import { Socket } from 'socket.io-client';

export interface AIDataSeparatorConfig {
  sessionId: string;
  socket: Socket;
  frameRate?: number; // 视频帧提取率(fps)
  audioChunkDuration?: number; // 音频块持续时间(ms)
  onStatsUpdate?: (stats: { framesSent: number; chunksSent: number }) => void;
}

export interface SeparatedData {
  videoFrames: string[]; // base64编码的JPEG帧
  audioChunks: string[]; // base64编码的WAV音频块
}

export class AIDataSeparator {
  private sessionId: string;
  private socket: Socket;
  private frameRate: number;
  private audioChunkDuration: number;
  private onStatsUpdate?: (stats: { framesSent: number; chunksSent: number }) => void;
  
  // 统计数据
  private framesSent: number = 0;
  private chunksSent: number = 0;
  
  // 视频处理相关
  private videoCanvas: HTMLCanvasElement;
  private videoContext: CanvasRenderingContext2D;
  private videoElement: HTMLVideoElement;
  private frameExtractInterval: number | null = null;
  
  // 音频处理相关
  private audioContext: AudioContext | null = null;
  private audioBuffer: Float32Array[] = [];
  private lastAudioSend: number = 0;

  constructor(config: AIDataSeparatorConfig) {
    this.sessionId = config.sessionId;
    this.socket = config.socket;
    this.frameRate = config.frameRate || 10; // 默认10fps提取视频帧
    this.audioChunkDuration = config.audioChunkDuration || 1000; // 默认1秒音频块
    this.onStatsUpdate = config.onStatsUpdate;

    // 创建视频处理元素
    this.videoCanvas = document.createElement('canvas');
    this.videoContext = this.videoCanvas.getContext('2d')!;
    this.videoElement = document.createElement('video');
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
  }

  /**
   * 开始处理MediaRecorder数据流
   * @param stream MediaStream对象，用于视频帧提取
   */
  public startProcessing(stream: MediaStream): void {
    try {
      // 设置视频流用于帧提取
      this.setupVideoFrameExtraction(stream);
      
      console.log('[AI数据分离器] 开始处理数据流');
    } catch (error) {
      console.error('[AI数据分离器] 启动失败:', error);
    }
  }

  /**
   * 处理MediaRecorder产生的数据块
   * @param data Blob数据
   */
  public processMediaData(data: Blob): void {
    // MediaRecorder产生的WebM数据主要用于完整性传输
    // 视频帧提取通过Canvas处理，音频通过AudioContext处理
    // 这里可以添加额外的数据处理逻辑，如质量监控等
    
    console.log(`[AI数据分离器] 处理媒体数据块: ${data.size} 字节`);
  }

  /**
   * 设置视频帧提取
   */
  private setupVideoFrameExtraction(stream: MediaStream): void {
    // 设置视频元素
    this.videoElement.srcObject = stream;
    this.videoElement.play().catch(error => {
      console.error('[AI数据分离器] 视频播放失败:', error);
    });

    // 等待视频准备就绪
    this.videoElement.addEventListener('loadedmetadata', () => {
      const { videoWidth, videoHeight } = this.videoElement;
      
      // 设置Canvas尺寸，适当缩放以减少数据量
      const scaleFactor = Math.min(640 / videoWidth, 480 / videoHeight);
      this.videoCanvas.width = Math.round(videoWidth * scaleFactor);
      this.videoCanvas.height = Math.round(videoHeight * scaleFactor);

      console.log('[AI数据分离器] 视频尺寸设置:', {
        原始: `${videoWidth}x${videoHeight}`,
        缩放后: `${this.videoCanvas.width}x${this.videoCanvas.height}`,
        缩放因子: scaleFactor
      });

      // 开始定期提取帧
      this.startFrameExtraction();
    });
  }

  /**
   * 开始视频帧提取
   */
  private startFrameExtraction(): void {
    const intervalMs = 1000 / this.frameRate;
    
    this.frameExtractInterval = window.setInterval(() => {
      this.extractAndSendVideoFrame();
    }, intervalMs);

    console.log(`[AI数据分离器] 开始帧提取，间隔: ${intervalMs}ms (${this.frameRate}fps)`);
  }

  /**
   * 提取并发送视频帧
   */
  private extractAndSendVideoFrame(): void {
    try {
      if (this.videoElement.readyState < 2) {
        // 视频还未准备好
        return;
      }

      // 绘制当前帧到Canvas
      this.videoContext.drawImage(
        this.videoElement,
        0, 0,
        this.videoCanvas.width,
        this.videoCanvas.height
      );

      // 转换为JPEG格式的base64数据
      const frameData = this.videoCanvas.toDataURL('image/jpeg', 0.8);

      // 发送到AI服务（使用AIAPI.md定义的格式）
      this.socket.emit('video_frame', {
        session_id: this.sessionId,
        frame_data: frameData,
        timestamp: Date.now()
      });

      // 更新统计
      this.framesSent++;
      this.updateStats();

      console.log(`[AI数据分离器] 发送视频帧 #${this.framesSent}`);

    } catch (error) {
      console.error('[AI数据分离器] 视频帧提取失败:', error);
    }
  }

  /**
   * 设置音频处理
   */
  public setupAudioProcessing(stream: MediaStream): void {
    try {
      // 创建AudioContext
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 创建媒体流源
      const source = this.audioContext.createMediaStreamSource(stream);
      
      // 创建ScriptProcessor作为fallback（用于音频数据提取）
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // 收集音频数据
        this.collectAudioData(inputData);
      };

      // 连接音频节点
      source.connect(processor);
      processor.connect(this.audioContext.destination);

      console.log('[AI数据分离器] 音频处理设置完成');

    } catch (error) {
      console.error('[AI数据分离器] 音频处理设置失败:', error);
    }
  }

  /**
   * 收集音频数据并定期发送
   */
  private collectAudioData(audioData: Float32Array): void {
    // 将音频数据添加到缓冲区
    this.audioBuffer.push(new Float32Array(audioData));

    const now = Date.now();
    
    // 检查是否应该发送音频块
    if (now - this.lastAudioSend >= this.audioChunkDuration) {
      this.sendAudioChunk();
      this.lastAudioSend = now;
    }
  }

  /**
   * 发送音频块到AI服务
   */
  private sendAudioChunk(): void {
    if (this.audioBuffer.length === 0) return;

    try {
      // 合并音频缓冲区
      const totalLength = this.audioBuffer.reduce((sum, buffer) => sum + buffer.length, 0);
      const combinedBuffer = new Float32Array(totalLength);
      
      let offset = 0;
      for (const buffer of this.audioBuffer) {
        combinedBuffer.set(buffer, offset);
        offset += buffer.length;
      }

      // 转换为WAV格式
      const wavData = this.floatArrayToWav(combinedBuffer, this.audioContext!.sampleRate);
      
      // 转换为base64
      const audioBase64 = this.arrayBufferToBase64(wavData);
      
      // 发送到AI服务（使用AIAPI.md定义的格式）
      this.socket.emit('audio_data', {
        session_id: this.sessionId,
        audio_data: `data:audio/wav;base64,${audioBase64}`,
        timestamp: Date.now()
      });

      // 更新统计
      this.chunksSent++;
      this.updateStats();

      console.log(`[AI数据分离器] 发送音频块 #${this.chunksSent}，大小: ${wavData.byteLength} 字节`);

      // 清空缓冲区
      this.audioBuffer = [];

    } catch (error) {
      console.error('[AI数据分离器] 音频发送失败:', error);
    }
  }

  /**
   * 将Float32Array转换为WAV格式
   */
  private floatArrayToWav(buffer: Float32Array, sampleRate: number): ArrayBuffer {
    const length = buffer.length;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);

    // WAV文件头
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');

    // FMT sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);

    // Data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // 写入PCM数据
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, buffer[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }

    return arrayBuffer;
  }

  /**
   * ArrayBuffer转base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 更新统计信息
   */
  private updateStats(): void {
    if (this.onStatsUpdate) {
      this.onStatsUpdate({
        framesSent: this.framesSent,
        chunksSent: this.chunksSent
      });
    }
  }

  /**
   * 获取当前统计信息
   */
  public getStats(): { framesSent: number; chunksSent: number } {
    return {
      framesSent: this.framesSent,
      chunksSent: this.chunksSent
    };
  }

  /**
   * 停止数据处理
   */
  public stopProcessing(): void {
    console.log('[AI数据分离器] 停止数据处理');

    // 停止帧提取
    if (this.frameExtractInterval) {
      clearInterval(this.frameExtractInterval);
      this.frameExtractInterval = null;
    }

    // 清理视频元素
    if (this.videoElement.srcObject) {
      this.videoElement.srcObject = null;
    }

    // 清理音频上下文
    if (this.audioContext) {
      this.audioContext.close().catch(error => {
        console.error('[AI数据分离器] AudioContext关闭失败:', error);
      });
      this.audioContext = null;
    }

    // 清空音频缓冲区
    this.audioBuffer = [];

    // 重置统计
    this.framesSent = 0;
    this.chunksSent = 0;
    this.updateStats();
  }

  /**
   * 更新会话ID
   */
  public updateSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    console.log('[AI数据分离器] 会话ID已更新:', sessionId);
  }
}