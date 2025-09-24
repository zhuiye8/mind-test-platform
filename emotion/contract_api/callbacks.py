"""
回调服务
负责向后端发送Finalize和Checkpoint回调
"""

import json
import uuid
import time
import threading
import logging
import os
import gzip
import hashlib
from typing import Dict, Any, Optional
from datetime import datetime
import urllib.request
import urllib.error
from .adapters import ContractDataAdapter


class DateTimeEncoder(json.JSONEncoder):
    """自定义JSON编码器，处理datetime对象"""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CallbackService:
    """回调服务类"""
    
    def __init__(self, backend_base_url: str | None = None, auth_token: str | None = None):
        base_url = (
            backend_base_url
            or os.environ.get('BACKEND_BASE_URL')
            or os.environ.get('API_BASE_URL')
            or 'http://localhost:3101'
        )
        token = (
            auth_token
            or os.environ.get('BACKEND_API_TOKEN')
            or os.environ.get('AI_SERVICE_TOKEN')
            or 'dev-fixed-token-2024'
        )
        self.backend_base_url = base_url.rstrip('/')
        self.auth_token = token
        self.timeout = 10  # 10秒超时
        
    def _send_request(self, url: str, payload: Dict[str, Any], idempotency_key: str, max_retries: int = 3) -> bool:
        """发送HTTP请求到后端"""
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.auth_token}',
            'Idempotency-Key': idempotency_key
        }
        
        data = json.dumps(payload).encode('utf-8')
        
        # 禁用代理以避免502错误
        proxy_handler = urllib.request.ProxyHandler({})
        opener = urllib.request.build_opener(proxy_handler)
        
        for attempt in range(1, max_retries + 1):
            try:
                req = urllib.request.Request(url, data=data, headers=headers, method='POST')
                
                with opener.open(req, timeout=self.timeout) as response:
                    response_data = response.read().decode('utf-8')
                    logger.info(f"Callback success: {url}, attempt: {attempt}, response: {response_data[:200]}")
                    return True
                    
            except urllib.error.HTTPError as e:
                error_body = e.read().decode('utf-8') if e.fp else 'No error body'
                if e.code == 200:
                    # 幂等重复提交也算成功
                    logger.info(f"Callback idempotent success: {url}, attempt: {attempt}")
                    return True
                logger.warning(f"Callback HTTP error: {url}, attempt: {attempt}, code: {e.code}, body: {error_body}")
                
            except urllib.error.URLError as e:
                logger.warning(f"Callback URL error: {url}, attempt: {attempt}, error: {str(e)}")
                
            except Exception as e:
                logger.error(f"Callback unexpected error: {url}, attempt: {attempt}, error: {str(e)}")
            
            if attempt < max_retries:
                # 指数退避：1s, 2s, 4s
                sleep_time = 2 ** (attempt - 1)
                time.sleep(sleep_time)
        
        logger.error(f"Callback failed after {max_retries} attempts: {url}")
        return False
        
    def _send_compressed_finalize(self, url: str, final_data: Dict[str, Any], idempotency_key: str, session_id: str, max_retries: int = 3) -> bool:
        """发送压缩的finalize数据（带重试和清理机制）"""
        try:
            # 1. 压缩数据 - 使用自定义编码器处理datetime对象
            json_str = json.dumps(final_data, cls=DateTimeEncoder, ensure_ascii=False)
            compressed_data = gzip.compress(json_str.encode('utf-8'))
            md5_hash = hashlib.md5(compressed_data).hexdigest()
            
            logger.info(f"[Finalize] 数据压缩完成: {session_id}, 原始大小:{len(json_str)} bytes, 压缩后:{len(compressed_data)} bytes, 压缩率:{len(compressed_data)/len(json_str):.2%}")
            
            # 2. 准备HTTP请求
            # 这里必须确保所有请求头的值均为字符串，避免 urllib 在校验时抛出类型错误
            exam_result_id = str(final_data.get('exam_result_id') or '').strip()
            if not exam_result_id:
                # 若缺少 exam_result_id，无法与后端建立唯一关联，直接记录并放弃本次发送
                logger.error(f"[Finalize] 缺少 exam_result_id，取消发送: {session_id}")
                return False

            headers = {
                'Content-Type': 'application/gzip',
                'Content-MD5': md5_hash,
                'X-Session-ID': str(session_id),
                'X-Exam-Result-ID': exam_result_id,
                'Authorization': f'Bearer {self.auth_token}',
                'Idempotency-Key': str(idempotency_key)
            }
            
            # 禁用代理
            proxy_handler = urllib.request.ProxyHandler({})
            opener = urllib.request.build_opener(proxy_handler)
            
            # 3. 重试发送
            for attempt in range(1, max_retries + 1):
                try:
                    req = urllib.request.Request(url, data=compressed_data, headers=headers, method='POST')
                    
                    with opener.open(req, timeout=60) as response:  # 优化超时时间到60秒
                        response_data = response.read().decode('utf-8')
                        result = json.loads(response_data)
                        
                        if result.get('data', {}).get('md5_verified'):
                            # 4. 验证成功，清理本地缓存
                            logger.info(f"[Finalize] 传输成功，开始清理缓存: {session_id}")
                            
                            # 删除AI服务本地JSON文件（统一使用session_id）
                            try:
                                from utils.data_manager import DataManager
                                data_manager = DataManager()
                                
                                if data_manager.delete_session(session_id):
                                    logger.info(f"[Finalize] ✅ DataManager删除会话文件成功: {session_id[:8]}...")
                                else:
                                    logger.info(f"[Finalize] ℹ️  会话文件不存在或已删除: {session_id[:8]}...")
                                    
                            except Exception as e:
                                logger.warning(f"[Finalize] DataManager清理文件异常: {e}")
                            
                            return True
                        else:
                            logger.warning(f"[Finalize] MD5验证失败: {session_id}, attempt {attempt}")
                            
                except urllib.error.HTTPError as e:
                    error_body = e.read().decode('utf-8') if e.fp else 'No error body'
                    if e.code == 200:
                        logger.info(f"[Finalize] 幂等成功: {session_id}, attempt {attempt}")
                        return True
                    logger.warning(f"[Finalize] HTTP错误: {session_id}, attempt {attempt}, code: {e.code}, body: {error_body[:200]}")
                    
                except Exception as e:
                    logger.error(f"[Finalize] 发送异常: {session_id}, attempt {attempt}, error: {str(e)}, type: {type(e).__name__}")
                    # 如果是数据类型错误，提供更详细的调试信息
                    if "string or bytes-like object" in str(e):
                        logger.error(f"[Finalize] 数据类型错误详情: final_data keys={list(final_data.keys())}, data type={type(final_data.get('data'))}")
                        for key, value in final_data.items():
                            logger.debug(f"[Finalize] {key}: {type(value)} = {str(value)[:100]}...")
                
                # 指数退避
                if attempt < max_retries:
                    sleep_time = 2 ** (attempt - 1)
                    logger.info(f"[Finalize] 重试前等待 {sleep_time}s: {session_id}")
                    time.sleep(sleep_time)
            
            logger.error(f"[Finalize] 最终失败: {session_id}, 保留缓存数据")
            return False
            
        except Exception as e:
            logger.error(f"[Finalize] 压缩发送异常: {session_id}, error: {e}")
            return False
    
    def send_finalize(self, session_id: str, exam_id: str, session_data: Dict[str, Any], async_send: bool = True) -> bool:
        """发送会话结束数据（优化版 - 使用DataManager加载完整数据）"""
        try:
            # 1. 从DataManager加载完整会话数据（统一使用session_id）
            try:
                from utils.data_manager import DataManager
                data_manager = DataManager()
                
                # 直接用session_id查找（新的统一方式）
                file_data = data_manager.load_session(session_id)
                if file_data:
                    # 确保文件数据包含最新的exam_result_id
                    file_data.update({
                        'exam_id': exam_id,
                        'exam_result_id': session_data.get('exam_result_id')
                    })
                    buffered_data = file_data
                    logger.info(f"[Finalize] ✅ 成功加载会话数据: {session_id[:8]}..., 数据量: video={len(buffered_data.get('video_emotions', []))}, audio={len(buffered_data.get('audio_emotions', []))}, heart={len(buffered_data.get('heart_rate_data', []))}")
                else:
                    logger.warning(f"[Finalize] ⚠️  未找到会话文件: {session_id[:8]}..., 使用传入数据")
                    buffered_data = session_data
            except Exception as e:
                logger.warning(f"[Finalize] DataManager加载异常: {e}, 使用传入数据")
                buffered_data = session_data
            
            # 2. 准备完整数据包
            # 确保时间字段为字符串格式
            started_at = buffered_data.get('start_time') or buffered_data.get('started_at')
            if isinstance(started_at, datetime):
                started_at = started_at.isoformat()
            elif not isinstance(started_at, str):
                started_at = datetime.now().isoformat()
            
            ended_at = buffered_data.get('end_time') or buffered_data.get('ended_at')
            if isinstance(ended_at, datetime):
                ended_at = ended_at.isoformat()
            elif not isinstance(ended_at, str):
                ended_at = datetime.now().isoformat()
            
            # 使用自定义编码器计算大小
            try:
                buffered_data_json = json.dumps(buffered_data, cls=DateTimeEncoder, ensure_ascii=False)
                data_size = len(buffered_data_json)
                logger.info(f"[Finalize] 数据序列化成功: {session_id}, 大小: {data_size} bytes")
            except Exception as e:
                logger.error(f"[Finalize] 数据序列化测试失败: {session_id}, error: {e}")
                # 使用空数据作为备用
                buffered_data = {'session_id': session_id, 'video_emotions': [], 'audio_emotions': [], 'heart_rate_data': []}
                buffered_data_json = json.dumps(buffered_data)
                data_size = len(buffered_data_json)
            
            final_data = {
                'session_id': session_id,
                'exam_id': exam_id,
                'exam_result_id': session_data.get('exam_result_id'),
                'started_at': started_at,
                'ended_at': ended_at,
                'data': buffered_data,
                'size_bytes': data_size
            }
            
            url = f"{self.backend_base_url}/api/ai-service/sessions/{session_id}/finalize"
            idempotency_key = str(uuid.uuid4())
            
            logger.info(f"[Finalize] 开始发送: session_id={session_id}, exam_id={exam_id}, 数据大小={final_data['size_bytes']} bytes")
            
            if async_send:
                # 异步发送压缩数据
                thread = threading.Thread(
                    target=self._send_compressed_finalize, 
                    args=(url, final_data, idempotency_key, session_id),
                    daemon=True
                )
                thread.start()
                return True
            else:
                # 同步发送压缩数据
                return self._send_compressed_finalize(url, final_data, idempotency_key, session_id)
                
        except Exception as e:
            logger.error(f"[Finalize] 处理失败: {session_id}, error: {e}")
            return False
    
    def send_checkpoint(self, session_id: str, metrics: Dict[str, Any], async_send: bool = True) -> bool:
        """废弃的Checkpoint回调 - 现已使用JSON文件存储"""
        logger.warning(f"[废弃] 收到checkpoint请求: {session_id}, 已改用JSON文件存储，忽略此请求")
        return True  # 返回成功避免调用方报错


# 全局回调服务实例
callback_service = CallbackService()


def set_callback_config(backend_base_url: str | None = None, auth_token: str | None = None):
    """设置回调配置"""
    global callback_service
    callback_service = CallbackService(backend_base_url, auth_token)
