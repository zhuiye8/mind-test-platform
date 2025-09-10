"""
系统错误处理和用户反馈模块
提供统一的错误处理、日志记录和用户通知功能
"""

import logging
import traceback
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum

class ErrorLevel(Enum):
    """错误级别"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

class ErrorHandler:
    """统一错误处理器"""
    
    def __init__(self):
        self.error_counts = {}
        self.last_errors = {}
        
        # 设置日志格式
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('app_errors.log', encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
    
    def handle_error(self, error: Exception, context: str, session_id: str = None, 
                    level: ErrorLevel = ErrorLevel.ERROR) -> Dict[str, Any]:
        """处理错误并生成用户友好的响应"""
        error_id = f"{context}_{type(error).__name__}"
        
        # 记录错误统计
        self.error_counts[error_id] = self.error_counts.get(error_id, 0) + 1
        self.last_errors[error_id] = datetime.now()
        
        # 生成错误信息
        error_info = {
            'error_id': error_id,
            'context': context,
            'session_id': session_id,
            'timestamp': datetime.now().isoformat(),
            'error_type': type(error).__name__,
            'error_message': str(error),
            'level': level.value,
            'count': self.error_counts[error_id],
            'user_message': self._generate_user_message(error, context)
        }
        
        # 记录日志
        log_msg = f"[{context}] {type(error).__name__}: {str(error)}"
        if session_id:
            log_msg = f"[{session_id}] {log_msg}"
        
        if level == ErrorLevel.CRITICAL:
            self.logger.critical(log_msg)
        elif level == ErrorLevel.ERROR:
            self.logger.error(log_msg)
        elif level == ErrorLevel.WARNING:
            self.logger.warning(log_msg)
        else:
            self.logger.info(log_msg)
        
        # 打印堆栈信息（仅在调试模式）
        if level in [ErrorLevel.ERROR, ErrorLevel.CRITICAL]:
            self.logger.debug(traceback.format_exc())
        
        return error_info
    
    def _generate_user_message(self, error: Exception, context: str) -> str:
        """生成用户友好的错误消息"""
        error_type = type(error).__name__
        error_msg = str(error).lower()
        
        # 视频处理相关错误
        if context.startswith('video'):
            if 'decode' in error_msg or 'format' in error_msg:
                return "视频格式不支持或文件损坏，请尝试使用MP4格式"
            elif 'memory' in error_msg or 'size' in error_msg:
                return "视频文件过大，请使用较小的文件或调整分辨率"
            elif 'deepface' in error_msg or 'model' in error_msg:
                return "面部情绪分析暂时不可用，请稍后重试"
            else:
                return "视频处理遇到问题，请检查文件格式或重新上传"
        
        # 音频处理相关错误
        elif context.startswith('audio'):
            if 'decode' in error_msg or 'format' in error_msg:
                return "音频格式不支持，请检查音频设备或文件格式"
            elif 'emotion2vec' in error_msg or 'model' in error_msg:
                return "语音情绪分析暂时不可用，请稍后重试"
            elif 'microphone' in error_msg or 'device' in error_msg:
                return "麦克风访问失败，请检查设备权限"
            else:
                return "音频处理遇到问题，请检查设备或重新启动"
        
        # 心率检测相关错误
        elif context.startswith('heart_rate'):
            if 'face' in error_msg or 'detection' in error_msg:
                return "无法检测到人脸，请确保光线充足且面部清晰可见"
            elif 'signal' in error_msg or 'quality' in error_msg:
                return "心率信号质量不佳，请保持静止并确保良好光照"
            else:
                return "心率检测暂时不可用，请稍后重试"
        
        # 网络和连接错误
        elif 'connection' in error_msg or 'network' in error_msg:
            return "网络连接不稳定，请检查网络连接"
        
        # 权限相关错误
        elif 'permission' in error_msg or 'access' in error_msg:
            return "权限不足，请允许浏览器访问摄像头和麦克风"
        
        # 默认错误消息
        else:
            return f"系统遇到问题，请稍后重试（错误类型：{error_type}）"
    
    def get_error_statistics(self) -> Dict[str, Any]:
        """获取错误统计信息"""
        return {
            'error_counts': dict(self.error_counts),
            'last_errors': {k: v.isoformat() for k, v in self.last_errors.items()},
            'total_errors': sum(self.error_counts.values())
        }
    
    def reset_statistics(self):
        """重置错误统计"""
        self.error_counts.clear()
        self.last_errors.clear()
        self.logger.info("错误统计已重置")

class UserNotification:
    """用户通知管理器"""
    
    @staticmethod
    def create_notification(message: str, level: ErrorLevel, duration: int = 5000) -> Dict[str, Any]:
        """创建用户通知"""
        return {
            'message': message,
            'level': level.value,
            'duration': duration,
            'timestamp': datetime.now().isoformat(),
            'dismissible': True
        }
    
    @staticmethod
    def create_progress_notification(message: str, progress: float = 0) -> Dict[str, Any]:
        """创建进度通知"""
        return {
            'message': message,
            'level': 'progress',
            'progress': max(0, min(100, progress)),
            'timestamp': datetime.now().isoformat(),
            'dismissible': False
        }

# 全局实例
error_handler = ErrorHandler()