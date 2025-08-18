// 音频编码工具 - 正确的WAV格式编码
// 解决AI服务音频数据解析问题

export interface AudioEncodeOptions {
  sampleRate?: number;
  bitDepth?: 16 | 24 | 32;
  channels?: number;
}

/**
 * 将Float32Array音频数据编码为WAV格式的base64字符串
 * @param audioData Float32Array格式的音频数据
 * @param options 编码选项
 * @returns WAV格式的base64字符串
 */
export function encodeWAV(
  audioData: Float32Array, 
  options: AudioEncodeOptions = {}
): string {
  const {
    sampleRate = 44100,
    bitDepth = 16,
    channels = 1
  } = options;

  const length = audioData.length;
  const bytesPerSample = bitDepth / 8;
  const dataSize = length * bytesPerSample;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  // 创建ArrayBuffer
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // 写入字符串到DataView
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // WAV文件头 (44字节)
  writeString(0, 'RIFF');                          // ChunkID
  view.setUint32(4, fileSize - 8, true);          // ChunkSize
  writeString(8, 'WAVE');                         // Format
  
  // fmt 子块
  writeString(12, 'fmt ');                        // Subchunk1ID
  view.setUint32(16, 16, true);                   // Subchunk1Size (PCM = 16)
  view.setUint16(20, 1, true);                    // AudioFormat (PCM = 1)
  view.setUint16(22, channels, true);             // NumChannels
  view.setUint32(24, sampleRate, true);           // SampleRate
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // ByteRate
  view.setUint16(32, channels * bytesPerSample, true); // BlockAlign
  view.setUint16(34, bitDepth, true);             // BitsPerSample
  
  // data 子块
  writeString(36, 'data');                        // Subchunk2ID
  view.setUint32(40, dataSize, true);             // Subchunk2Size

  // 音频数据转换
  let offset = headerSize;
  
  if (bitDepth === 16) {
    // 16位PCM
    for (let i = 0; i < length; i++) {
      // 将Float32 (-1 到 1) 转换为 Int16 (-32768 到 32767)
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  } else if (bitDepth === 24) {
    // 24位PCM
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const intSample = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
      
      // 24位需要手动写入3个字节
      view.setUint8(offset, intSample & 0xFF);
      view.setUint8(offset + 1, (intSample >> 8) & 0xFF);
      view.setUint8(offset + 2, (intSample >> 16) & 0xFF);
      offset += 3;
    }
  } else if (bitDepth === 32) {
    // 32位PCM
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const intSample = sample < 0 ? sample * 0x80000000 : sample * 0x7FFFFFFF;
      view.setInt32(offset, intSample, true);
      offset += 4;
    }
  }

  // 转换为base64
  const uint8Array = new Uint8Array(buffer);
  let binaryString = '';
  const chunkSize = 8192; // 分块处理避免栈溢出
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binaryString += String.fromCharCode(...chunk);
  }
  
  return btoa(binaryString);
}

/**
 * 计算音频数据的音量级别 (0-100)
 * @param audioData Float32Array格式的音频数据
 * @returns 音量级别百分比
 */
export function calculateVolume(audioData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  const rms = Math.sqrt(sum / audioData.length);
  return Math.min(100, rms * 100 * 3); // 乘以3增加敏感度
}

/**
 * 检测音频数据是否包含有效声音
 * @param audioData Float32Array格式的音频数据
 * @param threshold 检测阈值 (0-1)
 * @returns 是否检测到声音
 */
export function detectSound(audioData: Float32Array, threshold: number = 0.01): boolean {
  let maxAmplitude = 0;
  for (let i = 0; i < audioData.length; i++) {
    maxAmplitude = Math.max(maxAmplitude, Math.abs(audioData[i]));
  }
  return maxAmplitude > threshold;
}

/**
 * 对音频数据进行简单的噪声减少处理
 * @param audioData Float32Array格式的音频数据
 * @param noiseThreshold 噪声阈值
 * @returns 处理后的音频数据
 */
export function reduceNoise(audioData: Float32Array, noiseThreshold: number = 0.005): Float32Array {
  const result = new Float32Array(audioData.length);
  
  for (let i = 0; i < audioData.length; i++) {
    const sample = audioData[i];
    // 简单的噪声门限处理
    result[i] = Math.abs(sample) > noiseThreshold ? sample : 0;
  }
  
  return result;
}