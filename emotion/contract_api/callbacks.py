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
from typing import Dict, Any, Optional
import urllib.request
import urllib.error
from .adapters import ContractDataAdapter


# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CallbackService:
    """回调服务类"""
    
    def __init__(self, backend_base_url: str = "http://localhost:3001", auth_token: str = "dev-fixed-token-2024"):
        self.backend_base_url = backend_base_url.rstrip('/')
        self.auth_token = auth_token
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
    
    def send_finalize(self, session_id: str, exam_id: str, session_data: Dict[str, Any], async_send: bool = True) -> bool:
        """发送Finalize回调"""
        url = f"{self.backend_base_url}/api/ai-service/sessions/{session_id}/finalize"
        payload = ContractDataAdapter.create_finalize_payload(session_id, exam_id, session_data)
        idempotency_key = str(uuid.uuid4())
        
        logger.info(f"Sending finalize callback: session_id={session_id}, exam_id={exam_id}, url={url}")
        
        if async_send:
            # 异步发送
            thread = threading.Thread(
                target=self._send_request, 
                args=(url, payload, idempotency_key),
                daemon=True
            )
            thread.start()
            return True
        else:
            # 同步发送
            return self._send_request(url, payload, idempotency_key)
    
    def send_checkpoint(self, session_id: str, metrics: Dict[str, Any], async_send: bool = True) -> bool:
        """发送Checkpoint回调"""
        url = f"{self.backend_base_url}/api/ai-service/sessions/{session_id}/checkpoint"
        payload = ContractDataAdapter.create_checkpoint_payload(session_id, metrics)
        idempotency_key = str(uuid.uuid4())
        
        logger.info(f"Sending checkpoint callback: session_id={session_id}, url={url}")
        
        if async_send:
            # 异步发送
            thread = threading.Thread(
                target=self._send_request,
                args=(url, payload, idempotency_key),
                daemon=True
            )
            thread.start()
            return True
        else:
            # 同步发送
            return self._send_request(url, payload, idempotency_key)


# 全局回调服务实例
callback_service = CallbackService()


def set_callback_config(backend_base_url: str, auth_token: str):
    """设置回调配置"""
    global callback_service
    callback_service = CallbackService(backend_base_url, auth_token)