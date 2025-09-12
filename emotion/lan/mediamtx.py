"""MediaMTX 相关工具函数（从 app_lan.py 拆分）

说明：保持原始行为与容错逻辑，便于在主应用中复用。
"""

import os
import socket
from urllib.parse import urlparse
import requests


def get_local_ip() -> str:
    """获取本机局域网 IP（用于展示与兜底配置）"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return '127.0.0.1'


def get_mediamtx_host() -> str:
    """获取 MediaMTX 主机地址（支持环境变量与简单探测）"""
    # 1) env
    if 'MEDIAMTX_HOST' in os.environ:
        return os.environ['MEDIAMTX_HOST']
    # 2) simple auto-detect
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
        ip_parts = local_ip.split('.')
        if len(ip_parts) == 4:
            candidates = [f"{'.'.join(ip_parts[:3])}.1", "192.168.0.112", "192.168.1.1", "172.27.29.1"]
            for candidate in candidates:
                try:
                    url = f"http://{candidate}:8889"
                    resp = requests.get(url, timeout=2)
                    if 'mediamtx' in resp.headers.get('Server', '').lower():
                        return url
                except Exception:
                    continue
    except Exception:
        pass
    # 3) default
    return 'http://127.0.0.1:8889'


def get_mediamtx_hostname() -> str:
    """从主机地址中提取 hostname（无则回退 127.0.0.1）"""
    try:
        u = urlparse(get_mediamtx_host())
        return u.hostname or '127.0.0.1'
    except Exception:
        return '127.0.0.1'


def build_rtsp_url(stream_name: str) -> str:
    """构建 RTSP URL（与前端一致）"""
    host = get_mediamtx_hostname()
    return f"rtsp://{host}:8554/{stream_name}"
