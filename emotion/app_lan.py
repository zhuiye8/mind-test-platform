"""
情绪检测系统 - 局域网部署启动文件
支持学生端和教师端通过局域网进行通信
"""

from flask import Flask, render_template, request, jsonify, Response
from flask_socketio import SocketIO, emit, join_room, rooms
from flask_cors import CORS
import os
# 加载 .env 文件中的环境变量
from pathlib import Path

ENV_DIR = Path(__file__).parent
APP_ENV = os.environ.get('APP_ENV') or os.environ.get('ENV') or 'development'
os.environ.setdefault('APP_ENV', APP_ENV)
_original_env_keys = set(os.environ.keys())
_loaded_env_keys: set[str] = set()


def _load_env_file(env_file: Path, override_loaded: bool = False) -> bool:
    if not env_file.exists():
        return False

    try:
        with env_file.open('r', encoding='utf-8') as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()

                already_defined = key in os.environ
                defined_by_loader = key in _loaded_env_keys

                if not already_defined:
                    os.environ[key] = value
                    _loaded_env_keys.add(key)
                elif override_loaded and defined_by_loader and key not in _original_env_keys:
                    os.environ[key] = value
        print(f"[配置] 已加载环境变量文件: {env_file}")
        return True
    except Exception as exc:
        print(f"[配置] 读取环境变量文件失败: {env_file} -> {exc}")
        return False


loaded_any = False
load_order = [
    (ENV_DIR / '.env', False),
    (ENV_DIR / '.env.local', True),
    (ENV_DIR / f'.env.{APP_ENV}', True),
    (ENV_DIR / f'.env.{APP_ENV}.local', True),
]

for env_file, override in load_order:
    loaded_any = _load_env_file(env_file, override) or loaded_any

if not loaded_any:
    print(f"[配置] 未找到环境变量文件，使用系统环境变量。运行模式: {APP_ENV}")
else:
    print(f"[配置] 当前运行模式: {APP_ENV}")
import json
import uuid
import base64
import io
import time
import socket
import numpy as np
from PIL import Image
from datetime import datetime
from config import Config
from lan.stream_utils import compute_stream_name
from lan.mediamtx import get_mediamtx_host, get_mediamtx_hostname, build_rtsp_url, get_local_ip
from utils.data_manager import DataManager
from utils.websocket_handler import WebSocketHandler
from utils.error_handler import error_handler, ErrorLevel
# 使用延迟加载模型管理器，避免启动时加载
from models.model_manager import model_manager
# 导入契约API适配层
from contract_api import contract_bp, set_callback_config
# 新方案：RTSP 消费管理器（拉取 MediaMTX 流）
from rtsp_consumer import RTSPConsumerManager, set_socketio as set_rtsp_socketio, set_session_mapper as set_rtsp_session_mapper, get_latest_state
import requests
# 导入WebRTC信令处理器
# from webrtc_signaling import WebRTCSignalingHandler  # 历史方案（已停用）

# 创建Flask应用
app = Flask(__name__)
app.config.from_object(Config)
Config.init_app(app)

# 清除HTTP代理，避免本机回环请求被代理导致 502（可通过 CLEAR_PROXY=false 关闭）
if os.environ.get('CLEAR_PROXY', 'true') != 'false':
    for _k in ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY']:
        if _k in os.environ:
            os.environ.pop(_k, None)
    print('🌐 已清除HTTP代理设置（设置 CLEAR_PROXY=false 可跳过）')

# 启用CORS支持，解决局域网访问问题
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# 局域网配置
class LANConfig(Config):
    """局域网部署配置"""
    HOST = os.environ.get('AI_SERVICE_HOST', os.environ.get('HOST', '0.0.0.0'))
    PORT = int(os.environ.get('AI_SERVICE_PORT') or os.environ.get('PORT') or 5678)
    DEBUG = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'

# 应用局域网配置
app.config.from_object(LANConfig)

# 初始化SocketIO - 添加更完整的配置解决局域网访问问题
socketio = SocketIO(app, 
                   cors_allowed_origins="*",
                   async_mode=LANConfig.SOCKETIO_ASYNC_MODE,
                   allow_upgrades=True,
                   logger=False,  # 禁用SocketIO日志避免干扰
                   engineio_logger=False)

# 初始化组件
data_manager = DataManager()
websocket_handler = WebSocketHandler(socketio)
# 初始化 RTSP 消费管理器 - 传递app实例以支持应用上下文
set_rtsp_socketio(socketio, app)
rtsp_manager = RTSPConsumerManager(model_manager)

# 清空RTSP管理器中的残留流
try:
    if rtsp_manager and hasattr(rtsp_manager, '_threads'):
        for stream in list(rtsp_manager._threads.keys()):
            rtsp_manager.stop(stream)
        print(f"[启动清理] 停止了 {len(rtsp_manager._threads)} 个RTSP流")
except Exception as e:
    print(f"[启动清理] RTSP清理失败: {e}")
# 运行期绑定：stream_name -> { session_id, student_id }
_manual_stream_bindings = {}
_sid_registry = {}  # monitor_sid -> default_sid
def _map_stream_to_session(stream_name: str):
    # 根据 stream_name 反查学生会话
    try:
        # 1) 先查手动绑定
        b = _manual_stream_bindings.get(stream_name)
        if b:
            return {
                'session_id': b.get('session_id'),
                'student_id': b.get('student_id'),
                'sid_default': b.get('sid_default'),
                'sid_monitor': b.get('sid_monitor'),
            }
        # 2) 再查 student_sessions
        for sid, s in student_sessions.items():
            if s.get('stream_name') == stream_name:
                return {
                    'session_id': sid,
                    'student_id': s.get('student_id'),
                    'sid_default': None,
                    'sid_monitor': None,
                }
    except Exception:
        pass
    return None
set_rtsp_session_mapper(_map_stream_to_session)

# 提供手动绑定接口，便于监控页在点击学生时绑定映射
@app.route('/api/monitor/bind', methods=['POST'])
def bind_stream_to_session():
    try:
        data = request.get_json(silent=True) or {}
        stream_name = data.get('stream_name')
        session_id = data.get('session_id')
        student_id = data.get('student_id')
        sid_monitor = data.get('sid')  # 可选：/monitor 命名空间 socket.id，用于服务器侧入房
        sid_default = data.get('sid_default')  # 可选：默认命名空间 socket.id，用于定向推送
        # 若未显式提供默认sid，尝试用注册表推断
        try:
            if (not sid_default) and sid_monitor and sid_monitor in _sid_registry:
                sid_default = _sid_registry.get(sid_monitor)
        except Exception:
            pass
        if not stream_name or not session_id:
            return jsonify({ 'success': False, 'message': 'stream_name 与 session_id 必填' }), 400
        _manual_stream_bindings[stream_name] = {
            'session_id': session_id,
            'student_id': student_id,
            'sid_monitor': sid_monitor,
            'sid_default': sid_default,
        }
        # 如提供了 sid，则让该连接进入以 stream_name 为单位的房间，便于定向推送
        try:
            if sid_monitor:
                room = f"stream:{stream_name}"
                # 使用服务器级 API 在 HTTP 上下文中将 sid 加入房间
                socketio.server.enter_room(sid_monitor, room, namespace='/monitor')
                return jsonify({ 'success': True, 'room': room, 'joined': True, 'sid_default': bool(sid_default) })
        except Exception as e:
            # 入房失败不影响绑定的建立
            return jsonify({ 'success': True, 'room': f'stream:{stream_name}', 'joined': False, 'sid_default': bool(sid_default), 'message': str(e) })
        return jsonify({ 'success': True, 'room': f'stream:{stream_name}', 'joined': False, 'sid_default': bool(sid_default) })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

@app.route('/api/monitor/unbind', methods=['POST'])
def unbind_stream_to_session():
    try:
        data = request.get_json(silent=True) or {}
        stream_name = data.get('stream_name')
        if not stream_name:
            return jsonify({ 'success': False, 'message': 'stream_name 必填' }), 400
        _manual_stream_bindings.pop(stream_name, None)
        return jsonify({ 'success': True })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500
# 初始化WebRTC信令处理器
# webrtc_signaling = WebRTCSignalingHandler(socketio)

# 注册契约API蓝图
app.register_blueprint(contract_bp)

# 配置回调服务
backend_base_url = (
    os.environ.get('BACKEND_BASE_URL')
    or os.environ.get('API_BASE_URL')
    or 'http://localhost:3101'
)
auth_token = (
    os.environ.get('BACKEND_API_TOKEN')
    or os.environ.get('AI_SERVICE_TOKEN')
    or 'dev-fixed-token-2024'
)
set_callback_config(backend_base_url, auth_token)

# 将端口配置添加到app.config中供contract_api使用
app.config['AI_SERVICE_PORT'] = LANConfig.PORT

#（移除临时测试监控路由，转由独立测试服务提供）


# 初始化simple_student_api
from student_api.simple_api import init_simple_api
simple_student_api = init_simple_api(data_manager, model_manager)

# 存储活跃会话
active_sessions = {}

# 存储学生端会话信息（用于教师端监控）
student_sessions = {}

# 存储学生端视音频流数据
student_streams = {}

# 将student_sessions/streams 暴露给契约API使用
app.student_sessions = student_sessions
app.student_streams = student_streams

# 启动时清理旧会话
def cleanup_on_startup():
    """服务启动时清理旧会话和临时文件"""
    print("[启动清理] 开始清理旧会话...")
    
    # 1. 清空内存中的会话
    student_sessions.clear()
    student_streams.clear()
    active_sessions.clear()
    print("[启动清理] 内存会话已清空")
    
    # 2. 清理过期会话文件（保留最近7天的100个会话）
    try:
        from utils.cleanup_manager import CleanupManager
        cleanup_mgr = CleanupManager()
        deleted = cleanup_mgr.cleanup_old_sessions(days_to_keep=7, max_sessions=100)
        print(f"[启动清理] 删除了 {deleted} 个过期会话文件")
        
        # 3. 清理临时文件
        deleted_temp = cleanup_mgr.cleanup_temp_files()
        print(f"[启动清理] 删除了 {deleted_temp} 个临时文件")
    except Exception as e:
        print(f"[启动清理] 清理文件失败: {e}")
    
    # 4. 确保RTSP管理器状态清空（在初始化后执行）
    print("[启动清理] RTSP流状态将在初始化后清空")
    print("[启动清理] 启动清理完成")

# 执行启动清理
cleanup_on_startup()

# 模型加载状态
models_loaded = False
model_loading_status = {
    'loading': False,
    'progress': 0,
    'current_model': '',
    'error': None
}

# =================== 流名与MediaMTX工具（已拆分至 lan/*.py） ===================

# =================== RTSP 拉流 API（用于从 MediaMTX 拉取学生端流） ===================

