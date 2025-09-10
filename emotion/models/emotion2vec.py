"""
Emotion2Vec语音情绪分析模块
基于阿里巴巴的Emotion2Vec模型
使用FunASR和ModelScope进行语音情绪识别
"""

import numpy as np
import torch
import io
import tempfile
import os
import logging
from typing import Dict, Tuple, Optional
from config import Config

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Emotion2VecAnalyzer:
    """Emotion2Vec语音情绪分析器 - 仅使用真实模型"""

    def __init__(self):
        self.model = None
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.sample_rate = 16000
        self.emotion_labels = ['angry', 'disgusted', 'fearful', 'happy', 'neutral', 'other', 'sad', 'surprised', 'unknown']
        self.is_initialized = False
        self.funasr_available = False
        
        # GPU加速配置
        self.gpu_enabled = torch.cuda.is_available()
        self.use_gpu = self.gpu_enabled
        
        logger.info(f"Emotion2Vec分析器初始化: GPU可用={self.gpu_enabled}, 设备={self.device}")
        
        # GPU内存优化配置
        if self.use_gpu:
            # 设置GPU内存分配策略
            torch.cuda.empty_cache()
            # 启用混合精度推理以节省GPU内存
            self.use_mixed_precision = True
        else:
            self.use_mixed_precision = False

    def initialize(self):
        """初始化模型 - 必须成功加载真实模型"""
        try:
            logger.info("初始化Emotion2Vec语音情绪分析模型...")

            # 导入必要的库
            from funasr import AutoModel
            import os
            
            # 设置离线模式环境变量，避免ModelScope尝试联网
            os.environ['MODELSCOPE_CACHE'] = os.path.abspath('./models/emotion2vec_models')
            os.environ['HF_DATASETS_OFFLINE'] = '1'
            os.environ['TRANSFORMERS_OFFLINE'] = '1'
            
            # 只有在需要下载时才导入snapshot_download
            snapshot_download = None
            try:
                from modelscope.hub.snapshot_download import snapshot_download
            except ImportError:
                logger.warning("无法导入snapshot_download，将仅使用本地模型")

            logger.info("正在下载/加载Emotion2Vec模型...")

            # 确保模型下载到项目本地文件夹（避免占用C盘空间）
            import os
            local_model_cache = os.path.abspath('./models/emotion2vec_models')
            logger.info(f"模型缓存目录: {local_model_cache}")
            
            # 创建本地模型目录
            os.makedirs(local_model_cache, exist_ok=True)
            
            # 检查本地是否已存在模型文件
            potential_model_dirs = [
                os.path.join(local_model_cache, 'iic/emotion2vec_plus_seed'),
                os.path.join(local_model_cache, 'models--iic--emotion2vec_plus_seed', 'snapshots')
            ]
            
            model_dir = None
            for potential_dir in potential_model_dirs:
                if os.path.exists(potential_dir):
                    # 对于snapshots目录，需要找到最新的版本目录
                    if 'snapshots' in potential_dir:
                        if os.path.isdir(potential_dir) and os.listdir(potential_dir):
                            # 取第一个（通常是最新的）快照目录
                            snapshot_dirs = [d for d in os.listdir(potential_dir) if os.path.isdir(os.path.join(potential_dir, d))]
                            if snapshot_dirs:
                                model_dir = os.path.join(potential_dir, snapshot_dirs[0])
                                logger.info(f"找到本地模型快照: {model_dir}")
                                break
                    else:
                        model_dir = potential_dir
                        logger.info(f"找到本地模型目录: {model_dir}")
                        break
            
            # 如果本地没有模型，尝试下载
            if not model_dir or not os.path.exists(model_dir):
                if snapshot_download is None:
                    raise Exception("本地未找到模型文件，且无法导入snapshot_download进行下载")
                    
                logger.info("本地未找到模型文件，尝试下载...")
                try:
                    model_dir = snapshot_download(
                        'iic/emotion2vec_plus_seed',
                        cache_dir=local_model_cache,
                        ignore_file_pattern=[r'.*\.png$', r'.*\.jpg$', r'.*\.jpeg$', r'.*\.gif$', r'.*\.svg$']
                    )
                except Exception as download_error:
                    logger.error(f"模型下载失败: {download_error}")
                    # 如果忽略文件失败，不忽略下载
                    logger.info("重试不忽略文件的下载...")
                    try:
                        model_dir = snapshot_download(
                            'iic/emotion2vec_plus_seed',
                            cache_dir=local_model_cache
                        )
                    except Exception as retry_error:
                        logger.error(f"重试下载也失败: {retry_error}")
                        raise Exception(f"无法下载模型: {retry_error}")
            else:
                logger.info(f"✓ 使用本地模型，跳过网络下载: {model_dir}")
                
            # 验证模型目录是否有效
            if not os.path.exists(model_dir):
                raise Exception(f"模型目录不存在: {model_dir}")
                
            # 验证关键模型文件是否存在
            required_files = ['model.pt', 'config.yaml']
            for required_file in required_files:
                file_path = os.path.join(model_dir, required_file)
                if not os.path.exists(file_path):
                    logger.warning(f"缺少模型文件: {file_path}")
                else:
                    logger.info(f"✓ 发现模型文件: {required_file}")

            logger.info(f"模型文件位置: {model_dir}")

            # GPU状态检查和配置
            if self.use_gpu:
                try:
                    # 清理GPU缓存
                    torch.cuda.empty_cache()
                    
                    # 检查GPU内存
                    gpu_memory_total = torch.cuda.get_device_properties(0).total_memory
                    gpu_memory_allocated = torch.cuda.memory_allocated(0)
                    gpu_memory_cached = torch.cuda.memory_reserved(0)
                    gpu_memory_available = gpu_memory_total - gpu_memory_allocated
                    
                    logger.info(f"GPU内存状态检查:")
                    logger.info(f"  设备: {torch.cuda.get_device_name(0)}")
                    logger.info(f"  总内存: {gpu_memory_total / 1024**3:.2f} GB")
                    logger.info(f"  可用内存: {gpu_memory_available / 1024**3:.2f} GB")
                    
                    # 检查是否有足够的GPU内存加载模型（估计需要至少1GB）
                    required_memory = 1.5 * 1024**3  # 1.5GB
                    if gpu_memory_available < required_memory:
                        logger.warning(f"GPU可用内存不足 ({gpu_memory_available/1024**3:.2f}GB < 1.5GB)")
                        logger.info("回退到CPU模式以避免内存不足")
                        self.use_gpu = False
                        self.device = torch.device('cpu')
                    
                except Exception as gpu_error:
                    logger.warning(f"GPU状态检查失败，回退到CPU: {gpu_error}")
                    self.use_gpu = False
                    self.device = torch.device('cpu')

            # 初始化模型
            device_str = str(self.device)
            logger.info(f"使用设备初始化Emotion2Vec模型: {device_str}")
            
            try:
                # 如果回退到CPU，确保设备字符串正确
                if not self.use_gpu:
                    device_str = 'cpu'
                    self.device = torch.device('cpu')
                
                self.model = AutoModel(
                    model=model_dir,
                    trust_remote_code=True,
                    device=device_str
                )
                
                # GPU优化配置
                if self.use_gpu:
                    try:
                        # 设置模型为evaluation模式以启用优化
                        if hasattr(self.model, 'model'):
                            if hasattr(self.model.model, 'eval'):
                                self.model.model.eval()
                        
                        # 启用CUDNN优化
                        if hasattr(torch.backends, 'cudnn'):
                            torch.backends.cudnn.benchmark = True
                            torch.backends.cudnn.deterministic = False
                        
                        logger.info("✓ GPU优化配置完成")
                        
                    except Exception as gpu_opt_error:
                        logger.warning(f"GPU优化配置失败: {gpu_opt_error}")
                
            except Exception as model_init_error:
                logger.error(f"模型初始化失败: {model_init_error}")
                if self.use_gpu:
                    logger.info("尝试回退到CPU模式")
                    self.use_gpu = False
                    self.device = torch.device('cpu')
                    device_str = str(self.device)
                    
                    self.model = AutoModel(
                        model=model_dir,
                        trust_remote_code=True,
                        device=device_str
                    )
                else:
                    raise model_init_error
            
            # 模型精度配置
            try:
                # GPU模式下不转换模型精度，直接使用float32
                if self.use_gpu:
                    logger.info("GPU模式: 保持模型原始精度(float32)，输入数据将自动转换")
                else:
                    logger.info("CPU模式: 配置模型权重精度...")
                    # 将模型转换为double类型以匹配输入数据
                    if hasattr(self.model, 'model') and hasattr(self.model.model, 'double'):
                        self.model.model.double()
                        logger.info("模型权重转换为double完成")
                    elif hasattr(self.model, 'double'):
                        self.model.double()
                        logger.info("模型权重转换为double完成")
                    else:
                        logger.warning("无法找到模型的double()方法，保持原始精度")
                        
            except Exception as model_convert_error:
                logger.warning(f"模型精度配置失败: {model_convert_error}")
                logger.info("将使用动态精度匹配...")

            self.funasr_available = True
            self.is_initialized = True
            
            logger.info(f"✓ Emotion2Vec模型加载成功!")
            logger.info(f"✓ 使用设备: {self.device}")
            if self.use_gpu:
                logger.info(f"✓ GPU加速已启用 (混合精度: {self.use_mixed_precision})")
            return True

        except ImportError as import_error:
            logger.error(f"FunASR/ModelScope库未正确安装: {import_error}")
            raise Exception("FunASR或ModelScope库未安装，无法使用Emotion2Vec模型")

        except Exception as e:
            logger.error(f"Emotion2Vec模型初始化失败: {e}")
            raise Exception(f"无法加载Emotion2Vec模型: {e}")

    def preprocess_audio(self, audio_bytes: bytes) -> np.ndarray:
        """预处理音频数据为numpy数组 - 使用WebRTC音频处理器"""
        try:
            logger.info(f"预处理WebRTC音频数据，大小: {len(audio_bytes)} bytes")

            # 导入WebRTC音频处理器
            from .audio_processor import webrtc_audio_processor
            
            # 使用专门的WebRTC音频处理器处理音频
            audio = webrtc_audio_processor.process_webrtc_audio(audio_bytes)
            
            if audio is None or len(audio) == 0:
                raise ValueError("WebRTC音频处理失败，返回空数据")
            
            logger.info(f"WebRTC音频处理成功: 长度={len(audio)}")
            
            # 进行后处理以确保音频质量
            audio = webrtc_audio_processor.post_process_audio(audio)
            
            logger.info(f"音频后处理完成: 最终长度={len(audio)}")
            return audio

        except Exception as e:
            logger.error(f"WebRTC音频预处理失败: {e}")
            raise Exception(f"无法处理音频数据: {e}")
    
    def _perform_inference(self, audio: np.ndarray):
        """执行模型推理的内部方法，支持动态精度匹配"""
        try:
            # GPU模式使用float32，CPU模式使用double
            if self.use_gpu:
                # GPU模式：模型是float32，输入也转换为float32
                if audio.dtype != np.float32:
                    audio = audio.astype(np.float32)
                    logger.debug(f"GPU模式：音频数据转换为float32: {audio.dtype}")
                else:
                    logger.debug(f"GPU模式：音频数据已是float32: {audio.dtype}")
                
                # 验证数据类型和形状
                logger.debug(f"GPU推理音频数据: 类型={audio.dtype}, 形状={audio.shape}, 最小值={np.min(audio):.3f}, 最大值={np.max(audio):.3f}")
                
                # GPU模式直接推理
                result = self.model.generate(
                    audio,
                    output_dir=None,
                    granularity="utterance",
                    extract_embedding=False
                )
                
            else:
                # CPU模式：尝试double类型，失败则回退到float32
                try:
                    # 首先尝试double类型
                    if audio.dtype != np.float64:
                        audio = audio.astype(np.float64)
                        logger.debug(f"CPU模式：音频数据转换为double: {audio.dtype}")
                    else:
                        logger.debug(f"CPU模式：音频数据已是double: {audio.dtype}")
                    
                    # 验证数据类型和形状
                    logger.debug(f"CPU推理音频数据: 类型={audio.dtype}, 形状={audio.shape}, 最小值={np.min(audio):.3f}, 最大值={np.max(audio):.3f}")
                    
                    result = self.model.generate(
                        audio,
                        output_dir=None,
                        granularity="utterance",
                        extract_embedding=False
                    )
                    
                except RuntimeError as runtime_error:
                    if ("expected scalar type Double but found Float" in str(runtime_error) or
                        "expected scalar type Float but found Double" in str(runtime_error)):
                        logger.warning("精度不匹配，转换为float32重试...")
                        # 转换为float32重试
                        audio = audio.astype(np.float32)
                        logger.debug(f"重试音频数据类型: {audio.dtype}")
                        
                        result = self.model.generate(
                            audio,
                            output_dir=None,
                            granularity="utterance",
                            extract_embedding=False
                        )
                    else:
                        raise runtime_error
            
            return result
            
        except Exception as e:
            logger.error(f"模型推理失败: {e}")
            raise e

    def analyze(self, audio_bytes: bytes) -> Dict[str, any]:
        """分析音频情绪 - 使用真实模型并直接输出原始结果"""
        try:
            if not self.is_initialized:
                logger.error("Emotion2Vec模型未初始化")
                raise Exception("Emotion2Vec模型未初始化，请先运行initialize()")

            if not self.funasr_available or not self.model:
                logger.error("Emotion2Vec模型不可用")
                raise Exception("Emotion2Vec模型不可用")

            if self.use_gpu:
                logger.info("开始使用Emotion2Vec GPU加速分析语音情绪...")
            else:
                logger.info("开始使用Emotion2Vec CPU模式分析语音情绪...")

            # 预处理音频
            audio = self.preprocess_audio(audio_bytes)
            logger.debug(f"音频预处理完成，长度: {len(audio)}, 原始类型: {audio.dtype}")
            
            # GPU加速推理
            if self.use_gpu:
                try:
                    # 清理GPU缓存确保有足够内存
                    torch.cuda.empty_cache()
                    
                    with torch.cuda.device(0):
                        # 使用混合精度推理优化GPU内存使用
                        if self.use_mixed_precision:
                            with torch.cuda.amp.autocast():
                                result = self._perform_inference(audio)
                        else:
                            result = self._perform_inference(audio)
                        
                        logger.debug("GPU推理完成")
                
                except Exception as gpu_error:
                    logger.warning(f"GPU推理失败，回退到CPU: {gpu_error}")
                    # 回退到CPU模式
                    self.use_gpu = False
                    self.device = torch.device('cpu')
                    result = self._perform_inference(audio)
                    
            else:
                # CPU推理
                result = self._perform_inference(audio)
            logger.debug(f"模型推理完成，结果数量: {len(result) if result else 0}")

            if not result or len(result) == 0:
                raise Exception("Emotion2Vec模型返回空结果")

            # 解析模型结果
            emotion_result = result[0]
            logger.debug(f"模型原始结果: {emotion_result}")

            # 提取情绪标签和分数
            if 'labels' in emotion_result and 'scores' in emotion_result:
                labels = emotion_result['labels']
                scores = emotion_result['scores']
                logger.debug(f"原始标签: {labels}")
                logger.debug(f"原始分数: {scores}")
            else:
                raise Exception("模型结果中未找到情绪信息")

            # 找到最高分数及其标签
            max_score_idx = scores.index(max(scores))
            dominant_raw_label = labels[max_score_idx]
            max_raw_score = scores[max_score_idx]
            logger.debug(f"最高分情绪(原始): {dominant_raw_label} -> {max_raw_score}")

            # 动态映射情绪标签 - 支持9类情绪
            emotions = {
                'angry': 0.0, 'disgusted': 0.0, 'fearful': 0.0, 'happy': 0.0,
                'neutral': 0.0, 'other': 0.0, 'sad': 0.0, 'surprised': 0.0, 'unknown': 0.0
            }

            logger.debug("开始动态映射情绪字典...")

            # emotion2vec_seed模型输出的标签索引映射
            # 0: angry, 1: disgusted, 2: fearful, 3: happy, 4: neutral, 5: other, 6: sad, 7: surprised, 8: unknown
            emotion_index_map = {
                0: 'angry',
                1: 'disgusted',
                2: 'fearful',
                3: 'happy',
                4: 'neutral',
                5: 'other',
                6: 'sad',
                7: 'surprised',
                8: 'unknown'
            }

            # 直接使用索引映射分数
            for i, score in enumerate(scores):
                if i in emotion_index_map:
                    emotion_key = emotion_index_map[i]
                    emotions[emotion_key] = float(score)
                    logger.debug(f"映射索引 {i} -> {emotion_key} = {score}")

            # 获取主导情绪 - 使用最高分数的索引
            max_score_idx = scores.index(max(scores))
            dominant_emotion = emotion_index_map.get(max_score_idx, 'neutral')
                
            logger.debug(f"主导情绪映射 '{dominant_raw_label}' -> {dominant_emotion}")
            
            logger.debug(f"最终主导情绪: {dominant_emotion}")
            logger.debug(f"最终情绪分布: {emotions}")

            final_result = {
                'emotions': emotions,
                'dominant_emotion': dominant_emotion, 
                'confidence': float(max_raw_score),
                'model': 'emotion2vec_plus_seed',
                'audio_duration': len(audio) / self.sample_rate,
                'audio_length': len(audio),
                'analysis_type': 'audio_emotion', 
                'analysis_quality': 'high',
                'using_fake_data': False,
                'raw_result': emotion_result
            }

            logger.info(f"Emotion2Vec分析完成: {dominant_emotion} (置信度: {max_raw_score:.3f})")
            return final_result

        except Exception as e:
            logger.error(f"Emotion2Vec语音分析失败: {e}")
            raise Exception(f"语音情绪分析失败: {e}")

    def get_model_info(self) -> Dict[str, any]:
        """获取模型信息"""
        return {
            'model_name': 'Emotion2Vec Plus Seed',
            'model_id': 'iic/emotion2vec_plus_seed',
            'version': 'latest',
            'device': str(self.device),
            'gpu_enabled': self.use_gpu,
            'mixed_precision': self.use_mixed_precision,
            'sample_rate': self.sample_rate,
            'emotion_labels': self.emotion_labels,
            'is_initialized': self.is_initialized,
            'funasr_available': self.funasr_available,
            'description': '阿里巴巴Emotion2Vec种子语音情绪识别模型 - 支持9类情绪和GPU加速'
        }
    
    def enable_gpu(self):
        """启用GPU加速"""
        if self.gpu_enabled:
            self.use_gpu = True
            self.device = torch.device('cuda')
            logger.info("✓ Emotion2Vec GPU加速已启用")
        else:
            logger.warning("GPU不可用，无法启用GPU加速")
    
    def disable_gpu(self):
        """禁用GPU加速，强制使用CPU"""
        self.use_gpu = False
        self.device = torch.device('cpu')
        logger.info("✓ Emotion2Vec GPU加速已禁用，使用CPU模式")
    
    def get_gpu_status(self):
        """获取GPU状态信息"""
        status = {
            'gpu_available': self.gpu_enabled,
            'gpu_enabled': self.use_gpu,
            'device': str(self.device),
            'mixed_precision': self.use_mixed_precision,
            'gpu_memory_info': None
        }
        
        if self.gpu_enabled:
            try:
                gpu_props = torch.cuda.get_device_properties(0)
                gpu_memory_total = gpu_props.total_memory
                gpu_memory_allocated = torch.cuda.memory_allocated(0)
                gpu_memory_cached = torch.cuda.memory_reserved(0)
                
                status['gpu_memory_info'] = {
                    'device_name': gpu_props.name,
                    'total_memory_gb': gpu_memory_total / 1024**3,
                    'allocated_memory_gb': gpu_memory_allocated / 1024**3,
                    'cached_memory_gb': gpu_memory_cached / 1024**3,
                    'available_memory_gb': (gpu_memory_total - gpu_memory_allocated) / 1024**3
                }
            except Exception as e:
                status['gpu_memory_error'] = str(e)
        
        return status
    
    def optimize_gpu_memory(self):
        """优化GPU内存使用"""
        if self.use_gpu and self.gpu_enabled:
            try:
                # 清理GPU缓存
                torch.cuda.empty_cache()
                
                # 获取内存使用情况
                gpu_memory_allocated = torch.cuda.memory_allocated(0)
                gpu_memory_cached = torch.cuda.memory_reserved(0)
                
                logger.info(f"Emotion2Vec GPU内存优化完成:")
                logger.info(f"  已分配: {gpu_memory_allocated / 1024**3:.2f} GB")
                logger.info(f"  已缓存: {gpu_memory_cached / 1024**3:.2f} GB")
                
                return True
            except Exception as e:
                logger.error(f"Emotion2Vec GPU内存优化失败: {e}")
                return False
        else:
            logger.info("未使用GPU，无需优化GPU内存")
            return True

# 全局实例
emotion2vec_analyzer = Emotion2VecAnalyzer()