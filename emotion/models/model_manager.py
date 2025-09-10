"""
延迟加载模型管理器
避免启动时立即加载所有AI模型，提升启动速度
支持GPU加速和内存管理
"""

import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class ModelManager:
    """延迟加载模型管理器"""
    
    def __init__(self):
        self._emotion2vec_analyzer = None
        self._deepface_analyzer = None
        self._video_processor = None
        self._is_loading = False
        
        # GPU管理器
        self._gpu_manager = None
        self._gpu_optimization_enabled = True
    
    def get_emotion2vec_analyzer(self):
        """获取语音情绪分析器（延迟加载）"""
        if self._emotion2vec_analyzer is None:
            if not self._is_loading:
                self._is_loading = True
                try:
                    logger.info("首次使用，正在加载Emotion2Vec模型...")
                    from .emotion2vec import emotion2vec_analyzer
                    self._emotion2vec_analyzer = emotion2vec_analyzer
                    
                    # 确保分析器在首次使用时被初始化
                    if not self._emotion2vec_analyzer.is_initialized:
                        logger.info("初始化Emotion2Vec分析器...")
                        self._emotion2vec_analyzer.initialize()
                        
                    logger.info("✓ Emotion2Vec模型加载完成")
                except Exception as e:
                    logger.error(f"Emotion2Vec模型加载失败: {e}")
                    # 返回备用分析器
                    from .emotion2vec import Emotion2VecAnalyzer
                    self._emotion2vec_analyzer = Emotion2VecAnalyzer()
                    # 也尝试初始化备用分析器
                    try:
                        self._emotion2vec_analyzer.initialize()
                    except:
                        logger.warning("备用分析器也初始化失败，将使用未初始化的分析器")
                finally:
                    self._is_loading = False
        return self._emotion2vec_analyzer
    
    def get_deepface_analyzer(self):
        """获取面部情绪分析器（延迟加载）"""
        if self._deepface_analyzer is None:
            if not self._is_loading:
                self._is_loading = True
                try:
                    logger.info("首次使用，正在加载DeepFace模型...")
                    from .deepface_analyzer import deepface_analyzer
                    self._deepface_analyzer = deepface_analyzer
                    
                    # 确保分析器在首次使用时被初始化
                    if hasattr(self._deepface_analyzer, 'initialize') and not getattr(self._deepface_analyzer, 'is_initialized', False):
                        logger.info("初始化DeepFace分析器...")
                        self._deepface_analyzer.initialize()
                        
                    logger.info("✓ DeepFace模型加载完成")
                except Exception as e:
                    logger.error(f"DeepFace模型加载失败: {e}")
                    # 返回备用分析器
                    from .deepface_analyzer import DeepFaceAnalyzer
                    self._deepface_analyzer = DeepFaceAnalyzer()
                    # 也尝试初始化备用分析器
                    try:
                        if hasattr(self._deepface_analyzer, 'initialize'):
                            self._deepface_analyzer.initialize()
                    except:
                        logger.warning("备用DeepFace分析器也初始化失败")
                finally:
                    self._is_loading = False
        return self._deepface_analyzer
    
    def get_video_processor(self):
        """获取视频处理器（延迟加载）"""
        if self._video_processor is None:
            try:
                logger.info("首次使用，正在加载视频处理器...")
                from .video_processor import video_processor
                self._video_processor = video_processor
                logger.info("✓ 视频处理器加载完成")
            except Exception as e:
                logger.error(f"视频处理器加载失败: {e}")
                # 返回备用处理器
                from .video_processor import VideoProcessor
                self._video_processor = VideoProcessor()
        return self._video_processor
    
    def preload_models(self):
        """预加载所有模型（可选，用于首次完整加载）"""
        logger.info("开始预加载所有AI模型...")
        
        try:
            # 预加载所有模型
            emotion2vec = self.get_emotion2vec_analyzer()
            deepface = self.get_deepface_analyzer() 
            video_proc = self.get_video_processor()
            
            # 初始化模型
            if hasattr(emotion2vec, 'initialize'):
                emotion2vec.initialize()
            if hasattr(deepface, 'initialize'):
                deepface.initialize()
                
            logger.info("✓ 所有模型预加载完成")
            return True
        except Exception as e:
            logger.error(f"模型预加载失败: {e}")
            return False
    
    def is_models_loaded(self):
        """检查模型是否已加载"""
        return (self._emotion2vec_analyzer is not None and 
                self._deepface_analyzer is not None and 
                self._video_processor is not None)
    
    def get_gpu_manager(self):
        """获取GPU管理器"""
        if self._gpu_manager is None:
            try:
                from utils.gpu_manager import gpu_manager
                self._gpu_manager = gpu_manager
                logger.info("✓ GPU管理器加载完成")
            except Exception as e:
                logger.warning(f"GPU管理器加载失败: {e}")
        return self._gpu_manager
    
    def get_system_status(self) -> Dict[str, Any]:
        """获取系统状态信息"""
        gpu_manager = self.get_gpu_manager()
        
        status = {
            'models': {
                'emotion2vec_loaded': self._emotion2vec_analyzer is not None,
                'deepface_loaded': self._deepface_analyzer is not None,
                'video_processor_loaded': self._video_processor is not None,
                'all_loaded': self.is_models_loaded()
            },
            'gpu': gpu_manager.get_gpu_status() if gpu_manager else {'gpu_available': False},
            'optimization_enabled': self._gpu_optimization_enabled
        }
        
        # 添加模型具体状态
        if self._emotion2vec_analyzer:
            status['models']['emotion2vec_info'] = self._emotion2vec_analyzer.get_model_info()
            status['models']['emotion2vec_gpu_status'] = self._emotion2vec_analyzer.get_gpu_status()
        
        if self._deepface_analyzer:
            status['models']['deepface_info'] = self._deepface_analyzer.get_model_info()
            status['models']['deepface_gpu_status'] = self._deepface_analyzer.get_gpu_status()
        
        return status
    
    def optimize_gpu_memory(self):
        """优化所有模型的GPU内存使用"""
        gpu_manager = self.get_gpu_manager()
        optimized = []
        
        try:
            # 优化GPU管理器内存
            if gpu_manager and gpu_manager.optimize_memory():
                optimized.append('gpu_manager')
            
            # 优化DeepFace模型内存
            if self._deepface_analyzer and hasattr(self._deepface_analyzer, 'optimize_gpu_memory'):
                if self._deepface_analyzer.optimize_gpu_memory():
                    optimized.append('deepface')
            
            # 优化Emotion2Vec模型内存
            if self._emotion2vec_analyzer and hasattr(self._emotion2vec_analyzer, 'optimize_gpu_memory'):
                if self._emotion2vec_analyzer.optimize_gpu_memory():
                    optimized.append('emotion2vec')
            
            logger.info(f"GPU内存优化完成，已优化: {', '.join(optimized)}")
            return True
            
        except Exception as e:
            logger.error(f"GPU内存优化失败: {e}")
            return False
    
    def enable_gpu_optimization(self):
        """启用GPU优化"""
        self._gpu_optimization_enabled = True
        
        # 为已加载的模型启用GPU
        if self._deepface_analyzer and hasattr(self._deepface_analyzer, 'enable_gpu'):
            self._deepface_analyzer.enable_gpu()
        
        if self._emotion2vec_analyzer and hasattr(self._emotion2vec_analyzer, 'enable_gpu'):
            self._emotion2vec_analyzer.enable_gpu()
        
        # 设置GPU优化
        gpu_manager = self.get_gpu_manager()
        if gpu_manager:
            gpu_manager.setup_optimizations()
        
        logger.info("✓ GPU优化已启用")
    
    def disable_gpu_optimization(self):
        """禁用GPU优化，强制使用CPU"""
        self._gpu_optimization_enabled = False
        
        # 为已加载的模型禁用GPU
        if self._deepface_analyzer and hasattr(self._deepface_analyzer, 'disable_gpu'):
            self._deepface_analyzer.disable_gpu()
        
        if self._emotion2vec_analyzer and hasattr(self._emotion2vec_analyzer, 'disable_gpu'):
            self._emotion2vec_analyzer.disable_gpu()
        
        logger.info("✓ GPU优化已禁用，使用CPU模式")
    
    def monitor_performance(self):
        """监控系统性能"""
        gpu_manager = self.get_gpu_manager()
        
        if gpu_manager:
            # 监控GPU内存使用
            if not gpu_manager.monitor_memory_usage():
                logger.warning("GPU内存使用率过高，建议优化")
                # 自动优化内存
                self.optimize_gpu_memory()

# 创建全局模型管理器实例
model_manager = ModelManager()