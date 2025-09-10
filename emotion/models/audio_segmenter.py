"""
音频分段处理模块
将长音频分割成1秒片段并逐个分析，实现实时情绪反馈
"""

import numpy as np
import logging
from typing import List, Dict, Generator, Callable
import time
import threading
from queue import Queue, Empty
from .emotion2vec import emotion2vec_analyzer

logger = logging.getLogger(__name__)

class AudioSegmenter:
    """音频分段处理器"""
    
    def __init__(self, segment_duration=1.0, sample_rate=16000, overlap_ratio=0.1):
        """
        初始化音频分段处理器
        
        Args:
            segment_duration: 每个片段的时长（秒）
            sample_rate: 音频采样率
            overlap_ratio: 片段重叠比例（0-1）
        """
        self.segment_duration = segment_duration
        self.sample_rate = sample_rate
        self.overlap_ratio = overlap_ratio
        
        # 计算片段参数
        self.segment_samples = int(segment_duration * sample_rate)
        self.overlap_samples = int(self.segment_samples * overlap_ratio)
        self.hop_samples = self.segment_samples - self.overlap_samples
        
        # 实时处理相关
        self.audio_buffer = np.array([], dtype=np.float32)
        self.processing_queue = Queue()
        self.result_queue = Queue()
        self.is_processing = False
        self.processing_thread = None
        
        logger.info(f"音频分段器初始化: {segment_duration}s片段, {sample_rate}Hz, {overlap_ratio*100}%重叠")
    
    def segment_audio(self, audio: np.ndarray) -> List[np.ndarray]:
        """
        将音频分割成固定长度的片段
        
        Args:
            audio: 输入音频数组
            
        Returns:
            音频片段列表
        """
        if len(audio) == 0:
            return []
        
        segments = []
        
        # 如果音频长度小于一个片段，直接返回
        if len(audio) < self.segment_samples:
            # 填充到最小长度
            padded_audio = np.pad(audio, (0, self.segment_samples - len(audio)), mode='constant')
            segments.append(padded_audio)
            return segments
        
        # 分割音频
        start = 0
        while start + self.segment_samples <= len(audio):
            segment = audio[start:start + self.segment_samples]
            segments.append(segment)
            start += self.hop_samples
        
        # 处理最后一个不完整的片段
        if start < len(audio):
            remaining = audio[start:]
            # 填充到完整长度
            padded_segment = np.pad(remaining, (0, self.segment_samples - len(remaining)), mode='constant')
            segments.append(padded_segment)
        
        logger.info(f"音频分割完成: {len(audio)}样本 -> {len(segments)}个片段")
        return segments
    
    def analyze_segments(self, segments: List[np.ndarray], callback: Callable = None) -> List[Dict]:
        """
        分析音频片段的情绪
        
        Args:
            segments: 音频片段列表
            callback: 每个片段分析完成后的回调函数
            
        Returns:
            情绪分析结果列表
        """
        results = []
        
        for i, segment in enumerate(segments):
            try:
                logger.info(f"分析片段 {i+1}/{len(segments)}")
                
                # 将numpy数组转换为bytes（模拟WebRTC音频数据）
                segment_bytes = self._numpy_to_audio_bytes(segment)
                
                # 使用emotion2vec分析器分析
                result = emotion2vec_analyzer.analyze(segment_bytes)
                
                # 添加片段信息
                result['segment_index'] = i
                result['segment_start_time'] = i * self.segment_duration
                result['segment_end_time'] = (i + 1) * self.segment_duration
                result['total_segments'] = len(segments)
                
                results.append(result)
                
                # 调用回调函数
                if callback:
                    callback(result)
                
                logger.info(f"片段 {i+1} 分析完成: {result['dominant_emotion']} (置信度: {result['confidence']:.3f})")
                
            except Exception as e:
                logger.error(f"片段 {i+1} 分析失败: {e}")
                # 创建错误结果
                error_result = {
                    'segment_index': i,
                    'segment_start_time': i * self.segment_duration,
                    'segment_end_time': (i + 1) * self.segment_duration,
                    'total_segments': len(segments),
                    'error': str(e),
                    'dominant_emotion': 'neutral',
                    'confidence': 0.0,
                    'emotions': {emotion: 0.0 for emotion in emotion2vec_analyzer.emotion_labels}
                }
                results.append(error_result)
        
        return results
    
    def process_audio_stream(self, audio_chunk: np.ndarray, callback: Callable = None):
        """
        处理实时音频流
        
        Args:
            audio_chunk: 新的音频数据块
            callback: 分析结果回调函数
        """
        # 将新数据添加到缓冲区
        self.audio_buffer = np.concatenate([self.audio_buffer, audio_chunk])
        
        # 检查是否有足够的数据形成新片段
        while len(self.audio_buffer) >= self.segment_samples:
            # 提取一个片段
            segment = self.audio_buffer[:self.segment_samples]
            
            # 更新缓冲区（保留重叠部分）
            self.audio_buffer = self.audio_buffer[self.hop_samples:]
            
            # 异步处理片段
            if callback:
                self._process_segment_async(segment, callback)
    
    def _process_segment_async(self, segment: np.ndarray, callback: Callable):
        """异步处理音频片段"""
        def process():
            try:
                segment_bytes = self._numpy_to_audio_bytes(segment)
                result = emotion2vec_analyzer.analyze(segment_bytes)
                result['timestamp'] = time.time()
                callback(result)
            except Exception as e:
                logger.error(f"异步片段处理失败: {e}")
        
        # 在新线程中处理
        thread = threading.Thread(target=process)
        thread.daemon = True
        thread.start()
    
    def _numpy_to_audio_bytes(self, audio: np.ndarray) -> bytes:
        """
        将numpy音频数组转换为bytes格式
        模拟WebRTC音频数据格式
        """
        # 转换为16位PCM格式
        audio_int16 = (audio * 32767).astype(np.int16)
        
        # 创建简单的WAV头部
        wav_header = self._create_wav_header(len(audio_int16), self.sample_rate)
        
        # 组合头部和数据
        audio_bytes = wav_header + audio_int16.tobytes()
        
        return audio_bytes
    
    def _create_wav_header(self, num_samples: int, sample_rate: int) -> bytes:
        """创建WAV文件头部"""
        # WAV文件头部（44字节）
        data_size = num_samples * 2  # 16位 = 2字节
        file_size = data_size + 36
        
        header = b'RIFF'
        header += file_size.to_bytes(4, 'little')
        header += b'WAVE'
        header += b'fmt '
        header += (16).to_bytes(4, 'little')  # fmt chunk size
        header += (1).to_bytes(2, 'little')   # PCM format
        header += (1).to_bytes(2, 'little')   # mono
        header += sample_rate.to_bytes(4, 'little')
        header += (sample_rate * 2).to_bytes(4, 'little')  # byte rate
        header += (2).to_bytes(2, 'little')   # block align
        header += (16).to_bytes(2, 'little')  # bits per sample
        header += b'data'
        header += data_size.to_bytes(4, 'little')
        
        return header
    
    def clear_buffer(self):
        """清空音频缓冲区"""
        self.audio_buffer = np.array([], dtype=np.float32)
        logger.info("音频缓冲区已清空")
    
    def get_buffer_duration(self) -> float:
        """获取当前缓冲区的音频时长（秒）"""
        return len(self.audio_buffer) / self.sample_rate

# 全局实例
audio_segmenter = AudioSegmenter()