@app.route('/api/rtsp/start', methods=['POST', 'GET'])
def rtsp_start():
    """
    开始从 MediaMTX 通过 RTSP 拉流。
    - 正式用法：POST JSON { stream_name, rtsp_url }
    - 便捷调试：GET ?stream_name=...&rtsp_url=...
    """
    if request.method == 'GET':
        # 便捷调试分支：支持通过查询参数启动，或返回用法说明
        stream_name = request.args.get('stream_name') or request.args.get('stream') or request.args.get('session_id')
        rtsp_url = request.args.get('rtsp_url')
        if not stream_name and not rtsp_url:
            print("[RTSP] (GET) 未提供必要参数 stream_name 或 rtsp_url，返回用法说明")
            example_rtsp_url = f"rtsp://{get_mediamtx_hostname()}:8554/exam-xxxx"
            example = {
                'get_example': f"{request.host_url.rstrip('/')}/api/rtsp/start?stream_name=exam-xxxx&rtsp_url={example_rtsp_url}",
                'post_example': (
                    "curl -X POST "
                    f"http://{get_local_ip()}:{LANConfig.PORT}/api/rtsp/start "
                    "-H 'Content-Type: application/json' "
                    f"-d '{{\"stream_name\":\"exam-xxxx\",\"rtsp_url\":\"{example_rtsp_url}\"}}' --noproxy '*'"
                )
            }
            return jsonify({
                'success': False,
                'message': '请使用 POST(JSON) 或 GET(查询参数) 提供 stream_name 与 rtsp_url',
                'allow': ['POST', 'GET'],
                'example': example
            }), 400
        if stream_name and not rtsp_url:
            rtsp_url = build_rtsp_url(stream_name)
        try:
            print(f"[RTSP] (GET) 请求开始消费: name={stream_name}, url={rtsp_url}")
            ok = rtsp_manager.start(stream_name, rtsp_url)
            return jsonify({ 'success': ok, 'stream_name': stream_name, 'method': 'GET' })
        except Exception as e:
            import traceback
            print(f"[RTSP] 启动失败: {e}")
            traceback.print_exc()
            return jsonify({ 'success': False, 'message': str(e) }), 500
        
        # 不会到达此处

    # POST JSON 分支
    data = request.get_json(silent=True) or {}
    stream_name = data.get('stream_name')
    rtsp_url = data.get('rtsp_url')
    if not stream_name and not rtsp_url:
        return jsonify({ 'success': False, 'message': 'stream_name 与 rtsp_url 需至少提供其一' }), 400
    if stream_name and not rtsp_url:
        rtsp_url = build_rtsp_url(stream_name)
    try:
        print(f"[RTSP] 请求开始消费: name={stream_name}, url={rtsp_url}")
        ok = rtsp_manager.start(stream_name, rtsp_url)
        return jsonify({ 'success': ok, 'stream_name': stream_name })
    except Exception as e:
        import traceback
        print(f"[RTSP] 启动失败: {e}")
        traceback.print_exc()
        return jsonify({ 'success': False, 'message': str(e) }), 500

@app.route('/api/rtsp/stop', methods=['POST', 'GET'])
def rtsp_stop():
    """
    停止 RTSP 拉流。
    - 正式用法：POST JSON { stream_name }
    - 便捷调试：GET ?stream_name=...
    """
    if request.method == 'GET':
        stream_name = request.args.get('stream_name') or request.args.get('stream') or request.args.get('session_id')
        if not stream_name:
            print("[RTSP] (GET) 未提供必要参数 stream_name，返回用法说明")
            example = {
                'get_example': f"{request.host_url.rstrip('/')}\/api\/rtsp\/stop?stream_name=exam-xxxx",
                'post_example': f"curl -X POST http://{get_local_ip()}:{LANConfig.PORT}/api/rtsp/stop -H 'Content-Type: application/json' -d '{{\"stream_name\":\"exam-xxxx\"}}' --noproxy '*'"
            }
            return jsonify({
                'success': False,
                'message': '请提供 stream_name（GET 查询参数或 POST JSON）',
                'allow': ['POST', 'GET'],
                'example': example
            }), 400
        try:
            print(f"[RTSP] (GET) 请求停止消费: name={stream_name}")
            ok = rtsp_manager.stop(stream_name)
            return jsonify({ 'success': ok, 'stream_name': stream_name, 'method': 'GET' })
        except Exception as e:
            print(f"[RTSP] 停止失败: {e}")
            return jsonify({ 'success': False, 'message': str(e) }), 500

    data = request.get_json(silent=True) or {}
    stream_name = data.get('stream_name')
    if not stream_name:
        return jsonify({ 'success': False, 'message': 'stream_name 必填' }), 400
    try:
        print(f"[RTSP] 请求停止消费: name={stream_name}")
        ok = rtsp_manager.stop(stream_name)
        return jsonify({ 'success': ok, 'stream_name': stream_name })
    except Exception as e:
        print(f"[RTSP] 停止失败: {e}")
        return jsonify({ 'success': False, 'message': str(e) }), 500

# 状态查询：便于调试当前消费情况
@app.route('/api/rtsp/status', methods=['GET'])
def rtsp_status():
    try:
        return jsonify({ 'success': True, 'consumers': rtsp_manager.status() })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

# =================== WHEP 代理（浏览器播放） ===================

_whep_resources = {}

@app.route('/api/whep/<path:stream>', methods=['POST'])
def whep_start(stream: str):
    try:
        print(f"[WHEP] 开始握手: stream={stream}")
        ctype = request.headers.get('Content-Type', '')
        if 'application/sdp' not in ctype:
            return jsonify({ 'success': False, 'message': 'Content-Type must be application/sdp' }), 400
        sdp_offer = request.data
        if not sdp_offer:
            return jsonify({ 'success': False, 'message': 'Empty SDP offer' }), 400

        base = get_mediamtx_host().rstrip('/')
        primary = f"{base}/whep/{stream}"
        fallback = f"{base}/{stream}/whep"

        def do_post(url):
            return requests.post(url, data=sdp_offer, headers={
                'Content-Type': 'application/sdp',
                'Accept': 'application/sdp'
            }, timeout=10)

        resp = do_post(primary)
        if resp.status_code == 404:
            print(f"[WHEP] 主端点404，尝试回退: {fallback}")
            resp = do_post(fallback)
            tried = [primary, fallback]
        else:
            tried = [primary]
        if resp.status_code < 200 or resp.status_code >= 300:
            print(f"[WHEP] 上游失败: status={resp.status_code}, tried={tried}")
            return jsonify({ 'success': False, 'message': 'MediaMTX WHEP failed', 'status': resp.status_code, 'details': resp.text, 'endpointTried': tried }), resp.status_code

        # 保存上游资源位置，返回本地资源位置
        upstream_loc = resp.headers.get('Location', '')
        rid = str(uuid.uuid4())
        if upstream_loc:
            _whep_resources[rid] = upstream_loc
        answer = resp.content
        out = Response(answer, status=200, mimetype='application/sdp')
        if upstream_loc:
            out.headers['Location'] = f"/api/whep/resource/{rid}"
        print(f"[WHEP] 握手成功: stream={stream}, resource_id={rid}")
        # 尝试确保对应的 RTSP 分析也已启动（幂等）
        try:
            rtsp_url = build_rtsp_url(stream)
            print(f"[WHEP] 尝试启动RTSP分析: {rtsp_url}")
            rtsp_manager.start(stream, rtsp_url)
        except Exception as _e:
            print(f"[WHEP] 启动RTSP分析失败（可忽略，前端会再次触发）: {_e}")
        return out
    except requests.RequestException as re:
        print(f"[WHEP] 请求异常: {re}")
        return jsonify({ 'success': False, 'message': f'Request error: {str(re)}' }), 502
    except Exception as e:
        import traceback
        print(f"[WHEP] 处理异常: {e}")
        traceback.print_exc()
        return jsonify({ 'success': False, 'message': str(e) }), 500

@app.route('/api/whep/resource/<rid>', methods=['DELETE'])
def whep_delete(rid: str):
    try:
        print(f"[WHEP] 删除资源: rid={rid}")
        upstream = _whep_resources.pop(rid, None)
        if not upstream:
            return jsonify({ 'success': False, 'message': 'resource not found' }), 404
        # 删除上游资源
        try:
            requests.delete(upstream, timeout=5)
        except Exception:
            pass
        return jsonify({ 'success': True })
    except Exception as e:
        print(f"[WHEP] 删除资源异常: {e}")
        return jsonify({ 'success': False, 'message': str(e) }), 500

@app.route('/api/streaming/config', methods=['GET'])
def streaming_config():
    try:
        base = get_mediamtx_host()
        host = get_mediamtx_hostname()
        warn = None
        if host in ('127.0.0.1', 'localhost'):
            warn = 'MEDIAMTX_HOST 当前为 127.0.0.1/localhost。若 MediaMTX 运行在 Windows 主机，请将 MEDIAMTX_HOST 设置为其局域网地址，如 http://192.168.x.x:8889'
        return jsonify({ 'success': True, 'mediamtx_host': base, 'rtsp_base': f"rtsp://{host}:8554", 'warning': warn })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

# ================ 调试与文档接口 =================

@app.route('/api/routes', methods=['GET'])
def list_routes():
    try:
        routes = []
        for rule in app.url_map.iter_rules():
            methods = sorted([m for m in rule.methods if m not in ('HEAD', 'OPTIONS')])
            routes.append({
                'rule': str(rule),
                'endpoint': rule.endpoint,
                'methods': methods,
            })
        return jsonify({ 'success': True, 'routes': routes })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

@app.route('/api/docs', methods=['GET'])
def api_docs():
    public_host = os.environ.get('AI_SERVICE_PUBLIC_HOST') or get_local_ip()
    public_scheme = (os.environ.get('AI_SERVICE_PUBLIC_SCHEME') or 'http').lower()
    base = f"{public_scheme}://{public_host}:{LANConfig.PORT}"
    ws_scheme = 'wss' if public_scheme == 'https' else 'ws'
    example_rtsp_url = f"rtsp://{get_mediamtx_hostname()}:8554/exam-xxxx"
    docs = {
        'service': 'emotion-ai (LAN)',
        'base_url': base,
        'websocket': f"{ws_scheme}://{public_host}:{LANConfig.PORT}/socket.io/",
        'groups': [
            {
                'name': 'Student APIs',
                'endpoints': [
                    { 'method': 'POST', 'path': '/api/create_session', 'desc': '创建检测会话' },
                    { 'method': 'POST', 'path': '/api/end_session', 'desc': '结束检测会话' },
                    { 'method': 'POST', 'path': '/api/analyze_questions', 'desc': '生成心理分析报告' },
                ]
            },
            {
                'name': 'RTSP (MediaMTX) APIs',
                'endpoints': [
                    { 'method': 'POST|GET', 'path': '/api/rtsp/start', 'desc': '开始拉取 RTSP 流（GET 支持查询参数便捷调试）', 'example': {
                        'curl_post': (
                            "curl -X POST "
                            f"{base}/api/rtsp/start "
                            "-H 'Content-Type: application/json' "
                            f"-d '{{\"stream_name\":\"exam-xxxx\",\"rtsp_url\":\"{example_rtsp_url}\"}}' --noproxy '*'"
                        ),
                        'curl_get': f"curl \"{base}/api/rtsp/start?stream_name=exam-xxxx&rtsp_url={example_rtsp_url}\" --noproxy '*'"
                    }},
                    { 'method': 'POST|GET', 'path': '/api/rtsp/stop', 'desc': '停止拉取 RTSP 流（GET 支持查询参数便捷调试）', 'example': {
                        'curl_post': f"curl -X POST {base}/api/rtsp/stop -H 'Content-Type: application/json' -d '{{\"stream_name\":\"exam-xxxx\"}}' --noproxy '*'",
                        'curl_get': f"curl \"{base}/api/rtsp/stop?stream_name=exam-xxxx\" --noproxy '*'"
                    }},
                ]
            },
            {
                'name': 'System APIs',
                'endpoints': [
                    { 'method': 'GET', 'path': '/api/health', 'desc': '健康检查' },
                    { 'method': 'GET', 'path': '/api/routes', 'desc': '查看已注册路由' },
                ]
            }
        ]
    }
    return jsonify(docs)

