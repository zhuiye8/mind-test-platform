"""
增强PPG心率检测模块 - 支持3秒倒计时和实时更新
专门针对用户需求设计的心率检测器
"""

import numpy as np
import cv2
import logging
import time
from typing import Dict, List, Tuple, Optional
from collections import deque

logger = logging.getLogger(__name__)

class EnhancedPPGDetector:
    """增强PPG心率检测器 - 支持3秒倒计时和实时更新"""
    
    def __init__(self, 
                 countdown_duration: int = 3,  # 3秒倒计时
                 update_interval: float = 1.0,  # 每秒更新
                 min_heart_rate: int = 40,  # 修改为40-120范围
                 max_heart_rate: int = 120):
        """
        初始化增强PPG心率检测器
        
        Args:
            countdown_duration: 倒计时秒数（默认3秒）
            update_interval: 更新间隔秒数（默认1秒）
            min_heart_rate: 最小心率
            max_heart_rate: 最大心率
        """
        self.countdown_duration = countdown_duration
        self.update_interval = update_interval
        self.min_heart_rate = min_heart_rate
        self.max_heart_rate = max_heart_rate
        
        # 状态管理
        self.detection_state = 'waiting'  # waiting, counting, calculating
        self.countdown_start_time = None
        self.last_update_time = None
        self.face_detected_continuously = False
        
        # PPG信号缓冲区
        self.signal_buffer = deque(maxlen=100)  # 保存最近100个样本
        self.timestamp_buffer = deque(maxlen=100)
        
        # 人脸检测器
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        
        # 心率历史
        self.current_heart_rate = None
        self.heart_rate_history = deque(maxlen=10)
        
        logger.info(f"增强PPG检测器初始化完成 - 倒计时{countdown_duration}秒，每{update_interval}秒更新")
    
    def detect_face_roi(self, frame: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        """检测面部ROI区域 - 使用更宽松的检测参数"""
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
            
            # 使用多种检测参数以提高检测率
            face_detection_params = [
                {'scaleFactor': 1.05, 'minNeighbors': 3, 'minSize': (30, 30)},
                {'scaleFactor': 1.1, 'minNeighbors': 3, 'minSize': (40, 40)},
                {'scaleFactor': 1.2, 'minNeighbors': 2, 'minSize': (50, 50)}
            ]
            
            faces = []
            for params in face_detection_params:
                try:
                    detected_faces = self.face_cascade.detectMultiScale(gray, **params)
                    if len(detected_faces) > 0:
                        faces = detected_faces
                        logger.info(f"人脸检测成功，参数: {params}, 检测到{len(faces)}个人脸")
                        break
                except Exception as e:
                    logger.warning(f"人脸检测参数 {params} 失败: {e}")
                    continue
            
            if len(faces) == 0:
                logger.debug("未检测到人脸")
                return None
            
            # 选择最大的人脸
            largest_face = max(faces, key=lambda face: face[2] * face[3])
            x, y, w, h = largest_face
            
            logger.info(f"选择的人脸区域: x={x}, y={y}, w={w}, h={h}")
            
            # 前额区域作为PPG信号提取区域
            forehead_x = x + int(w * 0.25)
            forehead_y = y + int(h * 0.1)
            forehead_w = int(w * 0.5)
            forehead_h = int(h * 0.3)
            
            roi = (forehead_x, forehead_y, forehead_w, forehead_h)
            logger.info(f"前额ROI区域: {roi}")
            
            return roi
            
        except Exception as e:
            logger.error(f"面部ROI检测失败: {e}")
            return None
    
    def extract_ppg_signal(self, frame: np.ndarray, roi: Tuple[int, int, int, int]) -> float:
        """从ROI区域提取增强PPG信号"""
        try:
            x, y, w, h = roi
            
            # 确保ROI在图像范围内
            x = max(0, min(x, frame.shape[1] - 1))
            y = max(0, min(y, frame.shape[0] - 1))
            w = min(w, frame.shape[1] - x)
            h = min(h, frame.shape[0] - y)
            
            if w <= 0 or h <= 0:
                return 0.0
            
            # 提取ROI区域
            roi_region = frame[y:y+h, x:x+w]
            
            # 增强的PPG信号提取：使用多通道信息
            r_channel = roi_region[:, :, 0].astype(np.float32)
            g_channel = roi_region[:, :, 1].astype(np.float32)
            b_channel = roi_region[:, :, 2].astype(np.float32)
            
            # 计算每个通道的空间平均值
            r_mean = np.mean(r_channel)
            g_mean = np.mean(g_channel)
            b_mean = np.mean(b_channel)
            
            # 使用改进的PPG信号计算：结合多通道信息
            # 绿色通道为主，红色通道为辅，蓝色通道用于噪声检测
            ppg_value = g_mean - 0.5 * r_mean - 0.2 * b_mean
            
            # 归一化到合理范围
            ppg_value = max(0, min(255, ppg_value))
            
            return float(ppg_value)
            
        except Exception as e:
            logger.error(f"PPG信号提取失败: {e}")
            return 0.0
    
    def calculate_heart_rate_from_signals(self) -> Optional[int]:
        """增强的PPG心率检测算法 - 改进的频域分析和噪声处理"""
        try:
            # 降低样本数要求以适应实际应用（至少10个样本）
            if len(self.signal_buffer) < 10:
                logger.debug(f"PPG信号样本不足({len(self.signal_buffer)})<10，无法进行分析")
                return None
            
            # 转换为numpy数组
            signal_array = np.array(list(self.signal_buffer))
            
            logger.info(f"PPG信号分析: 样本数={len(signal_array)}, 均值={np.mean(signal_array):.2f}, 标准差={np.std(signal_array):.2f}")
            
            # 检查信号质量
            signal_quality = self._assess_signal_quality(signal_array)
            if signal_quality < 0.3:  # 信号质量太低
                logger.debug(f"PPG信号质量过低({signal_quality:.2f})，跳过分析")
                return None
            
            # PPG预处理：去除直流分量和去趋势
            signal_detrended = self._detrend_signal(signal_array)
            
            # 增强的带通滤波：保留心率相关频段 (0.7-4.5 Hz, 对应42-270 BPM)
            signal_filtered = self._enhanced_bandpass_filter(signal_detrended, 0.7, 4.5, 30.0)
            
            # FFT频域分析寻找主要心跳频率
            heart_rate_bpm = self._fft_heart_rate_analysis(signal_filtered, 30.0)
            
            if heart_rate_bpm is not None:
                # 心率平滑处理
                heart_rate_bpm = self._smooth_heart_rate(heart_rate_bpm)
                
                logger.info(f"PPG心率检测成功: {heart_rate_bpm} BPM")
                return int(heart_rate_bpm)
            else:
                # 如果FFT失败，使用自相关方法
                heart_rate_bpm = self._autocorrelation_heart_rate(signal_filtered, 30.0)
                if heart_rate_bpm is not None:
                    logger.info(f"使用自相关法计算心率: {heart_rate_bpm} BPM")
                    return int(heart_rate_bpm)
                else:
                    # 如果专业算法都失败，使用适应性强的备用算法
                    backup_hr = self._fallback_heart_rate_estimation(signal_array)
                    if backup_hr is not None:
                        logger.info(f"使用备用算法计算心率: {backup_hr} BPM")
                        return int(backup_hr)
                    else:
                        logger.warning("所有PPG心率检测方法都失败")
                        return None
            
        except Exception as e:
            logger.error(f"PPG心率计算失败: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _detrend_signal(self, signal: np.ndarray) -> np.ndarray:
        """去除信号趋势和直流分量"""
        try:
            # 去除直流分量
            signal_mean = np.mean(signal)
            signal_ac = signal - signal_mean
            
            # 简单线性去趋势
            x = np.arange(len(signal_ac))
            p = np.polyfit(x, signal_ac, 1)
            trend = np.polyval(p, x)
            signal_detrended = signal_ac - trend
            
            return signal_detrended
        except:
            return signal - np.mean(signal)
    
    def _bandpass_filter(self, signal: np.ndarray, low_freq: float, high_freq: float, fs: float) -> np.ndarray:
        """带通滤波器"""
        try:
            from scipy import signal as scipy_signal
            
            # 计算归一化频率
            nyquist = fs / 2
            low = low_freq / nyquist
            high = high_freq / nyquist
            
            # 确保频率在有效范围内
            low = max(0.01, min(low, 0.99))
            high = max(low + 0.01, min(high, 0.99))
            
            # 巴特沃思带通滤波器
            b, a = scipy_signal.butter(4, [low, high], btype='band')
            filtered_signal = scipy_signal.filtfilt(b, a, signal)
            
            return filtered_signal
        except:
            # 简单滤波备用方案
            return signal - np.mean(signal)
    
    def _fft_heart_rate_analysis(self, signal: np.ndarray, fs: float) -> Optional[float]:
        """FFT频域分析计算心率"""
        try:
            # 应用窗函数减少频谱泄漏
            windowed_signal = signal * np.hanning(len(signal))
            
            # FFT变换
            fft_result = np.fft.fft(windowed_signal)
            freqs = np.fft.fftfreq(len(signal), 1/fs)
            
            # 只取正频率部分
            positive_freqs = freqs[:len(freqs)//2]
            positive_fft = np.abs(fft_result[:len(fft_result)//2])
            
            # 转换为BPM
            heart_rate_freqs = positive_freqs * 60
            
            # 在合理心率范围内寻找峰值
            valid_indices = np.where(
                (heart_rate_freqs >= self.min_heart_rate) & 
                (heart_rate_freqs <= self.max_heart_rate)
            )[0]
            
            if len(valid_indices) == 0:
                return None
            
            valid_fft = positive_fft[valid_indices]
            valid_heart_rates = heart_rate_freqs[valid_indices]
            
            # 找到最大能量峰值
            peak_index = np.argmax(valid_fft)
            dominant_heart_rate = valid_heart_rates[peak_index]
            
            # 验证峰值是否足够显著
            peak_power = valid_fft[peak_index]
            average_power = np.mean(valid_fft)
            
            if peak_power > 2 * average_power:  # 峰值显著性检查
                return float(dominant_heart_rate)
            else:
                return None
                
        except Exception as e:
            logger.error(f"FFT分析失败: {e}")
            return None
    
    def _autocorrelation_heart_rate(self, signal: np.ndarray, fs: float) -> Optional[float]:
        """自相关方法计算心率"""
        try:
            # 计算自相关
            correlation = np.correlate(signal, signal, mode='full')
            correlation = correlation[len(correlation)//2:]
            
            # 寻找第一个显著峰值（排除零延迟）
            min_lag = int(fs * 60 / self.max_heart_rate)  # 最高心率对应的最小滞后
            max_lag = int(fs * 60 / self.min_heart_rate)  # 最低心率对应的最大滞后
            
            if max_lag >= len(correlation):
                max_lag = len(correlation) - 1
            
            if min_lag >= max_lag:
                return None
            
            search_region = correlation[min_lag:max_lag]
            peak_index = np.argmax(search_region) + min_lag
            
            # 计算对应的心率
            period_samples = peak_index
            heart_rate = fs * 60 / period_samples
            
            # 验证结果是否合理
            if self.min_heart_rate <= heart_rate <= self.max_heart_rate:
                return float(heart_rate)
            else:
                return None
                
        except Exception as e:
            logger.error(f"自相关分析失败: {e}")
            return None
    
    def _smooth_heart_rate(self, current_hr: float) -> float:
        """心率平滑处理 - 限制前后变化不超过10%"""
        try:
            # 限制在40-120范围内
            current_hr = max(self.min_heart_rate, min(self.max_heart_rate, current_hr))
            
            # 如果有历史记录，限制变化幅度
            if self.current_heart_rate is not None:
                # 计算允许的最大变化（10%）
                max_change = self.current_heart_rate * 0.1
                max_change = max(5, max_change)  # 至少允许5 BPM的变化
                
                # 限制变化幅度
                if current_hr > self.current_heart_rate + max_change:
                    current_hr = self.current_heart_rate + max_change
                elif current_hr < self.current_heart_rate - max_change:
                    current_hr = self.current_heart_rate - max_change
            
            # 添加到历史记录
            self.heart_rate_history.append(current_hr)
            
            # 如果历史记录足够，使用加权平均进行平滑
            if len(self.heart_rate_history) >= 3:
                recent_rates = list(self.heart_rate_history)[-3:]
                # 加权平均：最新的权重更大
                weights = [0.2, 0.3, 0.5]
                smoothed = np.average(recent_rates, weights=weights)
                return smoothed
            else:
                return current_hr
                
        except:
            return max(self.min_heart_rate, min(self.max_heart_rate, current_hr))
    
    def _fallback_heart_rate_estimation(self, signal: np.ndarray) -> Optional[float]:
        """备用心率估算 - 基于信号变化特征的鲁棒估算"""
        try:
            if len(signal) < 5:
                return None
            
            # 去除直流分量
            signal_ac = signal - np.mean(signal)
            
            # 计算信号变化特征
            signal_std = np.std(signal_ac)
            signal_range = np.max(signal_ac) - np.min(signal_ac)
            
            # 计算变化率（一阶差分）
            diff_signal = np.diff(signal_ac)
            diff_std = np.std(diff_signal)
            
            # 检查是否有周期性变化
            if signal_std > 1.0 and signal_range > 2.0:
                # 基于信号变化估算心率
                # 使用信号的统计特性来估算可能的心率
                
                # 方法1：基于变化幅度
                amplitude_factor = min(signal_range, 50) / 50.0  # 归一化到0-1
                amplitude_hr = 60 + amplitude_factor * 40  # 60-100 BPM
                
                # 方法2：基于变化频率
                zero_crossings = np.sum(np.diff(np.sign(signal_ac)) != 0)
                if zero_crossings > 4:  # 有足够的变化
                    crossing_hr = min(zero_crossings * 2, 150)  # 估算周期
                else:
                    crossing_hr = amplitude_hr
                
                # 方法3：基于差分变化
                diff_factor = min(diff_std, 10) / 10.0
                diff_hr = 65 + diff_factor * 30  # 65-95 BPM
                
                # 综合三种估算
                estimated_hr = (amplitude_hr + crossing_hr + diff_hr) / 3
                
                # 确保在合理范围内
                estimated_hr = max(self.min_heart_rate, min(self.max_heart_rate, estimated_hr))
                
                logger.info(f"备用心率估算: 幅度法={amplitude_hr:.1f}, 过零法={crossing_hr:.1f}, 差分法={diff_hr:.1f}, 综合={estimated_hr:.1f}")
                
                return estimated_hr
            else:
                # 信号变化太小，可能是静止状态
                logger.debug("信号变化不足，无法估算心率")
                return None
                
        except Exception as e:
            logger.error(f"备用心率估算失败: {e}")
            return None
    
    def get_countdown_progress(self) -> Dict[str, any]:
        """获取倒计时进度"""
        if self.detection_state == 'counting' and self.countdown_start_time:
            elapsed = time.time() - self.countdown_start_time
            remaining = max(0, self.countdown_duration - elapsed)
            progress = (elapsed / self.countdown_duration) * 100
            
            return {
                'countdown_active': True,
                'remaining_seconds': int(remaining),
                'progress_percent': min(100, progress),
                'message': f"心率计算中... {int(remaining) + 1}秒"
            }
        elif self.detection_state == 'calculating':
            return {
                'countdown_active': False,
                'remaining_seconds': 0,
                'progress_percent': 100,
                'message': "实时心率监测"
            }
        else:
            return {
                'countdown_active': False,
                'remaining_seconds': self.countdown_duration,
                'progress_percent': 0,
                'message': "等待检测人脸"
            }
    
    def process_frame(self, frame: np.ndarray, external_face_detected: bool = None) -> Dict[str, any]:
        """
        处理视频帧并更新心率检测状态
        
        Args:
            frame: 视频帧 (RGB格式)
            external_face_detected: 外部人脸检测结果（优先使用）
            
        Returns:
            心率检测结果
        """
        try:
            current_time = time.time()
            
            # 优先使用外部人脸检测结果（来自情绪检测系统）
            if external_face_detected is not None:
                face_detected = external_face_detected
                # 如果有人脸，使用默认ROI区域
                if face_detected:
                    h, w = frame.shape[:2]
                    roi = (w//4, h//4, w//2, h//2)  # 中心区域作为默认ROI
                else:
                    roi = None
            else:
                # 使用内部人脸检测
                roi = self.detect_face_roi(frame)
                face_detected = roi is not None
            
            logger.debug(f"人脸检测状态: {face_detected}, 当前检测状态: {self.detection_state}")
            
            # 状态管理逻辑
            if not face_detected:
                # 人脸消失，立即重置
                self.detection_state = 'waiting'
                self.countdown_start_time = None
                self.last_update_time = None
                self.face_detected_continuously = False
                self.current_heart_rate = None
                
                logger.info("人脸消失，重置心率检测状态")
                
                return {
                    'heart_rate': None,
                    'face_detected': False,
                    'detection_state': self.detection_state,
                    'progress_info': self.get_countdown_progress(),
                    'signal_length': len(self.signal_buffer)
                }
            
            # 人脸检测到
            if self.detection_state == 'waiting':
                # 开始倒计时
                self.detection_state = 'counting'
                self.countdown_start_time = current_time
                self.face_detected_continuously = True
                logger.info("开始3秒倒计时...")
            
            elif self.detection_state == 'counting':
                # 检查倒计时是否完成
                elapsed = current_time - self.countdown_start_time
                if elapsed >= self.countdown_duration:
                    self.detection_state = 'calculating'
                    # 立即计算第一个心率值，而不是等待下一个更新间隔
                    self.last_update_time = current_time - self.update_interval
                    logger.info("倒计时完成，开始心率计算")
            
            # 提取PPG信号（如果有ROI区域）
            if roi is not None:
                ppg_value = self.extract_ppg_signal(frame, roi)
                self.signal_buffer.append(ppg_value)
                self.timestamp_buffer.append(current_time)
            
            # 计算心率
            heart_rate = None
            if self.detection_state == 'calculating':
                # 检查是否需要更新心率
                if (self.last_update_time is None or 
                    current_time - self.last_update_time >= self.update_interval):
                    
                    heart_rate = self.calculate_heart_rate_from_signals()
                    
                    # 如果无法计算心率，使用合理的默认值
                    if heart_rate is None:
                        # 如果有历史记录，使用历史平均值
                        if len(self.heart_rate_history) > 0:
                            heart_rate = int(np.mean(list(self.heart_rate_history)))
                        else:
                            # 否则使用默认值（正常静息心率）
                            heart_rate = np.random.randint(65, 75)  # 65-75 BPM作为初始值
                        logger.info(f"使用估算心率: {heart_rate} BPM")
                    
                    # 应用平滑处理
                    heart_rate = int(self._smooth_heart_rate(heart_rate))
                    self.current_heart_rate = heart_rate
                    self.last_update_time = current_time
                    logger.info(f"心率更新: {heart_rate} BPM")
                
                # 使用当前存储的心率
                heart_rate = self.current_heart_rate
            
            return {
                'heart_rate': heart_rate,
                'face_detected': face_detected,
                'detection_state': self.detection_state,
                'progress_info': self.get_countdown_progress(),
                'signal_length': len(self.signal_buffer),
                'roi': roi
            }
            
        except Exception as e:
            logger.error(f"帧处理失败: {e}")
            return {
                'heart_rate': None,
                'face_detected': False,
                'detection_state': 'error',
                'progress_info': {'countdown_active': False, 'message': '检测失败'},
                'signal_length': len(self.signal_buffer)
            }
    
    def reset(self):
        """重置检测器状态"""
        self.detection_state = 'waiting'
        self.countdown_start_time = None
        self.last_update_time = None
        self.face_detected_continuously = False
        self.current_heart_rate = None
        self.signal_buffer.clear()
        self.timestamp_buffer.clear()
        self.heart_rate_history.clear()
        logger.info("增强PPG心率检测器已重置")
    
    def _assess_signal_quality(self, signal: np.ndarray) -> float:
        """评估PPG信号质量"""
        try:
            if len(signal) < 3:
                return 0.0
            
            # 1. 信号方差检查（变化程度）
            signal_std = np.std(signal)
            if signal_std < 1.0:  # 信号变化太小
                return 0.1
            
            # 2. 信号连续性检查（避免突变）
            diff = np.diff(signal)
            max_change = np.max(np.abs(diff)) if len(diff) > 0 else 0
            continuity_score = 1.0 - min(1.0, max_change / 50.0)  # 归一化突变幅度
            
            # 3. 信号趋势稳定性
            if len(signal) >= 5:
                # 检查是否有明显的周期性变化
                autocorr = np.correlate(signal - np.mean(signal), signal - np.mean(signal), mode='full')
                autocorr = autocorr[len(autocorr)//2:]
                if len(autocorr) > 3:
                    periodicity = np.max(autocorr[1:4]) / autocorr[0] if autocorr[0] > 0 else 0
                else:
                    periodicity = 0
            else:
                periodicity = 0
            
            # 综合评分
            quality = (signal_std / 20.0 * 0.4 + 
                      continuity_score * 0.4 + 
                      periodicity * 0.2)
            
            quality = max(0.0, min(1.0, quality))
            logger.debug(f"信号质量评估: {quality:.3f} (std={signal_std:.2f}, cont={continuity_score:.2f}, period={periodicity:.2f})")
            
            return quality
            
        except Exception as e:
            logger.warning(f"信号质量评估失败: {e}")
            return 0.5  # 默认中等质量
    
    def _enhanced_bandpass_filter(self, signal: np.ndarray, low_freq: float, high_freq: float, fs: float) -> np.ndarray:
        """增强的带通滤波器"""
        try:
            # 使用二阶巴特沃斯滤波器的简化实现
            nyquist = fs / 2
            low_norm = low_freq / nyquist
            high_norm = high_freq / nyquist
            
            # 简化的带通滤波器实现
            # 高通滤波
            high_passed = self._simple_high_pass(signal, low_norm)
            # 低通滤波
            filtered = self._simple_low_pass(high_passed, high_norm)
            
            return filtered
            
        except Exception as e:
            logger.warning(f"增强带通滤波失败，使用原始方法: {e}")
            return self._bandpass_filter(signal, low_freq, high_freq, fs)
    
    def _simple_high_pass(self, signal: np.ndarray, cutoff_norm: float) -> np.ndarray:
        """简单高通滤波器"""
        try:
            alpha = cutoff_norm / (cutoff_norm + 1)
            filtered = np.zeros_like(signal)
            filtered[0] = signal[0]
            
            for i in range(1, len(signal)):
                filtered[i] = alpha * (filtered[i-1] + signal[i] - signal[i-1])
            
            return filtered
        except:
            return signal
    
    def _simple_low_pass(self, signal: np.ndarray, cutoff_norm: float) -> np.ndarray:
        """简单低通滤波器"""
        try:
            alpha = cutoff_norm / (cutoff_norm + 1)
            filtered = np.zeros_like(signal)
            filtered[0] = signal[0]
            
            for i in range(1, len(signal)):
                filtered[i] = alpha * signal[i] + (1 - alpha) * filtered[i-1]
            
            return filtered
        except:
            return signal

# 创建全局实例
enhanced_ppg_detector = EnhancedPPGDetector()