/**
 * 音频编码器 - 简化版
 * 用于兼容现有代码，提供基本的音频编码功能
 */

export interface AudioEncoderConfig {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

/**
 * 将Float32Array编码为WAV格式
 */
export const encodeWAV = (
  buffer: Float32Array,
  config: AudioEncoderConfig = {}
): ArrayBuffer => {
  const sampleRate = config.sampleRate || 44100;
  const channels = config.channels || 1;
  const bitDepth = config.bitDepth || 16;

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
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitDepth / 8), true);
  view.setUint16(32, channels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);

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
};

/**
 * 计算音频音量（RMS）
 */
export const calculateVolume = (buffer: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
};

/**
 * 检测是否有声音
 */
export const detectSound = (
  buffer: Float32Array,
  threshold: number = 0.01
): boolean => {
  const volume = calculateVolume(buffer);
  return volume > threshold;
};

/**
 * ArrayBuffer转base64
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * base64转ArrayBuffer
 */
export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

export default {
  encodeWAV,
  calculateVolume,
  detectSound,
  arrayBufferToBase64,
  base64ToArrayBuffer
};