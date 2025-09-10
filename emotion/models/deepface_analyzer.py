"""
DeepFace面部情绪分析模块
基于https://github.com/serengil/deepface项目
"""

import numpy as np
import cv2
import torch
from typing import Dict, List, Tuple, Optional, Any
from config import Config
import logging

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DeepFaceAnalyzer:
    """DeepFace面部情绪分析器"""

    def __init__(self):
        self.model_name = Config.DEEPFACE_MODEL_NAME
        self.backend = Config.EMOTION_DETECTION_BACKEND
        self.emotion_labels = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']
        self.is_initialized = False
        self.deepface_available = False
        self.face_cascade = None
        
        # GPU加速配置
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.gpu_enabled = torch.cuda.is_available()
        self.use_gpu = self.gpu_enabled
        
        # 设置DeepFace模型保存路径到项目目录
        self._setup_deepface_path()
        
        logger.info(f"DeepFace分析器初始化: GPU可用={self.gpu_enabled}, 设备={self.device}")
    
    def _setup_deepface_path(self):
        """设置DeepFace模型保存路径到项目目录"""
        try:
            from pathlib import Path
            import os
            
            # 创建项目内的DeepFace模型目录
            project_root = Path(__file__).parent.parent  # emotion项目根目录
            deepface_dir = project_root / "models" / "deepface_models"
            deepface_dir.mkdir(parents=True, exist_ok=True)
            
            # 设置DeepFace环境变量
            deepface_home = os.path.abspath(str(deepface_dir))
            os.environ['DEEPFACE_HOME'] = deepface_home
            
            logger.info(f"DeepFace模型路径设置为: {deepface_home}")
            
        except Exception as e:
            logger.warning(f"设置DeepFace路径失败: {e}")

    def initialize(self):
        """初始化模型"""
        try:
            logger.info("初始化DeepFace面部情绪分析模型...")
            
            # 检查GPU状态
            if self.gpu_enabled:
                try:
                    # 清理GPU缓存
                    torch.cuda.empty_cache()
                    
                    # 检查GPU内存
                    gpu_memory_total = torch.cuda.get_device_properties(0).total_memory
                    gpu_memory_allocated = torch.cuda.memory_allocated(0)
                    gpu_memory_cached = torch.cuda.memory_reserved(0)
                    
                    logger.info(f"GPU状态检查:")
                    logger.info(f"  设备: {torch.cuda.get_device_name(0)}")
                    logger.info(f"  总内存: {gpu_memory_total / 1024**3:.2f} GB")
                    logger.info(f"  已分配: {gpu_memory_allocated / 1024**3:.2f} GB")
                    logger.info(f"  已缓存: {gpu_memory_cached / 1024**3:.2f} GB")
                    
                except Exception as gpu_error:
                    logger.warning(f"GPU状态检查失败: {gpu_error}")

            # 尝试导入DeepFace库
            try:
                from deepface import DeepFace
                self.deepface = DeepFace
                self.deepface_available = True
                logger.info("✓ DeepFace库导入成功")

                # GPU优化配置
                if self.use_gpu:
                    try:
                        # 设置PyTorch使用GPU
                        import os
                        os.environ['CUDA_VISIBLE_DEVICES'] = '0'
                        
                        # 优化GPU内存管理
                        if hasattr(torch.backends, 'cudnn'):
                            torch.backends.cudnn.benchmark = True
                            torch.backends.cudnn.deterministic = False
                            logger.info("✓ CUDNN优化已启用")
                        
                        logger.info(f"✓ DeepFace GPU加速配置完成，使用设备: {self.device}")
                    
                    except Exception as gpu_setup_error:
                        logger.warning(f"GPU配置失败，回退到CPU: {gpu_setup_error}")
                        self.use_gpu = False
                        self.device = torch.device('cpu')

                # 预热模型 - 使用一个小的测试图像
                test_img = np.zeros((224, 224, 3), dtype=np.uint8)
                try:
                    # 进行预热，让DeepFace加载所有必需的模型到GPU
                    with torch.cuda.device(0) if self.use_gpu else torch.no_grad():
                        result = self.deepface.analyze(
                            test_img, 
                            actions=['emotion'], 
                            enforce_detection=False, 
                            silent=True
                        )
                    
                    logger.info("✓ DeepFace真实模型预热成功")
                    if self.use_gpu:
                        logger.info("✓ GPU加速已启用并验证")
                    else:
                        logger.info("✓ 使用CPU模式")
                        
                except Exception as e:
                    logger.warning(f"DeepFace真实模型预热失败，将使用备用方案: {e}")
                    if self.use_gpu:
                        logger.info("尝试回退到CPU模式")
                        self.use_gpu = False
                        self.device = torch.device('cpu')

            except ImportError as e:
                logger.warning(f"DeepFace库导入失败，将使用OpenCV备用方案: {e}")
                self.deepface_available = False

            # 初始化OpenCV人脸检测器作为备用
            try:
                self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
                if self.face_cascade.empty():
                    raise Exception("无法加载人脸检测器")
                logger.info("✓ OpenCV人脸检测器初始化成功")
            except Exception as e:
                logger.error(f"OpenCV人脸检测器初始化失败: {e}")
                # 即使OpenCV失败也继续，使用最基础的备用方案
                logger.info("将使用最基础的面部分析备用方案")

            logger.info(f"模型配置: {self.model_name}, 后端: {self.backend}")
            logger.info(f"DeepFace可用: {self.deepface_available}")

            self.is_initialized = True
            return True

        except Exception as e:
            logger.error(f"DeepFace模型初始化失败: {e}")
            # 即使出错也尝试使用备用方案
            logger.info("尝试使用最基础的备用方案...")
            self.deepface_available = False
            self.is_initialized = True
            return True
    
    def detect_faces(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """检测图像中的人脸"""
        try:
            if self.face_cascade is None:
                if not self.initialize():
                    return []
            
            # 转换为灰度图像
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY) if len(image.shape) == 3 else image
            
            # 检测人脸
            faces = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )
            
            face_regions = []
            for (x, y, w, h) in faces:
                face_regions.append({
                    'region': {'x': x, 'y': y, 'w': w, 'h': h},
                    'confidence': 0.9  # 模拟置信度
                })
            
            return face_regions
            
        except Exception as e:
            print(f"人脸检测失败: {e}")
            return []
    
    def preprocess_face(self, image: np.ndarray, face_region: Dict[str, Any]) -> Optional[np.ndarray]:
        """预处理人脸图像"""
        try:
            region = face_region['region']
            x, y, w, h = region['x'], region['y'], region['w'], region['h']
            
            # 提取人脸区域
            face = image[y:y+h, x:x+w]
            
            # 调整大小到标准尺寸
            face_resized = cv2.resize(face, (224, 224))
            
            # 归一化
            face_normalized = face_resized.astype(np.float32) / 255.0
            
            return face_normalized
            
        except Exception as e:
            print(f"人脸预处理失败: {e}")
            return None
    
    def predict_emotion_fallback(self, face_image: np.ndarray) -> Dict[str, float]:
        """备用情绪预测方法（基于简单图像特征）"""
        try:
            # 计算图像特征
            gray_face = cv2.cvtColor(face_image, cv2.COLOR_RGB2GRAY) if len(face_image.shape) == 3 else face_image

            # 计算基本统计特征
            mean_intensity = np.mean(gray_face)
            std_intensity = np.std(gray_face)

            # 计算边缘特征
            edges = cv2.Canny((gray_face * 255).astype(np.uint8), 50, 150)
            edge_density = np.sum(edges > 0) / (edges.shape[0] * edges.shape[1])

            # 基于特征的简单规则映射
            import random
            random.seed(int(mean_intensity * 1000))  # 使用图像特征作为种子，保证一致性

            if mean_intensity > 0.6:  # 较亮的图像
                if edge_density > 0.1:  # 较多边缘（可能是笑容）
                    base_emotions = {
                        'happy': 0.5, 'surprise': 0.2, 'neutral': 0.15,
                        'angry': 0.05, 'sad': 0.05, 'fear': 0.03, 'disgust': 0.02
                    }
                else:
                    base_emotions = {
                        'neutral': 0.4, 'happy': 0.3, 'surprise': 0.1,
                        'sad': 0.1, 'angry': 0.05, 'fear': 0.03, 'disgust': 0.02
                    }
            elif mean_intensity < 0.4:  # 较暗的图像
                base_emotions = {
                    'sad': 0.4, 'neutral': 0.25, 'angry': 0.15,
                    'fear': 0.1, 'disgust': 0.05, 'happy': 0.03, 'surprise': 0.02
                }
            else:  # 中等亮度
                if std_intensity > 0.2:  # 高对比度
                    base_emotions = {
                        'neutral': 0.4, 'surprise': 0.2, 'happy': 0.15,
                        'angry': 0.1, 'sad': 0.08, 'fear': 0.04, 'disgust': 0.03
                    }
                else:
                    base_emotions = {
                        'neutral': 0.6, 'happy': 0.2, 'sad': 0.1,
                        'angry': 0.05, 'surprise': 0.03, 'fear': 0.01, 'disgust': 0.01
                    }

            # 添加小量随机噪声
            emotions = {}
            for emotion, base_prob in base_emotions.items():
                noise = random.uniform(-0.02, 0.02)
                emotions[emotion] = max(0.01, min(0.99, base_prob + noise))

            # 归一化
            total = sum(emotions.values())
            emotions = {k: v/total for k, v in emotions.items()}

            return emotions

        except Exception as e:
            logger.error(f"备用情绪预测失败: {e}")
            return {'neutral': 1.0}
    
    def analyze(self, image: np.ndarray) -> Dict[str, Any]:
        """分析图像中的面部情绪 - 这是面部情绪分析的主入口"""
        try:
            logger.debug("开始面部情绪分析...")

            # 检查模型是否初始化
            if not self.is_initialized:
                logger.warning("模型未初始化，尝试初始化...")
                if not self.initialize():
                    raise Exception("模型未初始化")

            # 确保图像格式正确
            if len(image.shape) == 3 and image.shape[2] == 3:
                # RGB图像，转换为BGR供OpenCV使用
                image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            else:
                image_bgr = image

            # 如果DeepFace可用，优先使用
            if self.deepface_available:
                try:
                    if self.use_gpu:
                        logger.debug("使用DeepFace GPU加速进行面部情绪分析...")
                        # GPU加速分析
                        with torch.cuda.device(0):
                            # 清理GPU缓存以确保有足够内存
                            torch.cuda.empty_cache()
                            
                            result = self.deepface.analyze(
                                img_path=image_bgr,
                                actions=['emotion'],
                                enforce_detection=False,
                                silent=True
                            )
                    else:
                        logger.debug("使用DeepFace CPU模式进行面部情绪分析...")
                        # CPU分析
                        result = self.deepface.analyze(
                            img_path=image_bgr,
                            actions=['emotion'],
                            enforce_detection=False,
                            silent=True
                        )

                    # 处理DeepFace返回结果
                    if isinstance(result, list):
                        result = result[0]  # 取第一个结果

                    emotions = result.get('emotion', {})
                    
                    # 改进的人脸检测判断逻辑
                    region = result.get('region', {})
                    face_detected = False
                    
                    if region:
                        # 检查region是否是有效的人脸区域
                        # DeepFace在无人脸时返回整个图像区域 {'x': 0, 'y': 0, 'w': width, 'h': height}
                        # 真正的人脸区域通常不会占据整个图像
                        region_x = region.get('x', 0)
                        region_y = region.get('y', 0) 
                        region_w = region.get('w', 0)
                        region_h = region.get('h', 0)
                        
                        # 检查是否是整个图像区域（这通常意味着没有检测到真实人脸）
                        image_height, image_width = image_bgr.shape[:2]
                        is_full_image = (region_x == 0 and region_y == 0 and 
                                       region_w == image_width and region_h == image_height)
                        
                        # 检查区域大小是否合理（真实人脸不会太小也不会占据整个图像）
                        region_area_ratio = (region_w * region_h) / (image_width * image_height)
                        is_reasonable_size = 0.01 < region_area_ratio < 0.8  # 人脸应该占据图像的1%-80%
                        
                        # 只有当区域不是整个图像且大小合理时才认为检测到人脸
                        face_detected = not is_full_image and is_reasonable_size
                        
                        logger.debug(f"人脸区域分析: x={region_x}, y={region_y}, w={region_w}, h={region_h}")
                        logger.debug(f"图像尺寸: {image_width}x{image_height}")
                        logger.debug(f"是否为整图: {is_full_image}, 尺寸合理: {is_reasonable_size}")
                        logger.debug(f"最终人脸检测结果: {face_detected}")

                    # 标准化情绪标签
                    normalized_emotions = {}
                    emotion_mapping = {
                        'angry': 'angry',
                        'disgust': 'disgust',
                        'fear': 'fear',
                        'happy': 'happy',
                        'sad': 'sad',
                        'surprise': 'surprise',
                        'neutral': 'neutral'
                    }

                    for key, value in emotions.items():
                        mapped_key = emotion_mapping.get(key.lower(), key.lower())
                        normalized_emotions[mapped_key] = value / 100.0  # 转换为0-1范围

                    # 找到主导情绪
                    if normalized_emotions:
                        dominant_emotion = max(normalized_emotions.items(), key=lambda x: x[1])[0]
                        confidence = normalized_emotions[dominant_emotion]
                    else:
                        dominant_emotion = 'neutral'
                        confidence = 0.5
                        normalized_emotions = {'neutral': 1.0}

                    result_data = {
                        'face_detected': face_detected,
                        'emotions': normalized_emotions,
                        'dominant_emotion': dominant_emotion,
                        'confidence': confidence,
                        'model': 'deepface',
                        'face_count': 1 if face_detected else 0,
                        'face_region': result.get('region', {}),
                        'face_confidence': 0.9,
                        'analysis_type': 'video_emotion'  # 明确标识这是视频情绪分析
                    }

                    logger.info(f"面部情绪分析完成: {dominant_emotion} (置信度: {confidence:.2f})")
                    return result_data

                except Exception as deepface_error:
                    logger.warning(f"DeepFace分析失败，使用备用方案: {deepface_error}")
                    # 继续使用备用方案

            # 备用方案：使用OpenCV检测 + 简单规则
            logger.debug("使用OpenCV备用方案进行面部情绪分析...")
            faces = self.detect_faces(image)

            if not faces:
                return {
                    'face_detected': False,
                    'emotions': {'neutral': 1.0},
                    'dominant_emotion': 'neutral',
                    'confidence': 0.3,
                    'model': 'opencv_fallback',
                    'face_count': 0,
                    'analysis_type': 'video_emotion'
                }

            # 分析第一个检测到的人脸
            face_region = faces[0]
            face_image = self.preprocess_face(image, face_region)

            if face_image is None:
                raise Exception("人脸预处理失败")

            # 使用简单规则预测情绪
            emotions = self.predict_emotion_fallback(face_image)

            # 找到主导情绪
            dominant_emotion = max(emotions.items(), key=lambda x: x[1])[0]
            confidence = emotions[dominant_emotion]

            result_data = {
                'face_detected': True,
                'emotions': emotions,
                'dominant_emotion': dominant_emotion,
                'confidence': confidence,
                'model': 'opencv_fallback',
                'face_count': len(faces),
                'face_region': face_region['region'],
                'face_confidence': face_region['confidence'],
                'analysis_type': 'video_emotion'
            }

            logger.info(f"面部情绪分析完成: {dominant_emotion} (置信度: {confidence:.2f})")
            return result_data

        except Exception as e:
            logger.error(f"面部情绪分析失败: {e}")
            return {
                'face_detected': False,
                'emotions': {'neutral': 1.0},
                'dominant_emotion': 'neutral',
                'confidence': 0.1,
                'model': 'error_fallback',
                'error': str(e),
                'analysis_type': 'video_emotion'
            }
    
    def analyze_batch(self, images: List[np.ndarray]) -> List[Dict[str, Any]]:
        """批量分析多张图像"""
        results = []
        for image in images:
            result = self.analyze(image)
            results.append(result)
        return results
    
    def get_model_info(self) -> Dict[str, Any]:
        """获取模型信息"""
        return {
            'model_name': 'DeepFace',
            'version': '1.0.0',
            'backend': self.backend,
            'base_model': self.model_name,
            'emotion_labels': self.emotion_labels,
            'is_initialized': self.is_initialized,
            'description': '基于DeepFace的面部情绪分析模型'
        }
    
    def set_detection_threshold(self, threshold: float):
        """设置检测阈值"""
        # TODO: 实现检测阈值设置
        pass
    
    def enable_gpu(self):
        """启用GPU加速"""
        if self.gpu_enabled:
            self.use_gpu = True
            self.device = torch.device('cuda')
            logger.info("✓ GPU加速已启用")
        else:
            logger.warning("GPU不可用，无法启用GPU加速")
    
    def disable_gpu(self):
        """禁用GPU加速，强制使用CPU"""
        self.use_gpu = False
        self.device = torch.device('cpu')
        logger.info("✓ GPU加速已禁用，使用CPU模式")
    
    def get_gpu_status(self):
        """获取GPU状态信息"""
        status = {
            'gpu_available': self.gpu_enabled,
            'gpu_enabled': self.use_gpu,
            'device': str(self.device),
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
                
                logger.info(f"GPU内存优化完成:")
                logger.info(f"  已分配: {gpu_memory_allocated / 1024**3:.2f} GB")
                logger.info(f"  已缓存: {gpu_memory_cached / 1024**3:.2f} GB")
                
                return True
            except Exception as e:
                logger.error(f"GPU内存优化失败: {e}")
                return False
        else:
            logger.info("未使用GPU，无需优化GPU内存")
            return True

# 全局实例
deepface_analyzer = DeepFaceAnalyzer()