@app.route('/docs', methods=['GET'])
def docs_page():
    base = f"http://{get_local_ip()}:{LANConfig.PORT}"
    return (
        f"""
        <html><head><meta charset='utf-8'><title>Emotion AI Service Docs</title>
        <style>body{{font-family:system-ui,Arial;margin:24px;line-height:1.5}} code{{background:#f6f8fa;padding:2px 4px;border-radius:4px}} pre{{background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto}}</style>
        </head><body>
        <h1>Emotion AI Service (LAN) APIs</h1>
        <p>更多细节见 <code>{base}/api/docs</code>。</p>
        <h2>快速开始</h2>
        <ol>
          <li>学生端创建会话：<code>POST /api/create_session</code></li>
          <li>浏览器 WHIP 推流到 MediaMTX</li>
          <li>开始 RTSP 拉流：<code>POST /api/rtsp/start</code></li>
        </ol>
        <h2>接口分组</h2>
        <h3>Student APIs</h3>
        <ul>
          <li>POST <code>/api/create_session</code> - 创建检测会话</li>
          <li>POST <code>/api/end_session</code> - 结束检测会话</li>
          <li>POST <code>/api/analyze_questions</code> - 生成心理分析报告</li>
        </ul>
        <h3>RTSP (MediaMTX) APIs</h3>
        <ul>
          <li>POST/GET <code>/api/rtsp/start</code> - 开始拉取 RTSP 流（GET 支持查询参数便捷调试）</li>
          <li>POST/GET <code>/api/rtsp/stop</code> - 停止拉取 RTSP 流（GET 支持查询参数便捷调试）</li>
        </ul>
        <h3>System</h3>
        <ul>
          <li>GET <code>/api/health</code> - 健康检查</li>
          <li>GET <code>/api/routes</code> - 查看已注册路由</li>
        </ul>
        <p>WebSocket: <code>/socket.io/</code></p>
        <h2>cURL 示例</h2>
        <pre>curl -X POST {base}/api/rtsp/start \
  -H 'Content-Type: application/json' \
  -d '{{"stream_name":"exam-xxxx","rtsp_url":"{example_rtsp_url}"}}' \
  --noproxy '*'</pre>
        </body></html>
        """
    )

def get_local_ip():
    """获取本机局域网IP地址"""
    try:
        # 创建一个socket连接到一个远程地址
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return '127.0.0.1'

# 设置 NO_PROXY，避免本机与局域网地址被代理
try:
    _lan_ip = get_local_ip()
    _no_proxy = os.environ.get('NO_PROXY', '')
    _add = set(['localhost', '127.0.0.1', _lan_ip])
    _exist = set([x.strip() for x in _no_proxy.split(',') if x.strip()])
    os.environ['NO_PROXY'] = ','.join(sorted(_exist.union(_add)))
    print(f"🌐 NO_PROXY={os.environ['NO_PROXY']}")
except Exception:
    pass

# =================== 统一会话清理函数 ===================

def cleanup_session_completely(session_id: str, reason: str = "normal"):
    """完整清理会话的所有资源"""
    print(f"[会话清理] 开始清理会话 {session_id[:8]}... 原因: {reason}")
    
    try:
        # 1. 获取会话信息
        session_info = student_sessions.get(session_id, {})
        stream_name = session_info.get('stream_name')
        
        # 2. 停止RTSP流
        if stream_name:
            try:
                ok = rtsp_manager.stop(stream_name)
                print(f"[会话清理] RTSP流已停止: {stream_name}, 结果: {ok}")
            except Exception as e:
                print(f"[会话清理] 停止RTSP流失败: {e}")
        
        # 3. 清理内存中的会话
        student_sessions.pop(session_id, None)
        student_streams.pop(session_id, None)
        active_sessions.pop(session_id, None)
        print(f"[会话清理] 内存会话已清理")
        
        # 4. 标记磁盘文件为已结束
        try:
            session_data = data_manager.load_session(session_id)
            if session_data:
                session_data['end_time'] = datetime.now().isoformat()
                session_data['status'] = 'ended'
                session_data['end_reason'] = reason
                data_manager.save_session(session_data)
                print(f"[会话清理] 会话文件已更新")
        except Exception as e:
            print(f"[会话清理] 更新会话文件失败: {e}")
        
        # 5. 发送WebSocket通知
        try:
            socketio.emit('student_disconnected', {
                'session_id': session_id,
                'student_id': session_info.get('student_id'),
                'stream_name': stream_name,
                'reason': reason,
                'timestamp': datetime.now().isoformat()
            })
            print(f"[会话清理] WebSocket通知已发送")
        except Exception as e:
            print(f"[会话清理] WebSocket通知失败: {e}")
        
        print(f"[会话清理] 会话 {session_id[:8]}... 清理完成")
        return True
        
    except Exception as e:
        print(f"[会话清理] 清理过程中发生错误: {e}")
        return False

# =================== 新的简化API接口 ===================

@app.route('/api/create_session', methods=['POST'])
def create_session_api():
    """
    创建检测会话接口
    """
    try:
        request_data = request.get_json() or {}
        student_id = request_data.get('student_id')
        exam_id = request_data.get('exam_id')
        
        print(f"[学生连接] 收到学生连接请求 - 学生ID: {student_id}, 考试ID: {exam_id}")
        
        result = simple_student_api.create_detection_session(student_id, exam_id)
        
        # 如果会话创建成功，将其添加到学生会话列表中
        if result.get('success'):
            session_id = result.get('session_id')
            print(f"[学生连接] 会话创建成功 - 会话ID: {session_id[:8]}...")
            
            stream_name = compute_stream_name(exam_id, student_id)
            student_sessions[session_id] = {
                'session_id': session_id,
                'student_id': student_id,
                'exam_id': exam_id,
                'start_time': datetime.now().isoformat(),
                'status': 'active',
                'last_activity': datetime.now().isoformat(),
                'stream_name': stream_name
            }
            
            print(f"[学生连接] 学生会话已添加到student_sessions中")
            print(f"   当前总学生数: {len(student_sessions)}")
            
            # 通知教师端有新学生连接
            print(f"[学生连接] 向教师端发送学生连接通知")
            socketio.emit('student_connected', {
                'session_id': session_id,
                'student_id': student_id,
                'exam_id': exam_id,
                'stream_name': stream_name,
                'timestamp': datetime.now().isoformat()
            })
            print(f"[学生连接] 已通知教师端新学生连接")
        else:
            print(f"[学生连接] 会话创建失败: {result.get('message', '未知错误')}")
        
        return jsonify(result)
        
    except Exception as e:
        print(f"[学生连接] 创建检测会话失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': f'创建检测会话失败: {str(e)}'
        }), 500

# =================== 监控命名空间与订阅 ===================

@socketio.on('monitor/subscribe', namespace='/monitor')
def monitor_subscribe(data):
    """教师端监控订阅：将当前 Socket 加入以 stream_name 为单位的房间"""
    try:
        sn = (data or {}).get('stream_name')
        if not sn or not isinstance(sn, str):
            emit('monitor/error', { 'code': 'bad_stream', 'message': 'invalid stream_name' })
            return
        room = f"stream:{sn}"
        join_room(room)
        try:
            from flask import request as _req
            print(f"[Monitor] sid={_req.sid} joined {room}")
        except Exception:
            pass
        # 回执当前加入的房间与 sid，便于前端确认
        emit('monitor/subscribed', { 'stream_name': sn, 'room': room })
    except Exception as e:
        emit('monitor/error', { 'code': 'subscribe_failed', 'message': str(e) })

@app.route('/api/monitor/ping', methods=['POST'])
def monitor_ping():
    """测试向指定 stream 房间发送一条心率事件，便于快速验证前端订阅链路"""
    try:
        data = request.get_json(silent=True) or {}
        stream_name = data.get('stream_name')
        if not stream_name:
            return jsonify({ 'success': False, 'message': 'stream_name 必填' }), 400
        payload = {
            'stream_name': stream_name,
            'result': { 'heart_rate': 123, 'confidence': 0.9, 'detection_state': 'test' }
        }
        # 诊断：打印 /monitor 命名空间当前房间情况
        try:
            mgr = getattr(socketio.server, 'manager', None)
            if mgr and hasattr(mgr, 'rooms'):
                rooms_map = mgr.rooms.get('/monitor', {})
                print('[PING] /monitor rooms:', { k: len(v) for k, v in rooms_map.items() })
        except Exception as _e:
            print('[PING] dump rooms failed:', _e)
        socketio.emit('student.heart_rate', payload, room=f"stream:{stream_name}", namespace='/monitor')
        return jsonify({ 'success': True })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

# 额外的广播式 PING（不依赖房间订阅），用于快速验证命名空间是否能收到事件
@app.route('/api/monitor/ping/broadcast', methods=['POST'])
def monitor_ping_broadcast():
    try:
        data = request.get_json(silent=True) or {}
        stream_name = data.get('stream_name') or 'debug'
        payload = {
            'stream_name': stream_name,
            'result': { 'heart_rate': 88, 'confidence': 0.8, 'detection_state': 'broadcast' }
        }
        # 向 /monitor 命名空间所有连接广播
        socketio.emit('student.heart_rate', payload, namespace='/monitor')
        # 同时向默认命名空间广播一个备用事件，便于前端主 Socket 也能看到
        socketio.emit('rtsp_heart_rate_analysis', payload)
        return jsonify({ 'success': True })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

# 简单直连：HTTP 轮询获取最新分析状态（替代依赖 Socket 事件）
@app.route('/api/monitor/state', methods=['GET'])
def monitor_state():
    try:
        sn = request.args.get('stream_name') or request.args.get('stream')
        if not sn:
            return jsonify({ 'success': False, 'message': 'stream_name 必填' }), 400
        st = get_latest_state(sn)
        return jsonify({ 'success': True, 'stream_name': sn, 'state': st })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

@socketio.on('connect', namespace='/monitor')
def handle_monitor_connect():
    try:
        from flask import request as _req
        print(f"[Monitor] namespace connected: sid={_req.sid}")
    except Exception:
        print("[Monitor] namespace connected")
    return True

@socketio.on('monitor/register_sids', namespace='/monitor')
def monitor_register_sids(data=None):
    try:
        from flask import request as _req
        mon_sid = _req.sid
        def_sid = (data or {}).get('default_sid')
        if def_sid:
            _sid_registry[mon_sid] = def_sid
            emit('monitor/registered', { 'ok': True, 'sid_monitor': mon_sid, 'sid_default': def_sid })
        else:
            emit('monitor/registered', { 'ok': False, 'sid_monitor': mon_sid })
    except Exception as e:
        try:
            emit('monitor/registered', { 'ok': False, 'error': str(e) })
        except Exception:
            pass

