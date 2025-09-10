"""
系统清理管理器
自动清理过期会话、临时文件和优化存储空间
"""

import os
import json
import shutil
import logging
from datetime import datetime, timedelta
from pathlib import Path
from config import Config

logger = logging.getLogger(__name__)

class CleanupManager:
    """系统清理管理器"""
    
    def __init__(self):
        self.sessions_dir = Path(Config.SESSIONS_FOLDER)
        self.uploads_dir = Path(Config.UPLOAD_FOLDER)
        self.temp_dirs = []
        
    def cleanup_old_sessions(self, days_to_keep: int = 7, max_sessions: int = 100):
        """清理旧会话文件"""
        try:
            if not self.sessions_dir.exists():
                logger.info("会话目录不存在，跳过清理")
                return
            
            session_files = list(self.sessions_dir.glob("*.json"))
            logger.info(f"发现 {len(session_files)} 个会话文件")
            
            if len(session_files) == 0:
                return
            
            # 按修改时间排序
            session_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
            
            # 计算过期时间
            cutoff_time = datetime.now() - timedelta(days=days_to_keep)
            cutoff_timestamp = cutoff_time.timestamp()
            
            deleted_count = 0
            kept_count = 0
            
            for i, session_file in enumerate(session_files):
                try:
                    # 检查文件修改时间
                    file_mtime = session_file.stat().st_mtime
                    
                    # 删除条件：超过保留天数 或 超过最大文件数
                    should_delete = (file_mtime < cutoff_timestamp or i >= max_sessions)
                    
                    if should_delete:
                        # 验证文件内容是否为有效JSON
                        try:
                            with open(session_file, 'r', encoding='utf-8') as f:
                                json.load(f)
                        except:
                            # 无效JSON文件，直接删除
                            pass
                        
                        session_file.unlink()
                        deleted_count += 1
                        logger.debug(f"删除会话文件: {session_file.name}")
                    else:
                        kept_count += 1
                        
                except Exception as e:
                    logger.warning(f"处理会话文件失败 {session_file}: {e}")
            
            logger.info(f"会话清理完成: 删除 {deleted_count} 个，保留 {kept_count} 个")
            return deleted_count
            
        except Exception as e:
            logger.error(f"清理会话文件失败: {e}")
            return 0
    
    def cleanup_temp_files(self):
        """清理临时文件"""
        try:
            temp_patterns = [
                "video_analysis_*",
                "extracted_audio.wav",
                "segment_*.wav",
                "temp_*.jpg",
                "temp_*.png"
            ]
            
            deleted_count = 0
            
            # 清理系统临时目录中的项目文件
            import tempfile
            system_temp = Path(tempfile.gettempdir())
            
            for pattern in temp_patterns:
                for temp_file in system_temp.glob(pattern):
                    try:
                        if temp_file.is_file():
                            temp_file.unlink()
                            deleted_count += 1
                        elif temp_file.is_dir():
                            shutil.rmtree(temp_file)
                            deleted_count += 1
                    except Exception as e:
                        logger.warning(f"删除临时文件失败 {temp_file}: {e}")
            
            # 清理项目内的临时文件
            project_root = Path(__file__).parent.parent
            for pattern in ["*.tmp", "*.temp", "core.*"]:
                for temp_file in project_root.rglob(pattern):
                    try:
                        temp_file.unlink()
                        deleted_count += 1
                    except Exception as e:
                        logger.warning(f"删除项目临时文件失败 {temp_file}: {e}")
            
            logger.info(f"临时文件清理完成: 删除 {deleted_count} 个文件")
            return deleted_count
            
        except Exception as e:
            logger.error(f"清理临时文件失败: {e}")
            return 0
    
    def cleanup_old_uploads(self, days_to_keep: int = 3):
        """清理旧的上传文件"""
        try:
            if not self.uploads_dir.exists():
                logger.info("上传目录不存在，跳过清理")
                return 0
            
            cutoff_time = datetime.now() - timedelta(days=days_to_keep)
            cutoff_timestamp = cutoff_time.timestamp()
            
            deleted_count = 0
            upload_files = list(self.uploads_dir.rglob("*"))
            
            for upload_file in upload_files:
                try:
                    if upload_file.is_file():
                        file_mtime = upload_file.stat().st_mtime
                        if file_mtime < cutoff_timestamp:
                            upload_file.unlink()
                            deleted_count += 1
                            logger.debug(f"删除上传文件: {upload_file.name}")
                except Exception as e:
                    logger.warning(f"删除上传文件失败 {upload_file}: {e}")
            
            logger.info(f"上传文件清理完成: 删除 {deleted_count} 个文件")
            return deleted_count
            
        except Exception as e:
            logger.error(f"清理上传文件失败: {e}")
            return 0
    
    def get_storage_info(self) -> dict:
        """获取存储空间信息"""
        try:
            project_root = Path(__file__).parent.parent
            
            info = {
                'sessions_count': len(list(self.sessions_dir.glob("*.json"))) if self.sessions_dir.exists() else 0,
                'uploads_count': len(list(self.uploads_dir.rglob("*"))) if self.uploads_dir.exists() else 0,
                'project_size_mb': self._get_directory_size(project_root),
                'sessions_size_mb': self._get_directory_size(self.sessions_dir),
                'uploads_size_mb': self._get_directory_size(self.uploads_dir)
            }
            
            return info
            
        except Exception as e:
            logger.error(f"获取存储信息失败: {e}")
            return {}
    
    def _get_directory_size(self, directory: Path) -> float:
        """获取目录大小（MB）"""
        try:
            if not directory.exists():
                return 0.0
            
            total_size = 0
            for file_path in directory.rglob("*"):
                if file_path.is_file():
                    total_size += file_path.stat().st_size
            
            return round(total_size / (1024 * 1024), 2)
        except:
            return 0.0
    
    def perform_full_cleanup(self):
        """执行完整清理"""
        logger.info("开始执行系统完整清理...")
        
        results = {
            'sessions_deleted': self.cleanup_old_sessions(),
            'temp_files_deleted': self.cleanup_temp_files(),
            'uploads_deleted': self.cleanup_old_uploads()
        }
        
        logger.info(f"系统清理完成: {results}")
        return results

# 全局实例
cleanup_manager = CleanupManager()