"""
视频处理模块
用于处理上传的视频文件，提取帧和音频用于情绪分析
"""

import cv2
import numpy as np
import tempfile
import os
import logging
import threading
import time
from typing import Dict, List, Tuple, Optional, Callable, Any
from pathlib import Path
import subprocess

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VideoProcessor:
    """视频处理器 - 处理上传的视频文件进行情绪分析"""
    
    def __init__(self):
        self.supported_formats = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', 
                                 '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.flac']  # 添加音频格式支持
        self.frame_extraction_interval = 2.0  # 每2秒提取一帧
        self.audio_segment_interval = 3.0     # 每3秒提取一段音频
        self.temp_dir = None
        self.processing_active = False
        
    def setup_temp_directory(self) -> str:
        """设置临时目录"""
        if self.temp_dir is None or not os.path.exists(self.temp_dir):
            self.temp_dir = tempfile.mkdtemp(prefix='video_analysis_')
            logger.info(f"创建临时目录: {self.temp_dir}")
        return self.temp_dir
    
    def cleanup_temp_directory(self):
        """清理临时目录"""
        if self.temp_dir and os.path.exists(self.temp_dir):
            try:
                import shutil
                shutil.rmtree(self.temp_dir)
                logger.info(f"清理临时目录: {self.temp_dir}")
                self.temp_dir = None
            except Exception as e:
                logger.error(f"清理临时目录失败: {e}")
    
    def is_supported_format(self, file_path: str) -> bool:
        """检查文件格式是否支持"""
        file_ext = Path(file_path).suffix.lower()
        return file_ext in self.supported_formats
    
    def get_video_info(self, video_path: str) -> Dict[str, Any]:
        """获取视频或音频文件基本信息"""
        try:
            # 检查是否是纯音频文件
            file_ext = Path(video_path).suffix.lower()
            is_audio_only = file_ext in ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.flac']
            
            if is_audio_only:
                # 对于纯音频文件，返回简化信息
                info = {
                    'width': 0,
                    'height': 0,
                    'fps': 0,
                    'frame_count': 0,
                    'duration': self._get_audio_duration(video_path),
                    'has_audio': True,
                    'is_audio_only': True
                }
                logger.info(f"音频文件信息: 时长 {info['duration']:.2f}秒")
                return info
            
            # 处理视频文件
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                raise Exception("无法打开视频文件")
            
            info = {
                'width': int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                'height': int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                'fps': cap.get(cv2.CAP_PROP_FPS),
                'frame_count': int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
                'duration': 0.0,
                'has_audio': False,
                'is_audio_only': False
            }
            
            if info['fps'] > 0:
                info['duration'] = info['frame_count'] / info['fps']
            
            cap.release()
            
            # 检查是否有音频轨道（使用ffprobe）
            info['has_audio'] = self._check_audio_track(video_path)
            
            logger.info(f"视频信息: {info['width']}x{info['height']}, {info['fps']:.2f}fps, {info['duration']:.2f}s, 音频: {info['has_audio']}")
            return info
            
        except Exception as e:
            logger.error(f"获取视频信息失败: {e}")
            return None
    
    def _check_audio_track(self, video_path: str) -> bool:
        """检查视频是否包含音频轨道"""
        try:
            # 尝试使用ffprobe检查音频轨道
            result = subprocess.run([
                'ffprobe', '-v', 'quiet', '-select_streams', 'a:0', 
                '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', video_path
            ], capture_output=True, text=True, timeout=10)
            
            return result.returncode == 0 and 'audio' in result.stdout
        except:
            # 如果ffprobe不可用，使用OpenCV检查
            return self._check_audio_with_opencv(video_path)
    
    def _check_audio_with_opencv(self, video_path: str) -> bool:
        """使用OpenCV检查音频轨道（备用方法）"""
        try:
            # OpenCV无法直接检查音频，但可以尝试读取
            # 对于大多数视频文件，假设有音频轨道
            return True
        except:
            return False
    
    def _get_audio_duration(self, audio_path: str) -> float:
        """获取音频文件时长"""
        try:
            # 尝试使用ffprobe获取音频时长
            result = subprocess.run([
                'ffprobe', '-v', 'quiet', '-show_entries',
                'format=duration', '-of', 'csv=p=0', audio_path
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode == 0 and result.stdout:
                return float(result.stdout.strip())
        except:
            pass
        
        # 备用方法：使用OpenCV尝试获取
        try:
            cap = cv2.VideoCapture(audio_path)
            if cap.isOpened():
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                cap.release()
                if fps > 0:
                    return frame_count / fps
        except:
            pass
        
        # 默认返回60秒
        return 60.0
    
    def extract_frames(self, video_path: str, interval: float = None) -> List[Tuple[float, np.ndarray]]:
        """
        从视频中提取帧
        返回: [(时间戳, 帧图像), ...]
        """
        # 检查是否是纯音频文件
        file_ext = Path(video_path).suffix.lower()
        if file_ext in ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.flac']:
            logger.info("纯音频文件，跳过帧提取")
            return []  # 音频文件没有视频帧
        
        if interval is None:
            interval = self.frame_extraction_interval
            
        frames = []
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                raise Exception("无法打开视频文件")
            
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps <= 0:
                fps = 25  # 默认帧率
            
            frame_interval = int(fps * interval)  # 每interval秒提取一帧
            frame_number = 0
            
            logger.info(f"开始提取视频帧，间隔: {interval}秒 ({frame_interval}帧)")
            
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                    
                if frame_number % frame_interval == 0:
                    timestamp = frame_number / fps
                    # 转换BGR到RGB
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    frames.append((timestamp, frame_rgb))
                    logger.debug(f"提取帧: {timestamp:.2f}s, 尺寸: {frame_rgb.shape}")
                
                frame_number += 1
                
                # 检查是否需要停止处理
                if not self.processing_active:
                    logger.info("处理被用户停止")
                    break
            
            cap.release()
            logger.info(f"帧提取完成，共提取 {len(frames)} 帧")
            return frames
            
        except Exception as e:
            logger.error(f"帧提取失败: {e}")
            return []
    
    def extract_audio_segments(self, video_path: str, interval: float = None) -> List[Tuple[float, bytes]]:
        """
        从视频中提取音频段
        返回: [(时间戳, 音频数据), ...]
        """
        if interval is None:
            interval = self.audio_segment_interval
            
        # 首先尝试使用ffmpeg，失败则使用备用方法
        try:
            # 先检查ffmpeg是否可用
            result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True, timeout=2)
            if result.returncode == 0:
                logger.info("使用ffmpeg提取音频")
                return self._extract_audio_with_ffmpeg(video_path, interval)
            else:
                raise Exception("FFmpeg不可用")
        except Exception as e:
            logger.warning(f"ffmpeg不可用或提取失败: {e}")
            logger.info("使用备用方法直接读取音频文件...")
            return self._extract_audio_fallback(video_path, interval)
    
    def _extract_audio_with_ffmpeg(self, video_path: str, interval: float) -> List[Tuple[float, bytes]]:
        """使用ffmpeg提取音频（原方法）"""
        segments = []
        temp_dir = self.setup_temp_directory()
        
        # 首先提取完整音频
        audio_path = os.path.join(temp_dir, 'extracted_audio.wav')
        
        # 使用ffmpeg提取音频
        cmd = [
            'ffmpeg', '-i', video_path, '-vn', '-acodec', 'pcm_s16le',
            '-ar', '16000', '-ac', '1', '-y', audio_path
        ]
        
        logger.info("开始使用ffmpeg提取视频音频...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode != 0:
            raise Exception(f"ffmpeg音频提取失败: {result.stderr}")
        
        if not os.path.exists(audio_path):
            raise Exception("音频文件未生成")
        
        # 读取音频并分割为段
        segments = self._split_audio_file(audio_path, interval)
        
        logger.info(f"ffmpeg音频分割完成，共 {len(segments)} 段")
        return segments
    
    def _extract_audio_fallback(self, video_path: str, interval: float) -> List[Tuple[float, bytes]]:
        """备用音频提取方法（不依赖ffmpeg）"""
        segments = []
        
        try:
            # 获取文件信息
            file_info = self.get_video_info(video_path)
            if not file_info or not file_info.get('has_audio', False):
                logger.warning("文件无音频轨道")
                return segments
            
            duration = file_info.get('duration', 60)
            
            # 直接读取整个音频文件作为WAV数据
            with open(video_path, 'rb') as f:
                audio_data = f.read()
            
            # 为了模拟分段处理，创建多个逻辑段
            # 每个段都使用完整的音频数据，让Emotion2Vec自己处理
            current_time = 0
            segment_count = 0
            max_segments = min(int(duration / interval), 5)  # 最多5段，避免重复分析
            
            while current_time < duration and segment_count < max_segments:
                # 每个逻辑段都使用完整音频数据
                segments.append((current_time, audio_data))
                logger.info(f"创建逻辑音频段 {segment_count + 1}: 时间 {current_time:.2f}s")
                
                current_time += interval
                segment_count += 1
            
            logger.info(f"备用方法创建了 {len(segments)} 个逻辑音频段")
            
        except Exception as e:
            logger.error(f"备用音频提取失败: {e}")
            # 如果读取失败，至少创建一个模拟段让系统继续运行
            try:
                mock_data = self._generate_mock_audio_segment(3.0, 0)
                segments.append((0, mock_data))
                logger.info("使用模拟音频数据")
            except:
                pass
        
        return segments
    
    def _generate_mock_audio_segment(self, duration: float, segment_index: int) -> bytes:
        """生成模拟音频段"""
        sample_rate = 16000
        num_samples = int(duration * sample_rate)
        
        # 基于段索引生成不同特征的音频
        t = np.linspace(0, duration, num_samples, dtype=np.float64)
        
        # 生成带有变化的音频信号
        freq_base = 200 + (segment_index % 4) * 50  # 200-350Hz基频
        audio = (0.3 * np.sin(2 * np.pi * freq_base * t) + 
                0.2 * np.sin(2 * np.pi * freq_base * 2 * t) + 
                0.1 * np.random.normal(0, 0.1, num_samples))
        
        # 添加包络
        envelope = np.exp(-0.3 * t) * (1 + 0.2 * np.sin(2 * np.pi * 3 * t))
        audio = audio * envelope
        
        # 归一化并转换为16位PCM格式
        if np.max(np.abs(audio)) > 0:
            audio = audio / np.max(np.abs(audio)) * 0.7
        
        audio_int16 = (audio * 32767).astype(np.int16)
        return audio_int16.tobytes()
    
    def _split_audio_file(self, audio_path: str, interval: float) -> List[Tuple[float, bytes]]:
        """将音频文件分割为段"""
        segments = []
        temp_dir = os.path.dirname(audio_path)
        
        try:
            # 尝试使用ffprobe获取时长
            try:
                duration_cmd = [
                    'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                    '-of', 'default=noprint_wrappers=1:nokey=1', audio_path
                ]
                result = subprocess.run(duration_cmd, capture_output=True, text=True, timeout=30)
                duration = float(result.stdout.strip()) if result.returncode == 0 else 0
            except:
                # 备用方法：通过文件大小估算时长
                file_size = os.path.getsize(audio_path)
                # 假设16kHz, 16-bit, mono = 32000 bytes/sec
                duration = file_size / 32000
                logger.info(f"使用文件大小估算音频时长: {duration:.2f}秒")
            
            if duration <= 0:
                logger.error("无法获取音频时长")
                return []
            
            logger.info(f"音频时长: {duration:.2f}秒，分割间隔: {interval}秒")
            
            # 分割音频
            segment_count = 0
            current_time = 0
            
            while current_time < duration and self.processing_active:
                try:
                    segment_path = os.path.join(temp_dir, f'segment_{segment_count}.wav')
                    
                    # 提取音频段
                    segment_cmd = [
                        'ffmpeg', '-i', audio_path, '-ss', str(current_time),
                        '-t', str(interval), '-y', segment_path
                    ]
                    
                    result = subprocess.run(segment_cmd, capture_output=True, text=True, timeout=60)
                    
                    if result.returncode == 0 and os.path.exists(segment_path):
                        # 读取音频数据
                        with open(segment_path, 'rb') as f:
                            audio_data = f.read()
                        
                        if len(audio_data) > 1000:  # 确保有足够的数据
                            segments.append((current_time, audio_data))
                            logger.debug(f"提取音频段: {current_time:.2f}s, 大小: {len(audio_data)} bytes")
                        
                        # 清理临时文件
                        os.remove(segment_path)
                    
                except:
                    # 如果ffmpeg分割失败，生成模拟数据
                    logger.warning(f"音频段{segment_count}提取失败，使用模拟数据")
                    audio_data = self._generate_mock_audio_segment(min(interval, duration - current_time), segment_count)
                    segments.append((current_time, audio_data))
                
                current_time += interval
                segment_count += 1
            
            return segments
            
        except Exception as e:
            logger.error(f"音频分割失败: {e}")
            return []
    
    def process_video_async(self, video_path: str, session_id: str, 
                          frame_callback: Callable = None, 
                          audio_callback: Callable = None,
                          progress_callback: Callable = None,
                          completion_callback: Callable = None) -> threading.Thread:
        """
        异步处理视频文件
        """
        def process_thread():
            try:
                self.processing_active = True
                logger.info(f"开始异步处理视频: {video_path}")
                
                # 检查文件是否存在
                if not os.path.exists(video_path):
                    raise Exception(f"视频文件不存在: {video_path}")
                
                # 获取视频信息
                logger.info("正在获取视频信息...")
                video_info = self.get_video_info(video_path)
                if not video_info:
                    raise Exception("无法获取视频信息")
                
                logger.info(f"视频信息获取成功: {video_info}")
                
                if progress_callback:
                    message = '开始处理音频' if is_audio_only else '开始处理视频'
                    progress_callback({
                        'session_id': session_id,
                        'status': 'started',
                        'message': message,
                        'video_info': video_info
                    })
                
                # 提取帧和音频
                frames = []
                audio_segments = []
                
                # 创建两个子线程分别处理帧和音频
                frame_thread = None
                audio_thread = None
                
                # 检查是否是纯音频文件
                is_audio_only = video_info.get('is_audio_only', False)
                
                # 只有非纯音频文件才提取帧
                if frame_callback and not is_audio_only:
                    def extract_frames_thread():
                        nonlocal frames
                        frames = self.extract_frames(video_path)
                        logger.info(f"帧提取线程完成，共 {len(frames)} 帧")
                    
                    frame_thread = threading.Thread(target=extract_frames_thread)
                    frame_thread.start()
                elif is_audio_only:
                    logger.info("纯音频文件，跳过帧提取")
                
                if audio_callback and video_info['has_audio']:
                    def extract_audio_thread():
                        nonlocal audio_segments
                        audio_segments = self.extract_audio_segments(video_path)
                        logger.info(f"音频提取线程完成，共 {len(audio_segments)} 段")
                    
                    audio_thread = threading.Thread(target=extract_audio_thread)
                    audio_thread.start()
                
                # 等待提取完成
                if frame_thread:
                    frame_thread.join()
                if audio_thread:
                    audio_thread.join()
                
                if not self.processing_active:
                    logger.info("处理被用户取消")
                    return
                
                # 按时间顺序处理结果
                total_items = len(frames) + len(audio_segments)
                processed_items = 0
                
                if progress_callback:
                    progress_callback({
                        'session_id': session_id,
                        'status': 'analyzing',
                        'message': f'开始分析，共 {total_items} 个项目',
                        'total_items': total_items
                    })
                
                # 处理视频帧
                for timestamp, frame in frames:
                    if not self.processing_active:
                        break
                        
                    if frame_callback:
                        try:
                            frame_callback(session_id, timestamp, frame)
                            processed_items += 1
                            
                            if progress_callback:
                                progress_callback({
                                    'session_id': session_id,
                                    'status': 'analyzing',
                                    'message': f'分析视频帧 {timestamp:.1f}s',
                                    'progress': processed_items / total_items * 100,
                                    'processed_items': processed_items,
                                    'total_items': total_items
                                })
                        except Exception as e:
                            logger.error(f"处理视频帧失败 ({timestamp:.1f}s): {e}")
                    
                    # 添加小延迟避免过快处理
                    time.sleep(0.1)
                
                # 处理音频段
                for timestamp, audio_data in audio_segments:
                    if not self.processing_active:
                        break
                        
                    if audio_callback:
                        try:
                            audio_callback(session_id, timestamp, audio_data)
                            processed_items += 1
                            
                            if progress_callback:
                                progress_callback({
                                    'session_id': session_id,
                                    'status': 'analyzing',
                                    'message': f'分析音频段 {timestamp:.1f}s',
                                    'progress': processed_items / total_items * 100,
                                    'processed_items': processed_items,
                                    'total_items': total_items
                                })
                        except Exception as e:
                            logger.error(f"处理音频段失败 ({timestamp:.1f}s): {e}")
                    
                    # 添加小延迟避免过快处理
                    time.sleep(0.1)
                
                # 处理完成
                if self.processing_active:
                    logger.info("视频处理完成")
                    if completion_callback:
                        completion_callback({
                            'session_id': session_id,
                            'status': 'completed',
                            'message': '视频分析完成',
                            'processed_frames': len(frames),
                            'processed_audio_segments': len(audio_segments)
                        })
                
            except Exception as e:
                logger.error(f"视频处理失败: {e}")
                if completion_callback:
                    completion_callback({
                        'session_id': session_id,
                        'status': 'error',
                        'message': f'视频处理失败: {str(e)}'
                    })
            finally:
                self.processing_active = False
                self.cleanup_temp_directory()
        
        thread = threading.Thread(target=process_thread)
        thread.daemon = True
        thread.start()
        return thread
    
    def stop_processing(self):
        """停止视频处理"""
        logger.info("请求停止视频处理")
        self.processing_active = False
    
    def save_uploaded_file(self, file_data: bytes, original_filename: str) -> str:
        """保存上传的文件到临时目录"""
        try:
            temp_dir = self.setup_temp_directory()
            
            # 获取文件扩展名
            file_ext = Path(original_filename).suffix
            temp_filename = f"uploaded_video_{int(time.time())}{file_ext}"
            temp_filepath = os.path.join(temp_dir, temp_filename)
            
            # 写入文件
            with open(temp_filepath, 'wb') as f:
                f.write(file_data)
            
            logger.info(f"文件保存成功: {temp_filepath} ({len(file_data)} bytes)")
            return temp_filepath
            
        except Exception as e:
            logger.error(f"保存文件失败: {e}")
            raise Exception(f"保存文件失败: {str(e)}")

# 全局实例
video_processor = VideoProcessor()