@socketio.on('disconnect', namespace='/monitor')
def handle_monitor_disconnect():
    try:
        from flask import request as _req
        print(f"[Monitor] namespace disconnected: sid={_req.sid}")
    except Exception:
        print("[Monitor] namespace disconnected")
    return True

@app.route('/api/monitor/rooms', methods=['GET'])
def monitor_rooms():
    """调试：列出 /monitor 命名空间下的房间和成员数量"""
    try:
        mgr = getattr(socketio.server, 'manager', None)
        out = {}
        if mgr and hasattr(mgr, 'rooms'):
            ns = '/monitor'
            rooms_map = mgr.rooms.get(ns, {})
            for room, sids in rooms_map.items():
                out[room] = len(sids)
        return jsonify({ 'success': True, 'rooms': out })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

@app.route('/api/socketio/status', methods=['GET'])
def socketio_status():
    """调试：显示Socket.IO连接状态和客户端信息"""
    try:
        from datetime import datetime
        status_info = {
            'socketio_initialized': socketio is not None,
            'server_initialized': hasattr(socketio, 'server') and socketio.server is not None,
            'rtsp_manager_active_streams': len(rtsp_manager._threads) if rtsp_manager else 0
        }
        
        if socketio.server and hasattr(socketio.server, 'manager'):
            mgr = socketio.server.manager
            # 默认命名空间的客户端
            default_rooms = mgr.rooms.get('/', {})
            status_info['default_namespace_clients'] = sum(len(sids) for sids in default_rooms.values())
            status_info['default_rooms'] = len(default_rooms)
            
            # 监控命名空间的客户端
            monitor_rooms = mgr.rooms.get('/monitor', {})
            status_info['monitor_namespace_clients'] = sum(len(sids) for sids in monitor_rooms.values())
            status_info['monitor_rooms'] = len(monitor_rooms)
            
        return jsonify({
            'success': True,
            'status': status_info,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/end_session', methods=['POST'])
def end_session_api():
    """
    停止检测接口 - 支持学生端API和本地会话
    """
    try:
        request_data = request.get_json()
        session_id = request_data.get('session_id')
        
        if not session_id:
            return jsonify({
                'success': False,
                'message': '缺少会话ID'
            }), 400
        
        # 处理本地会话（active_sessions）
        if session_id in active_sessions:
            # 使用数据管理器结束会话
            success = data_manager.end_session(session_id)
            
            if success:
                # 从活跃会话中移除
                del active_sessions[session_id]
                
                # 重置增强PPG心率检测器
                try:
                    from models.enhanced_ppg_detector import enhanced_ppg_detector
                    enhanced_ppg_detector.reset()
                    print("增强PPG心率检测器已重置")
                except Exception as e:
                    print(f"Warning: Failed to reset enhanced PPG detector: {e}")
                
                return jsonify({
                    'success': True,
                    'message': '会话已结束'
                })
            else:
                return jsonify({
                    'success': False,
                    'message': '结束会话失败'
                }), 500
        
        # 处理学生端API会话
        try:
            result = simple_student_api.end_detection_session(session_id)
            
            # 使用统一清理函数清理所有资源
            if session_id in student_sessions:
                cleanup_session_completely(session_id, "api_end_session")
                
                # 通知教师端学生停止检测
                socketio.emit('student_detection_stopped', {
                    'session_id': session_id,
                    'timestamp': datetime.now().isoformat()
                })
            
            # 重置PPG心率检测器
            try:
                from models.enhanced_ppg_detector import enhanced_ppg_detector
                enhanced_ppg_detector.reset()
            except Exception as e:
                print(f"Warning: Failed to reset enhanced PPG detector: {e}")
                
            return jsonify(result)
        except:
            # 如果学生端API也失败，返回会话不存在错误
            return jsonify({
                'success': False,
                'message': '会话不存在'
            }), 404
            
    except Exception as e:
        print(f"停止检测失败: {e}")
        return jsonify({
            'success': False,
            'message': f'停止检测失败: {str(e)}'
        }), 500

@app.route('/api/analyze_questions', methods=['POST'])
def analyze_questions_api():
    """
    生成心理分析报告接口
    """
    try:
        request_data = request.get_json()
        session_id = request_data.get('session_id')
        questions_data = request_data.get('questions_data', [])
        
        if not session_id:
            return jsonify({
                'success': False,
                'message': '缺少会话ID'
            }), 400
            
        if not questions_data:
            return jsonify({
                'success': False,
                'message': '缺少题目数据'
            }), 400
            
        result = simple_student_api.analyze_exam_questions(session_id, questions_data)
        return jsonify(result)
        
    except Exception as e:
        print(f"题目分析失败: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': f'题目分析失败: {str(e)}'
        }), 500

# 以上功能已移至simple_api.py中实现

# =================== 保留原有的系统功能 ===================

@app.route('/')
def index():
    """主页面"""
    return render_template('index.html')

@app.route('/api/health')
def health_check():
    """健康检查端点"""
    global models_loaded
    local_ip = get_local_ip()
    return jsonify({
        'status': 'ok',
        'models_loaded': models_loaded,
        'lan_ip': local_ip,
        'port': LANConfig.PORT,
        'access_url': f"http://{local_ip}:{LANConfig.PORT}",
        'websocket_url': f"ws://{local_ip}:{LANConfig.PORT}/socket.io/",
        'message': '局域网服务器运行正常'
    })

@app.route('/records')
def records():
    """检测记录页面"""
    return render_template('records.html')

@app.route('/media_test')
def media_test():
    """媒体功能测试页面"""
    return render_template('media_test.html')

@app.route('/api/model_loading_status', methods=['GET'])
def get_model_loading_status():
    """获取模型加载状态"""
    global models_loaded, model_loading_status
    return jsonify({
        'success': True,
        'models_loaded': models_loaded,
        'loading_status': model_loading_status
    })

@app.route('/api/start_session', methods=['POST'])
def start_session():
    """开始新的分析会话"""
    session_id = str(uuid.uuid4())

    # 使用数据管理器创建会话
    session_data = data_manager.create_session(session_id)
    active_sessions[session_id] = session_data

    return jsonify({
        'success': True,
        'session_id': session_id,
        'message': '会话已创建'
    })


@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """获取所有会话列表"""
    sessions = data_manager.get_all_sessions()

    return jsonify({
        'success': True,
        'sessions': sessions
    })

@app.route('/api/student_sessions', methods=['GET'])
def get_student_sessions():
    """获取学生端会话列表（用于教师端监控）"""
    try:
        # 清理过期会话（超过10分钟的非活跃会话，测试期间设置较短时间）
        current_time = datetime.now()
        expired_sessions = []
        
        for session_id, session_data in student_sessions.items():
            try:
                ts_str = session_data.get('last_activity', session_data.get('start_time'))
                if isinstance(ts_str, str):
                    # 处理不同的时间格式：Z后缀、+00:00后缀、或本地时间
                    if ts_str.endswith('Z'):
                        ts_norm = ts_str.replace('Z', '+00:00')
                    elif '+00:00' in ts_str or ts_str.endswith('+00:00'):
                        ts_norm = ts_str
                    else:
                        # 假设是本地时间，添加时区信息
                        ts_norm = ts_str + '+00:00' if 'T' in ts_str and '+' not in ts_str and 'Z' not in ts_str else ts_str
                    last_activity = datetime.fromisoformat(ts_norm)
                elif isinstance(ts_str, datetime):
                    last_activity = ts_str
                else:
                    last_activity = current_time

                if (current_time - last_activity).total_seconds() > 600:
                    expired_sessions.append(session_id)
                    print(f"清理过期会话: {session_id[:8]}...")
            except Exception:
                # 解析失败时不立即清理，采用当前时间作为最后活动时间以避免刚创建即被清理
                print(f"时间解析异常，保留会话: {session_id[:8]}...")
            # 确保存在 stream_name 字段
            if 'stream_name' not in session_data:
                try:
                    session_data['stream_name'] = compute_stream_name(session_data.get('exam_id'), session_data.get('student_id'))
                except Exception:
                    pass

        # 移除过期会话
        for session_id in expired_sessions:
            student_sessions.pop(session_id, None)
            student_streams.pop(session_id, None)
        
        return jsonify({
            'success': True,
            'student_sessions': list(student_sessions.values()),
            'total_students': len(student_sessions),
            'active_students': len([s for s in student_sessions.values() if s.get('status') == 'active'])
        })
        
    except Exception as e:
        print(f"获取学生会话列表失败: {e}")
        return jsonify({
            'success': False,
            'message': f'获取学生会话列表失败: {str(e)}'
        }), 500

@app.route('/api/clear_student_sessions', methods=['POST'])
def clear_student_sessions():
    """清空所有学生会话（用于测试和维护）"""
    try:
        global student_sessions, student_streams
        cleared_count = len(student_sessions)
        student_sessions.clear()
        student_streams.clear()
        
        print(f"已清理 {cleared_count} 个学生会话")
        
        return jsonify({
            'success': True,
            'message': f'已清理 {cleared_count} 个学生会话',
            'cleared_count': cleared_count
        })
        
    except Exception as e:
        print(f"清理学生会话失败: {e}")
        return jsonify({
            'success': False,
            'message': f'清理学生会话失败: {str(e)}'
        }), 500

@app.route('/api/disconnect_student', methods=['POST'])
def disconnect_student():
    """断开学生连接接口"""
    try:
        request_data = request.get_json()
        session_id = request_data.get('session_id')
        
        if not session_id:
            return jsonify({
                'success': False,
                'message': '缺少session_id参数'
            }), 400
        
        # 检查会话是否存在
        if session_id not in student_sessions:
            return jsonify({
                'success': False,
                'message': '学生会话不存在'
            }), 404
        
        # 获取学生信息用于日志
        student_info = student_sessions[session_id]
        student_id = student_info.get('student_id', session_id[:8])
        
        # 停止相关的API会话处理
        if simple_student_api:
            disconnect_result = simple_student_api.force_disconnect_session(session_id)
            print(f"SimpleAPI断开结果: {disconnect_result}")
        
        # 使用统一清理函数清理所有资源
        cleanup_session_completely(session_id, "teacher_disconnect")
        
        # 额外的教师断开通知
        try:
            websocket_handler.emit_to_all('student_disconnected', {
                'session_id': session_id,
                'student_id': student_id,
                'message': f'学生 {student_id} 已被教师断开连接'
            })
        except Exception as ws_error:
            print(f"发送WebSocket通知失败: {ws_error}")
        
        print(f"教师端主动断开学生连接: {student_id} (session: {session_id})")
        
        return jsonify({
            'success': True,
            'message': f'已断开学生 {student_id} 的连接',
            'session_id': session_id,
            'student_id': student_id
        })
        
    except Exception as e:
        print(f"断开学生连接失败: {e}")
        return jsonify({
            'success': False,
            'message': f'断开连接失败: {str(e)}'
        }), 500

# =================== GPU管理API ===================

@app.route('/api/gpu/status', methods=['GET'])
def get_gpu_status():
    """获取GPU状态信息"""
    try:
        status = model_manager.get_system_status()
        return jsonify({
            'success': True,
            'data': status
        })
        
    except Exception as e:
        print(f"获取GPU状态失败: {e}")
        return jsonify({
            'success': False,
            'message': f'获取GPU状态失败: {str(e)}'
        }), 500

@app.route('/api/gpu/optimize', methods=['POST'])
def optimize_gpu_memory():
    """优化GPU内存使用"""
    try:
        success = model_manager.optimize_gpu_memory()
        
        if success:
            return jsonify({
                'success': True,
                'message': 'GPU内存优化完成'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'GPU内存优化失败'
            }), 500
        
    except Exception as e:
        print(f"GPU内存优化失败: {e}")
        return jsonify({
            'success': False,
            'message': f'GPU内存优化失败: {str(e)}'
        }), 500

@app.route('/api/gpu/enable', methods=['POST'])
def enable_gpu_acceleration():
    """启用GPU加速"""
    try:
        model_manager.enable_gpu_optimization()
        
        return jsonify({
            'success': True,
            'message': 'GPU加速已启用'
        })
        
    except Exception as e:
        print(f"启用GPU加速失败: {e}")
        return jsonify({
            'success': False,
            'message': f'启用GPU加速失败: {str(e)}'
        }), 500

@app.route('/api/gpu/disable', methods=['POST'])
def disable_gpu_acceleration():
    """禁用GPU加速"""
    try:
        model_manager.disable_gpu_optimization()
        
        return jsonify({
            'success': True,
            'message': 'GPU加速已禁用'
        })
        
    except Exception as e:
        print(f"禁用GPU加速失败: {e}")
        return jsonify({
            'success': False,
            'message': f'禁用GPU加速失败: {str(e)}'
        }), 500

# =================== 检测记录管理API ===================

def generate_basic_statistics(record_data):
    """为导出格式的文件生成基本统计信息"""
    stats = {}
    
    # 音频情绪统计
    audio_emotions = record_data.get('audio_emotions', [])
    if audio_emotions:
        stats['total_audio_analyses'] = len(audio_emotions)
        # 统计主要情绪
        audio_emotion_dist = {}
        for emotion_data in audio_emotions:
            dominant = emotion_data.get('dominant_emotion', 'unknown')
            audio_emotion_dist[dominant] = audio_emotion_dist.get(dominant, 0) + 1
        stats['audio_emotion_distribution'] = audio_emotion_dist
        
        # 找出最常见的情绪
        if audio_emotion_dist:
            stats['dominant_audio_emotion'] = max(audio_emotion_dist.items(), key=lambda x: x[1])[0]
        else:
            stats['dominant_audio_emotion'] = None
    else:
        stats['total_audio_analyses'] = 0
        stats['audio_emotion_distribution'] = {}
        stats['dominant_audio_emotion'] = None
    
    # 视频情绪统计
    video_emotions = record_data.get('video_emotions', [])
    if video_emotions:
        stats['total_video_analyses'] = len(video_emotions)
        video_emotion_dist = {}
        for emotion_data in video_emotions:
            dominant = emotion_data.get('dominant_emotion', 'unknown')
            video_emotion_dist[dominant] = video_emotion_dist.get(dominant, 0) + 1
        stats['video_emotion_distribution'] = video_emotion_dist
        
        if video_emotion_dist:
            stats['dominant_video_emotion'] = max(video_emotion_dist.items(), key=lambda x: x[1])[0]
        else:
            stats['dominant_video_emotion'] = None
    else:
        stats['total_video_analyses'] = 0
        stats['video_emotion_distribution'] = {}
        stats['dominant_video_emotion'] = None
    
    # 心率统计
    heart_rate_data = record_data.get('heart_rate_data', [])
    if heart_rate_data:
        stats['total_heart_rate_readings'] = len(heart_rate_data)
        heart_rates = [data.get('heart_rate', 0) for data in heart_rate_data if data.get('heart_rate')]
        if heart_rates:
            stats['average_heart_rate'] = sum(heart_rates) / len(heart_rates)
            stats['heart_rate_range'] = {
                'min': min(heart_rates),
                'max': max(heart_rates)
            }
        else:
            stats['average_heart_rate'] = 0.0
            stats['heart_rate_range'] = {'min': 0, 'max': 0}
    else:
        stats['total_heart_rate_readings'] = 0
        stats['average_heart_rate'] = 0.0
        stats['heart_rate_range'] = {'min': 0, 'max': 0}
    
    # 计算持续时间
    start_time = record_data.get('start_time')
    end_time = record_data.get('end_time')
    if start_time and end_time:
        try:
            start_dt = datetime.fromisoformat(start_time)
            end_dt = datetime.fromisoformat(end_time)
            duration = (end_dt - start_dt).total_seconds()
            stats['duration_seconds'] = max(0, duration)
        except:
            stats['duration_seconds'] = 0
    else:
        stats['duration_seconds'] = 0
    
    return stats

@app.route('/api/records', methods=['GET'])
def get_saved_records():
    """获取数据库中保存的记录"""
    try:
        import os
        database_path = os.path.join(os.path.dirname(__file__), 'database')
        
        if not os.path.exists(database_path):
            return jsonify({
                'success': True,
                'records': []
            })
        
        records = []
        for filename in os.listdir(database_path):
            if filename.endswith('.json'):
                file_path = os.path.join(database_path, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        record_data = json.load(f)
                        
                        # 确保记录有必要的字段
                        if not record_data.get('session_id'):
                            record_data['session_id'] = filename.replace('.json', '')
                        
                        # 如果没有统计信息，生成基本统计
                        if not record_data.get('statistics'):
                            record_data['statistics'] = generate_basic_statistics(record_data)
                        
                        # 如果没有开始/结束时间，尝试从数据中推断
                        if not record_data.get('start_time') or not record_data.get('end_time'):
                            all_timestamps = []
                            for emotion_data in (record_data.get('audio_emotions', []) + 
                                               record_data.get('video_emotions', []) + 
                                               record_data.get('heart_rate_data', [])):
                                if emotion_data.get('timestamp'):
                                    all_timestamps.append(emotion_data['timestamp'])
                            
                            if all_timestamps:
                                all_timestamps.sort()
                                record_data['start_time'] = record_data.get('start_time', all_timestamps[0])
                                record_data['end_time'] = record_data.get('end_time', all_timestamps[-1])
                        
                        records.append(record_data)
                except Exception as e:
                    print(f"读取记录文件失败 {filename}: {e}")
        
        # 按开始时间倒序排列
        records.sort(key=lambda x: x.get('start_time', ''), reverse=True)
        
        return jsonify({
            'success': True,
            'records': records
        })
        
    except Exception as e:
        print(f"获取记录失败: {e}")
        return jsonify({
            'success': False,
            'message': f'获取记录失败: {str(e)}'
        }), 500

@app.route('/api/records/<session_id>', methods=['DELETE'])
def delete_saved_record(session_id):
    """删除保存的记录"""
    try:
        import os
        database_path = os.path.join(os.path.dirname(__file__), 'database')
        file_path = os.path.join(database_path, f'{session_id}.json')
        
        if os.path.exists(file_path):
            os.remove(file_path)
            return jsonify({
                'success': True,
                'message': '记录删除成功'
            })
        else:
            return jsonify({
                'success': False,
                'message': '记录不存在'
            }), 404
    except Exception as e:
        print(f"删除记录失败: {e}")
        return jsonify({
            'success': False,
            'message': f'删除记录失败: {str(e)}'
        }), 500

@app.route('/api/save_record', methods=['POST'])
def save_record():
    """保存检测记录到数据库"""
    try:
        request_data = request.get_json()
        session_id = request_data.get('session_id')
        
        if not session_id:
            return jsonify({
                'success': False,
                'message': '缺少会话ID'
            }), 400
        
        # 从sessions获取完整数据
        session_data = data_manager.load_session(session_id)
        if not session_data:
            return jsonify({
                'success': False,
                'message': '会话数据不存在'
            }), 404
        
        # 确保会话已正确结束（设置结束时间和统计信息）
        if not session_data.get('end_time'):
            print(f"会话 {session_id} 尚未结束，正在设置结束时间...")
            data_manager.end_session(session_id)
            # 重新加载数据以获取更新后的信息
            session_data = data_manager.load_session(session_id)
        
        # 保存到数据库文件夹
        import os
        database_path = os.path.join(os.path.dirname(__file__), 'database')
        os.makedirs(database_path, exist_ok=True)
        
        file_path = os.path.join(database_path, f'{session_id}.json')
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(session_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'success': True,
            'message': '记录保存成功'
        })
    except Exception as e:
        print(f"保存记录失败: {e}")
        return jsonify({
            'success': False,
            'message': f'保存记录失败: {str(e)}'
        }), 500

@app.route('/api/ai_analysis', methods=['POST'])
def ai_analysis():
    """使用千问模型分析检测记录"""
    try:
        import requests
        
        request_data = request.get_json()
        session_id = request_data.get('session_id')
        
        if not session_id:
            return jsonify({
                'success': False,
                'message': '缺少会话ID'
            }), 400
        
        # 获取记录数据
        database_path = os.path.join(os.path.dirname(__file__), 'database')
        file_path = os.path.join(database_path, f'{session_id}.json')
        
        if not os.path.exists(file_path):
            return jsonify({
                'success': False,
                'message': '记录不存在'
            }), 404
        
        with open(file_path, 'r', encoding='utf-8') as f:
            record_data = json.load(f)
        
        # 使用千问AI生成心理分析报告
        analysis_result = call_qianwen_for_database_analysis(record_data)
        
        return jsonify({
            'success': True,
            'analysis': analysis_result
        })
        
    except Exception as e:
        print(f"AI分析失败: {e}")
        # 打印详细的错误信息以便调试
        import traceback
        traceback.print_exc()
        
        # 返回详细的错误信息，不使用本地备用方案
        return jsonify({
            'success': False,
            'message': f'千问AI分析失败: {str(e)}。请检查网络连接和API配置。'
        }), 500

def call_qianwen_for_database_analysis(record_data):
    """调用千问AI分析数据库中的检测记录"""
    try:
        import requests
        
        # 构建专门用于数据库记录分析的提示词
        prompt = build_database_analysis_prompt(record_data)
        
        # 调用千问API - 使用最新的通义千问API格式
        headers = {
            'Authorization': 'Bearer sk-0d506103c664443ca37f9866c9702b4c',
            'Content-Type': 'application/json'
        }
        
        # 使用千问Plus的正确API格式
        data = {
            'model': 'qwen-plus',
            'input': {
                'prompt': prompt
            },
            'parameters': {
                'temperature': 0.7,
                'max_tokens': 1000,  # 减少最大token数量，控制输出长度
                'top_p': 0.8,
                'result_format': 'text'
            }
        }
        
        print("正在调用千问AI进行心理分析...")
        print(f"API Key前8位: {headers['Authorization'][:16]}...")
        
        response = requests.post(
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
            headers=headers,
            json=data,
            timeout=30  # 减少超时时间，避免长时间等待
        )
        
        print(f"千问API响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"千问API响应: {result}")
            
            # 检查多种可能的响应格式
            ai_analysis = None
            if 'output' in result:
                if 'text' in result['output']:
                    ai_analysis = result['output']['text']
                elif 'choices' in result['output'] and len(result['output']['choices']) > 0:
                    ai_analysis = result['output']['choices'][0].get('message', {}).get('content')
            elif 'choices' in result and len(result['choices']) > 0:
                ai_analysis = result['choices'][0].get('message', {}).get('content')
            
            if ai_analysis:
                print(f"千问AI分析成功，返回长度: {len(ai_analysis)}")
                return ai_analysis
            else:
                raise Exception(f"API响应格式错误，无法提取分析结果: {result}")
        else:
            error_text = response.text
            print(f"千问API调用失败: {response.status_code}, {error_text}")
            raise Exception(f"API调用失败: {response.status_code}, {error_text}")
            
    except Exception as e:
        print(f"千问AI调用失败: {e}")
        import traceback
        traceback.print_exc()
        raise e

def build_database_analysis_prompt(record_data):
    """构建数据库记录分析的AI提示词"""
    
    # 分析情绪数据
    video_emotions = record_data.get('video_emotions', [])
    audio_emotions = record_data.get('audio_emotions', [])
    heart_rate_data = record_data.get('heart_rate_data', [])
    
    # 计算情绪分布和变化趋势
    emotion_analysis = analyze_emotion_patterns(video_emotions, audio_emotions)
    heart_rate_analysis = analyze_heart_rate_patterns(heart_rate_data)
    
    prompt = f"""作为心理健康专家，请基于以下监测数据撰写一份简洁的心理状态分析报告（严格控制在800字以内）。

【数据概览】
监测时长: {record_data.get('statistics', {}).get('duration_seconds', 0)/60:.1f} 分钟 | 面部分析: {len(video_emotions)} 次 | 语音分析: {len(audio_emotions)} 次 | 心率监测: {len(heart_rate_data)} 次

【情绪分析】{emotion_analysis}

【生理分析】{heart_rate_analysis}

【时间轴】{build_emotion_timeline(video_emotions, audio_emotions, heart_rate_data)}

请围绕以下4个方面简洁分析（每部分约150-200字）：
1. **心理状态评估** - 情绪稳定性和压力承受能力
2. **行为模式分析** - 情绪变化的心理机制  
3. **应激反应特征** - 心率与情绪的关联性
4. **调节建议** - 3-4条具体可行的心理调节方法

要求：
- 总字数严格控制在800字以内
- 语言专业温和，避免病理化表述
- 重点关注心理调节和成长建议
- 每个建议都要具体可操作"""

    return prompt

def analyze_emotion_patterns(video_emotions, audio_emotions):
    """分析情绪模式和特征"""
    try:
        if not video_emotions and not audio_emotions:
            return "数据不足"
        
        # 分析主要情绪
        all_emotions = []
        if video_emotions:
            all_emotions.extend([e.get('dominant_emotion') for e in video_emotions])
        if audio_emotions:
            all_emotions.extend([e.get('dominant_emotion') for e in audio_emotions])
        
        if all_emotions:
            emotion_counts = {}
            for emotion in all_emotions:
                emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1
            
            # 找出主要情绪
            main_emotion = max(emotion_counts.items(), key=lambda x: x[1])
            return f"主要情绪为{main_emotion[0]}({main_emotion[1]}次)，情绪类型共{len(emotion_counts)}种"
        
        return "情绪数据无效"
        
    except Exception as e:
        return "分析异常"

def analyze_heart_rate_patterns(heart_rate_data):
    """分析心率模式"""
    try:
        if not heart_rate_data:
            return "无心率数据"
        
        heart_rates = [hr.get('heart_rate') for hr in heart_rate_data if hr.get('heart_rate')]
        if not heart_rates:
            return "心率数据无效"
        
        avg_hr = sum(heart_rates) / len(heart_rates)
        min_hr = min(heart_rates)
        max_hr = max(heart_rates)
        
        # 简化趋势分析
        if len(heart_rates) > 5:
            first_half = sum(heart_rates[:len(heart_rates)//2]) / (len(heart_rates)//2)
            second_half = sum(heart_rates[len(heart_rates)//2:]) / (len(heart_rates) - len(heart_rates)//2)
            trend = "上升" if second_half > first_half + 5 else "下降" if second_half < first_half - 5 else "稳定"
        else:
            trend = "稳定"
        
        return f"平均{avg_hr:.0f}bpm，范围{min_hr}-{max_hr}bpm，趋势{trend}"
        
    except Exception as e:
        return "分析异常"

def build_emotion_timeline(video_emotions, audio_emotions, heart_rate_data):
    """构建情绪变化时间轴"""
    try:
        if not any([video_emotions, audio_emotions, heart_rate_data]):
            return "无时间轴数据"
        
        # 简化为开始和结束状态对比
        if video_emotions and len(video_emotions) > 1:
            start_emotion = video_emotions[0].get('dominant_emotion', '未知')
            end_emotion = video_emotions[-1].get('dominant_emotion', '未知')
            
            if start_emotion == end_emotion:
                return f"情绪整体保持{start_emotion}状态"
            else:
                return f"情绪从{start_emotion}转变为{end_emotion}"
        
        return "时间轴数据不足"
        
    except Exception as e:
        return "分析异常"


def generate_psychological_analysis(record_data):
    """生成心理分析报告（简化版本）"""
    try:
        # 获取统计数据
        stats = record_data.get('statistics', {})
        
        # 基本信息
        duration = stats.get('duration_seconds', 0)
        duration_minutes = duration / 60
        
        # 情绪分析
        dominant_video_emotion = stats.get('dominant_video_emotion', '未知')
        dominant_audio_emotion = stats.get('dominant_audio_emotion', '未知')
        
        # 心率分析
        avg_heart_rate = stats.get('average_heart_rate', 0)
        heart_rate_range = stats.get('heart_rate_range', {})
        
        # 生成报告
        report = f"""心理状态分析报告

【检测概况】
检测时长: {duration_minutes:.1f} 分钟
面部分析次数: {stats.get('total_video_analyses', 0)} 次
语音分析次数: {stats.get('total_audio_analyses', 0)} 次
心率检测次数: {stats.get('total_heart_rate_readings', 0)} 次

【情绪状态分析】
主要面部情绪: {dominant_video_emotion}
主要语音情绪: {dominant_audio_emotion}

【生理指标分析】
平均心率: {avg_heart_rate:.1f} bpm
心率范围: {heart_rate_range.get('min', 0)}-{heart_rate_range.get('max', 0)} bpm

【心理状态评估】"""

        # 添加情绪评估
        if dominant_video_emotion == 'neutral' or dominant_audio_emotion == 'neutral':
            report += "\n情绪状态相对稳定，表现出较好的心理平衡。"
        elif dominant_video_emotion in ['happy', 'surprise'] or dominant_audio_emotion in ['happy', 'surprise']:
            report += "\n情绪状态积极，心理状态良好。"
        elif dominant_video_emotion in ['sad', 'fear', 'angry'] or dominant_audio_emotion in ['sad', 'fear', 'angry']:
            report += "\n检测到一些负面情绪，建议关注心理健康。"
        
        # 添加心率评估
        if avg_heart_rate > 0:
            if avg_heart_rate < 60:
                report += "\n心率偏低，可能处于放松状态。"
            elif avg_heart_rate > 100:
                report += "\n心率偏高，可能存在紧张或压力。"
            else:
                report += "\n心率正常，生理状态良好。"
        
        report += "\n\n【建议】\n基于检测结果，建议保持良好的心理状态，适当进行放松训练，如有异常情况请咨询专业人士。"
        
        return report
        
    except Exception as e:
        print(f"生成心理分析报告失败: {e}")
        return "分析报告生成失败，请稍后重试。"

# 保留原有的所有API接口和WebSocket处理函数

# WebSocket事件处理
@socketio.on('connect')
def handle_connect():
    """客户端连接"""
    print(f'Client connected: {request.sid}')
    emit('connected', {'message': '连接成功'})
    return True

@socketio.on('disconnect')
def handle_disconnect():
    """客户端断开连接"""
    print(f'Client disconnected: {request.sid}')
    return True

@socketio.on('audio_data')
def handle_audio_data(data):
    """处理音频数据 - 使用Emotion2Vec进行语音情绪分析"""
    # 恢复本机检测入口：本地页面通过 Socket.IO 直接发送音频分片
    # 兼容 MediaMTX 方案并行存在，二者互不影响
    try:
        session_id = data.get('session_id')
        audio_data = data.get('audio_data')
        use_segmentation = data.get('use_segmentation', False)

        if not session_id or not audio_data:
            print("[音频接收] 错误: 缺少session_id或audio_data")
            print(f"   session_id存在: {session_id is not None}, audio_data存在: {audio_data is not None}")
            return

        print(f"[音频接收] 收到学生音频数据 - 会话ID: {session_id[:8]}..., 数据大小: {len(audio_data) if audio_data else 0}字节, 分段处理: {use_segmentation}")
        
        # 检查学生会话是否存在
        if session_id not in student_sessions:
            print(f"[音频接收] 警告: 会话{session_id[:8]}...不在student_sessions中")
        else:
            student_info = student_sessions[session_id]
            print(f"[音频接收] 学生信息: ID={student_info.get('student_id')}, 考试ID={student_info.get('exam_id')}")

        # 更新学生会话活动时间
        if session_id in student_sessions:
            student_sessions[session_id]['last_activity'] = datetime.now().isoformat()
            print(f"[音频转发] 更新学生活动时间: {student_sessions[session_id]['last_activity']}")
            
            # 存储音频流数据供教师端监控
            if session_id not in student_streams:
                student_streams[session_id] = {'audio': [], 'video': []}
                print(f"[音频转发] 为会话{session_id[:8]}...创建新的音频流存储")
            
            # 转发音频数据给教师端（用于监控显示）
            student_id = student_sessions[session_id].get('student_id', '')
            # 确保中文字符正确编码
            if isinstance(student_id, str):
                student_id = student_id.encode('utf-8').decode('utf-8')
            
            print(f"[音频转发] 正在向教师端转发音频数据 - 学生ID: {student_id}")
            socketio.emit('student_audio_stream', {
                'session_id': session_id,
                'student_id': student_id,
                'audio_data': audio_data,
                'timestamp': datetime.now().isoformat()
            })
            print(f"[音频转发] 音频数据已发送给教师端监控界面")
        else:
            print(f"[音频转发] 会话{session_id[:8]}...不在student_sessions中，无法转发给教师端")

        # 解码音频数据
        try:
            if audio_data.startswith('data:'):
                audio_data = audio_data.split(',')[1]

            audio_bytes = base64.b64decode(audio_data)
            print(f"音频数据解码成功，字节大小: {len(audio_bytes)}")
        except Exception as decode_error:
            print(f"Warning: Audio decode failed: {decode_error}")
            default_result = {
                'emotions': {'neutral': 1.0},
                'dominant_emotion': 'neutral',
                'confidence': 0.1,
                'model': 'decode_error',
                'timestamp': datetime.now().isoformat(),
                'analysis_type': 'audio_emotion'
            }
            emit('audio_emotion_result', {
                'session_id': session_id,
                'result': default_result
            })
            return

        # 使用Emotion2Vec分析音频情绪
        try:
            print(f"🎵 [音频情绪] 开始使用Emotion2Vec分析语音情绪 - 会话ID: {session_id[:8]}...")
            
            # 监控GPU性能
            model_manager.monitor_performance()
            
            analyzer = model_manager.get_emotion2vec_analyzer()

            # 确保分析器已初始化
            if not analyzer.is_initialized:
                print(f"⚙️ [音频情绪] Emotion2Vec分析器未初始化，正在初始化...")
                analyzer.initialize()
                
                # 初始化后优化GPU内存
                if hasattr(analyzer, 'use_gpu') and analyzer.use_gpu:
                    analyzer.optimize_gpu_memory()
                print(f"✅ [音频情绪] Emotion2Vec分析器初始化完成")
            else:
                print(f"✅ [音频情绪] Emotion2Vec分析器已初始化")

            if use_segmentation:
                # 使用分段处理
                from models.audio_segmenter import audio_segmenter
                from models.audio_processor import webrtc_audio_processor

                print("使用分段处理模式...")

                # 预处理音频
                audio_array = webrtc_audio_processor.process_webrtc_audio(audio_bytes)

                # 分段处理
                segments = audio_segmenter.segment_audio(audio_array)

                def segment_callback(result):
                    """分段结果回调"""
                    result['timestamp'] = datetime.now().isoformat()
                    result['session_id'] = session_id
                    result['is_segment'] = True

                    # 保存到数据管理器
                    data_manager.add_audio_emotion(session_id, result)

                    # 发送分段结果
                    emit('audio_emotion_segment_result', {
                        'session_id': session_id,
                        'result': result
                    })

                # 分析所有片段
                segment_results = audio_segmenter.analyze_segments(segments, segment_callback)

                # 计算整体结果（取最后一个片段的结果作为主要结果）
                if segment_results:
                    final_result = segment_results[-1].copy()
                    final_result['is_segment'] = False
                    final_result['total_segments'] = len(segment_results)
                    final_result['segment_results'] = [
                        {
                            'segment_index': r['segment_index'],
                            'start_time': r['segment_start_time'],
                            'end_time': r['segment_end_time'],
                            'dominant_emotion': r['dominant_emotion'],
                            'confidence': r['confidence']
                        } for r in segment_results
                    ]

                    # 发送最终结果
                    emit('audio_emotion_result', {
                        'session_id': session_id,
                        'result': final_result
                    })

                    print(f"分段语音情绪分析完成: {len(segments)}个片段")
                else:
                    raise Exception("分段处理未产生任何结果")
            else:
                # 传统的整体处理
                print(f"🔍 [音频情绪] 开始整体分析模式")
                emotion_result = analyzer.analyze(audio_bytes)
                emotion_result['timestamp'] = datetime.now().isoformat()

                dominant_emotion = emotion_result.get('dominant_emotion', 'unknown')
                confidence = emotion_result.get('confidence', 0)
                model_name = emotion_result.get('model', 'unknown')
                
                print(f"✅ [音频情绪] 语音情绪分析完成:")
                print(f"   主要情绪: {dominant_emotion}")
                print(f"   置信度: {confidence:.2f}")
                print(f"   使用模型: {model_name}")

                # 保存到数据管理器
                print(f"💾 [音频情绪] 保存语音情绪结果到数据管理器")
                data_manager.add_audio_emotion(session_id, emotion_result)

                # 发送分析结果
                print(f"📤 [音频情绪] 发送语音情绪结果给学生端")
                emit('audio_emotion_result', {
                    'session_id': session_id,
                    'result': emotion_result
                })
                print(f"✅ [音频情绪] 已发送语音情绪结果给学生端: {dominant_emotion}")
                
                # 转发分析结果给教师端监控
                if session_id in student_sessions:
                    student_id = student_sessions[session_id].get('student_id')
                    print(f"📡 [音频情绪] 转发语音情绪结果给教师端 - 学生ID: {student_id}")
                    socketio.emit('student_audio_emotion_result', {
                        'session_id': session_id,
                        'student_id': student_id,
                        'result': emotion_result
                    })
                    print(f"✅ [音频情绪] 已转发给教师端监控界面")
                else:
                    print(f"⚠️  [音频情绪] 会话{session_id[:8]}...不在student_sessions中，无法转发给教师端")

        except Exception as analysis_error:
            print(f"❌ [音频情绪] 语音情绪分析失败: {analysis_error}")
            import traceback
            traceback.print_exc()
            
            # 直接发送错误信息，不使用备用方案
            print(f"📤 [音频情绪] 发送错误信息给学生端")
            emit('error', {
                'type': 'audio_analysis_error',
                'message': f'语音情绪分析失败: {str(analysis_error)}',
                'session_id': session_id
            })

    except Exception as e:
        print(f"❌ [音频处理] 处理音频数据失败: {e}")
        import traceback
        traceback.print_exc()

@socketio.on('video_frame')
def handle_video_frame(data):
    """处理视频帧数据"""
    # 恢复本机检测入口：本地页面通过 Socket.IO 直接发送视频帧（base64）
    # 兼容 MediaMTX 方案并行存在，二者互不影响
    try:
        session_id = data.get('session_id')
        frame_data = data.get('frame_data')

        if not session_id or not frame_data:
            print("[视频接收] 错误: 缺少session_id或frame_data")
            print(f"   session_id存在: {session_id is not None}, frame_data存在: {frame_data is not None}")
            print("[调试] 学生端问题: 学生端未发送完整的视频数据")
            return

        print(f"[视频接收] 收到学生视频帧 - 会话ID: {session_id[:8]}..., 数据大小: {len(frame_data) if frame_data else 0}字节")
        print("[调试] 学生端正常: 学生端已成功发送视频数据给教师端")
        
        # 检查学生会话是否存在
        if session_id not in student_sessions:
            print(f"[视频接收] 错误: 会话{session_id[:8]}...不在student_sessions中")
            print("[调试] 教师端问题: 学生会话未在教师端注册，请检查学生是否正确连接")
        else:
            student_info = student_sessions[session_id]
            print(f"[视频接收] 学生信息: ID={student_info.get('student_id')}, 考试ID={student_info.get('exam_id')}")
            print("[调试] 会话状态正常: 学生会话已在教师端正确注册")

        # 更新学生会话活动时间
        if session_id in student_sessions:
            student_sessions[session_id]['last_activity'] = datetime.now().isoformat()
            print(f"[视频转发] 更新学生活动时间: {student_sessions[session_id]['last_activity']}")
            
            # 存储视频流数据供教师端监控
            if session_id not in student_streams:
                student_streams[session_id] = {'audio': [], 'video': []}
                print(f"[视频转发] 为会话{session_id[:8]}...创建新的视频流存储")
            
            # 转发视频帧给教师端（用于监控显示）
            student_id = student_sessions[session_id].get('student_id', '')
            # 确保中文字符正确编码
            if isinstance(student_id, str):
                student_id = student_id.encode('utf-8').decode('utf-8')
            
            print(f"[视频转发] 正在向教师端转发视频帧 - 学生ID: {student_id}")
            print(f"[调试] 转发数据: session_id={session_id[:8]}..., 数据大小={len(frame_data)}字节")
            
            # 尝试转发视频流数据
            try:
                socketio.emit('student_video_stream', {
                    'session_id': session_id,
                    'student_id': student_id,
                    'frame_data': frame_data,
                    'timestamp': datetime.now().isoformat()
                })
                print(f"[视频转发] 视频帧已成功发送给教师端监控界面")
                print("[调试] 教师端正常: 视频数据已成功转发给教师端WebSocket")
            except Exception as emit_error:
                print(f"[视频转发] WebSocket转发失败: {emit_error}")
                print("[调试] 教师端问题: WebSocket转发视频数据时出错")
        else:
            print(f"[视频转发] 会话{session_id[:8]}...不在student_sessions中，无法转发给教师端")
            print("[调试] 教师端问题: 学生会话管理异常，无法转发视频数据")

        # 直接处理视频帧
        print(f"[视频处理] 开始处理视频帧 - 会话ID: {session_id[:8]}...")
        _process_video_frame_internal(session_id, frame_data)

    except Exception as e:
        print(f"[视频处理] 视频帧处理器错误: {e}")
        import traceback
        traceback.print_exc()

def _process_video_frame_internal(session_id: str, frame_data: str, simplified: bool = False):
    """内部视频帧处理函数"""
    try:
        print(f"🖼️ [视频解码] 开始解码视频帧 - 会话ID: {session_id[:8]}...")
        
        # 解码图像数据
        try:
            if frame_data.startswith('data:'):
                frame_data = frame_data.split(',')[1]
                print(f"📄 [视频解码] 移除数据URL前缀")

            image_bytes = base64.b64decode(frame_data)
            image = Image.open(io.BytesIO(image_bytes))
            image_array = np.array(image)
            print(f"✅ [视频解码] 视频帧解码成功 - 图像尺寸: {image_array.shape}, 数据类型: {image_array.dtype}")
        except Exception as decode_error:
            print(f"❌ [视频解码] 视频帧解码失败: {decode_error}")
            print(f"   原始数据长度: {len(frame_data) if frame_data else 'None'}")
            print(f"   数据格式: {frame_data[:50] if frame_data else 'None'}...")
            
            default_result = {
                'face_detected': False,
                'emotions': {'neutral': 1.0},
                'dominant_emotion': 'neutral',
                'confidence': 0.1,
                'model': 'decode_error',
                'timestamp': datetime.now().isoformat(),
                'analysis_type': 'video_emotion'
            }
            emit('video_emotion_result', {
                'session_id': session_id,
                'result': default_result
            })
            print(f"📤 [视频解码] 已发送默认结果给前端")
            return

        # 执行情绪分析和心率检测
        print(f"🧠 [视频分析] 开始执行完整的视频分析(情绪+心率)")
        _perform_full_video_analysis(session_id, image_array)

    except Exception as e:
        print(f"❌ [视频处理] 处理视频帧失败: {e}")
        import traceback
        traceback.print_exc()

def _perform_full_video_analysis(session_id: str, image_array: np.ndarray):
    """执行完整的视频分析（情绪+心率）"""
    try:
        print(f"😄 [情绪分析] 开始使用DeepFace分析面部情绪 - 会话ID: {session_id[:8]}...")
        
        # 监控GPU性能
        model_manager.monitor_performance()
        
        # 使用DeepFace分析面部情绪
        deepface_analyzer = model_manager.get_deepface_analyzer()
        
        # 优化GPU内存使用
        if hasattr(deepface_analyzer, 'use_gpu') and deepface_analyzer.use_gpu:
            deepface_analyzer.optimize_gpu_memory()
        
        emotion_result = deepface_analyzer.analyze(image_array)
        emotion_result['timestamp'] = datetime.now().isoformat()

        face_detected = emotion_result.get('face_detected', False)
        dominant_emotion = emotion_result.get('dominant_emotion', 'unknown')
        confidence = emotion_result.get('confidence', 0)
        
        print(f"✅ [情绪分析] 面部情纪分析完成:")
        print(f"   人脸检测: {'✅' if face_detected else '❌'} {face_detected}")
        print(f"   主要情绪: {dominant_emotion}")
        print(f"   置信度: {confidence:.2f}")

        # 保存到数据管理器
        print(f"💾 [情绪分析] 保存情绪结果到数据管理器")
        data_manager.add_video_emotion(session_id, emotion_result)

        # 发送分析结果
        print(f"📤 [情绪分析] 发送视频情绪结果给学生端")
        socketio.emit('video_emotion_result', {
            'session_id': session_id,
            'result': emotion_result
        })
        print(f"✅ [情绪分析] 已发送视频情绪结果给学生端: {dominant_emotion}")
        
        # 转发分析结果给教师端监控
        if session_id in student_sessions:
            student_id = student_sessions[session_id].get('student_id')
            print(f"[情绪分析] 转发视频情绪结果给教师端 - 学生ID: {student_id}")
            print(f"[调试] 情绪分析数据: {dominant_emotion}, 置信度: {confidence:.2f}")
            
            try:
                socketio.emit('student_video_emotion_result', {
                    'session_id': session_id,
                    'student_id': student_id,
                    'result': emotion_result
                })
                print(f"[情绪分析] 已转发给教师端监控界面")
                print("[调试] 教师端正常: 情绪分析结果已成功发送给教师端")
            except Exception as emotion_emit_error:
                print(f"[情绪分析] 转发情绪结果失败: {emotion_emit_error}")
                print("[调试] 教师端问题: WebSocket转发情绪分析结果时出错")
        else:
            print(f"[情绪分析] 会话{session_id[:8]}...不在student_sessions中，无法转发给教师端")
            print("[调试] 教师端问题: 学生会话管理异常，无法转发情绪分析结果")

        # PPG心率检测
        print("[心率检测] 开始执行PPG心率检测")
        _perform_heart_rate_detection(session_id, image_array, emotion_result.get('face_detected', False))

    except Exception as e:
        print(f"❌ [视频分析] 完整视频分析失败: {e}")
        import traceback
        traceback.print_exc()

def _perform_heart_rate_detection(session_id: str, image_array: np.ndarray, face_detected: bool):
    """执行心率检测"""
    try:
        print(f"💗 [心率检测] 开始处理心率检测 - 会话ID: {session_id[:8]}..., 人脸检测: {face_detected}")
        
        from models.enhanced_ppg_detector import enhanced_ppg_detector

        heart_rate_result = enhanced_ppg_detector.process_frame(image_array, face_detected)
        heart_rate_result['timestamp'] = datetime.now().isoformat()

        detection_state = heart_rate_result.get('detection_state', 'waiting')
        heart_rate = heart_rate_result.get('heart_rate')
        buffer_size = heart_rate_result.get('buffer_size', 0)
        confidence = heart_rate_result.get('confidence', 0)
        
        print(f"📊 [心率检测] PPG检测结果:")
        print(f"   检测状态: {detection_state}")
        print(f"   心率值: {heart_rate if heart_rate else 'N/A'}")
        print(f"   缓冲区大小: {buffer_size}")
        print(f"   置信度: {confidence:.2f}" if confidence else "   置信度: N/A")

        # 保存数据到数据管理器
        if detection_state == 'calculating' and heart_rate is not None:
            print(f"💾 [心率检测] 保存心率数据到数据管理器: {heart_rate} bpm")
            data_manager.add_heart_rate_data(session_id, heart_rate_result)
        else:
            print(f"🔄 [心率检测] 暂不保存数据 (状态: {detection_state}, 心率: {heart_rate})")

        # 发送心率检测结果
        print(f"📤 [心率检测] 发送心率结果给学生端")
        socketio.emit('heart_rate_result', {
            'session_id': session_id,
            'result': heart_rate_result
        })
        print(f"✅ [心率检测] 已发送心率结果给学生端: 状态={detection_state}, 心率={heart_rate}")
        
        # 转发心率检测结果给教师端监控
        if session_id in student_sessions:
            student_id = student_sessions[session_id].get('student_id')
            print(f"[心率检测] 转发心率结果给教师端 - 学生ID: {student_id}")
            print(f"[调试] 心率检测数据: 状态={detection_state}, 心率={heart_rate}, 置信度={confidence:.2f}" if confidence else f"[调试] 心率检测数据: 状态={detection_state}, 心率={heart_rate}")
            
            try:
                socketio.emit('student_heart_rate_result', {
                    'session_id': session_id,
                    'student_id': student_id,
                    'result': heart_rate_result
                })
                print(f"[心率检测] 已转发给教师端监控界面")
                print("[调试] 教师端正常: 心率检测结果已成功发送给教师端")
            except Exception as heart_rate_emit_error:
                print(f"[心率检测] 转发心率结果失败: {heart_rate_emit_error}")
                print("[调试] 教师端问题: WebSocket转发心率检测结果时出错")
        else:
            print(f"[心率检测] 会话{session_id[:8]}...不在student_sessions中，无法转发给教师端")
            print("[调试] 教师端问题: 学生会话管理异常，无法转发心率检测结果")

    except Exception as e:
        print(f"❌ [心率检测] 心率检测失败: {e}")
        import traceback
        traceback.print_exc()

def initialize_models():
    """预加载所有AI模型"""
    global models_loaded, model_loading_status

    print("="*60)
    print("情绪分析系统启动中 - 正在加载AI模型...")
    print("="*60)

    model_loading_status['loading'] = True
    model_loading_status['progress'] = 0
    model_loading_status['error'] = None

    try:
        # 加载 Emotion2Vec 模型
        model_loading_status['current_model'] = 'Emotion2Vec 语音情绪分析模型'
        model_loading_status['progress'] = 10
        print("正在加载 Emotion2Vec 语音情绪分析模型...")

        emotion2vec = model_manager.get_emotion2vec_analyzer()
        if not emotion2vec.is_initialized:
            emotion2vec.initialize()
        print("Emotion2Vec 模型加载完成")
        model_loading_status['progress'] = 40

        # 加载 DeepFace 模型
        model_loading_status['current_model'] = 'DeepFace 面部情绪分析模型'
        model_loading_status['progress'] = 50
        print("正在加载 DeepFace 面部情绪分析模型...")

        deepface = model_manager.get_deepface_analyzer()
        if hasattr(deepface, 'initialize') and not getattr(deepface, 'is_initialized', False):
            deepface.initialize()
        print("DeepFace 模型加载完成")
        model_loading_status['progress'] = 80

        # 加载视频处理器
        model_loading_status['current_model'] = '视频处理器'
        model_loading_status['progress'] = 90
        print("正在加载视频处理器...")

        video_processor = model_manager.get_video_processor()
        print("视频处理器加载完成")
        model_loading_status['progress'] = 100

        # 完成加载
        model_loading_status['loading'] = False
        model_loading_status['current_model'] = '加载完成'
        models_loaded = True

        print("="*60)
        print("所有AI模型加载完成，系统已就绪！")
        print("支持功能：")
        print("  - 语音情绪分析: Emotion2Vec")
        print("  - 面部情绪分析: DeepFace")
        print("  - 视频处理: VideoProcessor")
        print("  - PPG心率检测: 增强算法")
        print("="*60)
        return True

    except Exception as e:
        print(f"模型加载失败: {e}")
        model_loading_status['loading'] = False
        model_loading_status['error'] = str(e)
        models_loaded = True
        print("系统将使用备用方案运行")
        print("="*60)
        return False

if __name__ == '__main__':
    import threading

    print("启动情绪分析系统 - 局域网模式...")
    local_ip = get_local_ip()
    
    print(f"局域网IP地址: {local_ip}")
    print(f"访问地址: http://{local_ip}:{LANConfig.PORT}")
    print(f"WebSocket地址: ws://{local_ip}:{LANConfig.PORT}/socket.io/")
    
    print("\n" + "="*60)
    print("🔎 调试日志已启用 - 学生监控功能")
    print("="*60)
    print("📡 已启用的日志类型:")
    print("  ✅ [学生连接] - 学生会话创建和管理")
    print("  ✅ [视频接收] - 视频流数据接收")
    print("  ✅ [音频接收] - 音频流数据接收")
    print("  ✅ [视频转发] - 向教师端转发视频流")
    print("  ✅ [音频转发] - 向教师端转发音频流")
    print("  ✅ [视频处理] - 视频帧处理流程")
    print("  ✅ [视频解码] - 视频数据解码")
    print("  ✅ [视频分析] - 完整视频分析流程")
    print("  ✅ [情绪分析] - 面部情绪分析结果")
    print("  ✅ [心率检测] - PPG心率检测结果")
    print("  ✅ [音频情绪] - 语音情绪分析结果")
    print("\n📝 日志说明:")
    print("  - ✅ = 正常操作  ❌ = 错误/失败  ⚠️ = 警告")
    print("  - 每个操作都会显示详细的执行步骤")
    print("  - 如果看不到视频，请检查日志中的错误信息")
    print("="*60 + "\n")
    
    # 新增API接口说明
    print("学生端API接口:")
    print(f"  - 创建会话: POST http://{local_ip}:{LANConfig.PORT}/api/create_session")
    print(f"  - 停止检测: POST http://{local_ip}:{LANConfig.PORT}/api/end_session")
    print(f"  - 生成报告: POST http://{local_ip}:{LANConfig.PORT}/api/analyze_questions")
    print("="*60)

    # 在后台线程中初始化模型
    def load_models_async():
        try:
            initialize_models()
        except Exception as e:
            print(f"模型加载出现错误: {e}")
            print("系统将继续运行，但某些功能可能不可用")

    model_thread = threading.Thread(target=load_models_async, daemon=True)
    model_thread.start()

    # 启动定期清理任务
    def periodic_cleanup():
        """定期清理任务"""
        import time
        while True:
            time.sleep(3600)  # 每小时执行一次
            try:
                from utils.cleanup_manager import CleanupManager
                cleanup_mgr = CleanupManager()
                deleted_sessions = cleanup_mgr.cleanup_old_sessions(days_to_keep=7, max_sessions=100)
                deleted_temp = cleanup_mgr.cleanup_temp_files()
                print(f"[定期清理] 执行完成 - {datetime.now()}")
                print(f"[定期清理] 删除了 {deleted_sessions} 个会话文件, {deleted_temp} 个临时文件")
            except Exception as e:
                print(f"[定期清理] 失败: {e}")
    
    # 启动定期清理线程
    cleanup_thread = threading.Thread(target=periodic_cleanup, daemon=True)
    cleanup_thread.start()
    print("定期清理任务已启动（每小时执行一次）")

    print("AI模型正在后台加载中，请稍候...")

    try:
        print(f"正在启动局域网服务器，地址: {LANConfig.HOST}:{LANConfig.PORT}")
        print("等待5秒确保模型加载...")
        time.sleep(5)
        
        print("局域网服务器即将启动，请稍候...")
        socketio.run(app,
                    host=LANConfig.HOST,
                    port=LANConfig.PORT,
                    debug=LANConfig.DEBUG,
                    use_reloader=False,
                    allow_unsafe_werkzeug=True)
    except Exception as e:
        print(f"服务器启动失败: {e}")
        import traceback
        traceback.print_exc()
