"""
GPU管理器
提供统一的GPU检测、监控和内存管理功能
"""

import torch
import logging
from typing import Dict, Any, Optional
from config import Config

logger = logging.getLogger(__name__)

class GPUManager:
    """GPU管理器"""
    
    def __init__(self):
        self.gpu_available = torch.cuda.is_available()
        self.device_count = torch.cuda.device_count() if self.gpu_available else 0
        self.current_device = 0 if self.gpu_available else None
        self.memory_threshold_gb = 1.0  # 最小GPU内存要求 (GB)
        
        if self.gpu_available:
            logger.info(f"GPU管理器初始化完成:")
            logger.info(f"  GPU可用: {self.gpu_available}")
            logger.info(f"  GPU数量: {self.device_count}")
            for i in range(self.device_count):
                gpu_name = torch.cuda.get_device_name(i)
                gpu_memory = torch.cuda.get_device_properties(i).total_memory / 1024**3
                logger.info(f"  GPU {i}: {gpu_name} ({gpu_memory:.1f} GB)")
        else:
            logger.info("未检测到可用的GPU设备，将使用CPU模式")
    
    def is_gpu_available(self) -> bool:
        """检查GPU是否可用"""
        return self.gpu_available
    
    def get_device(self, force_cpu: bool = False) -> torch.device:
        """获取推荐的计算设备"""
        if force_cpu or not self.gpu_available:
            return torch.device('cpu')
        
        # 检查GPU内存是否足够
        if self.has_sufficient_memory():
            return torch.device(f'cuda:{self.current_device}')
        else:
            logger.warning("GPU内存不足，回退到CPU")
            return torch.device('cpu')
    
    def has_sufficient_memory(self, device_id: int = None) -> bool:
        """检查GPU是否有足够的内存"""
        if not self.gpu_available:
            return False
        
        device_id = device_id or self.current_device
        try:
            gpu_props = torch.cuda.get_device_properties(device_id)
            total_memory = gpu_props.total_memory
            allocated_memory = torch.cuda.memory_allocated(device_id)
            available_memory = total_memory - allocated_memory
            
            available_gb = available_memory / 1024**3
            return available_gb >= self.memory_threshold_gb
            
        except Exception as e:
            logger.warning(f"检查GPU内存失败: {e}")
            return False
    
    def get_gpu_status(self, device_id: int = None) -> Dict[str, Any]:
        """获取GPU状态信息"""
        status = {
            'gpu_available': self.gpu_available,
            'device_count': self.device_count,
            'current_device': self.current_device
        }
        
        if not self.gpu_available:
            return status
        
        device_id = device_id or self.current_device
        
        try:
            gpu_props = torch.cuda.get_device_properties(device_id)
            total_memory = gpu_props.total_memory
            allocated_memory = torch.cuda.memory_allocated(device_id)
            cached_memory = torch.cuda.memory_reserved(device_id)
            available_memory = total_memory - allocated_memory
            
            status.update({
                'device_id': device_id,
                'device_name': gpu_props.name,
                'total_memory_gb': total_memory / 1024**3,
                'allocated_memory_gb': allocated_memory / 1024**3,
                'cached_memory_gb': cached_memory / 1024**3,
                'available_memory_gb': available_memory / 1024**3,
                'memory_usage_percent': (allocated_memory / total_memory) * 100,
                'sufficient_memory': available_memory / 1024**3 >= self.memory_threshold_gb
            })
            
        except Exception as e:
            status['error'] = str(e)
            
        return status
    
    def optimize_memory(self, device_id: int = None):
        """优化GPU内存使用"""
        if not self.gpu_available:
            logger.info("未使用GPU，无需优化内存")
            return True
        
        device_id = device_id or self.current_device
        
        try:
            # 清理GPU缓存
            torch.cuda.empty_cache()
            
            # 获取优化后的内存状态
            status = self.get_gpu_status(device_id)
            
            logger.info(f"GPU {device_id} 内存优化完成:")
            if 'allocated_memory_gb' in status:
                logger.info(f"  已分配: {status['allocated_memory_gb']:.2f} GB")
                logger.info(f"  已缓存: {status['cached_memory_gb']:.2f} GB")
                logger.info(f"  可用: {status['available_memory_gb']:.2f} GB")
            
            return True
            
        except Exception as e:
            logger.error(f"GPU内存优化失败: {e}")
            return False
    
    def setup_optimizations(self):
        """设置GPU优化参数"""
        if not self.gpu_available:
            return
        
        try:
            # 启用CUDNN优化
            if hasattr(torch.backends, 'cudnn'):
                torch.backends.cudnn.benchmark = True
                torch.backends.cudnn.deterministic = False
                logger.info("✓ CUDNN优化已启用")
            
            # 设置CUDA可见设备
            import os
            os.environ['CUDA_VISIBLE_DEVICES'] = str(self.current_device)
            
            logger.info("✓ GPU优化配置完成")
            
        except Exception as e:
            logger.warning(f"GPU优化配置失败: {e}")
    
    def monitor_memory_usage(self, threshold_percent: float = 90.0) -> bool:
        """监控GPU内存使用，如果超过阈值则发出警告"""
        if not self.gpu_available:
            return True
        
        try:
            status = self.get_gpu_status()
            usage_percent = status.get('memory_usage_percent', 0)
            
            if usage_percent > threshold_percent:
                logger.warning(f"GPU内存使用率过高: {usage_percent:.1f}%")
                logger.warning("建议优化内存使用或降低批处理大小")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"GPU内存监控失败: {e}")
            return False
    
    def get_optimal_batch_size(self, base_batch_size: int = 8) -> int:
        """根据GPU内存动态调整批处理大小"""
        if not self.gpu_available:
            return 1  # CPU模式使用单个样本
        
        try:
            status = self.get_gpu_status()
            available_gb = status.get('available_memory_gb', 0)
            
            if available_gb >= 4.0:
                return base_batch_size
            elif available_gb >= 2.0:
                return max(1, base_batch_size // 2)
            else:
                return 1
                
        except Exception as e:
            logger.warning(f"获取最优批处理大小失败: {e}")
            return 1
    
    def set_memory_threshold(self, threshold_gb: float):
        """设置GPU内存阈值"""
        self.memory_threshold_gb = max(0.5, threshold_gb)
        logger.info(f"GPU内存阈值设置为: {self.memory_threshold_gb:.1f} GB")
    
    def create_device_context(self, device_id: int = None):
        """创建GPU设备上下文"""
        if not self.gpu_available:
            return torch.no_grad()
        
        device_id = device_id or self.current_device
        return torch.cuda.device(device_id)

# 全局GPU管理器实例
gpu_manager = GPUManager()