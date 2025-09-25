import threading
import time
import cv2
import numpy as np
from datetime import datetime
import subprocess
import os
from shutil import which
from typing import Optional, Callable, Dict, Any

# 轻量日志控制（默认 INFO，可通过环境变量 AI_LOG_LEVEL=DEBUG/INFO/WARN/ERROR 调整）
_LEVELS = {"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40}
_LOG_LEVEL = _LEVELS.get(os.environ.get('AI_LOG_LEVEL', 'INFO').upper(), 10)

def _log_debug(msg: str):
    if _LOG_LEVEL <= 10:
        print(msg)

def _log_info(msg: str):
    if _LOG_LEVEL <= 20:
        print(msg)

def _log_warn(msg: str):
    if _LOG_LEVEL <= 30:
        print(msg)

def _log_error(msg: str):
    if _LOG_LEVEL <= 40:
        print(msg)

# 导入DataManager用于实时保存数据
try:
    from utils.data_manager import DataManager
    data_manager = DataManager()
    _log_info("[RTSP] DataManager已导入，将实时保存数据到文件")
except Exception as e:
    data_manager = None
    _log_warn(f"[RTSP] DataManager导入失败: {e}, 将使用内存缓冲")

try:
    from contract_api.callbacks import callback_service as _cb
except Exception:
    _cb = None

def _maybe_send_checkpoint(session_id: Optional[str], model: str, payload: Dict[str, Any], min_interval: float = 1.0):
    """使用DataManager实时保存数据到文件"""
    try:
        if not session_id or not data_manager:
            return
        
        # 根据模型类型调用对应的DataManager方法
        if 'video' in model.lower() or 'face' in model.lower():
            data_manager.add_video_emotion(session_id, {
                'dominant_emotion': payload.get('dominant_emotion', 'neutral'),
                'emotions': payload.get('emotions', {}),
                'confidence': payload.get('confidence', 0.0),
                'face_detected': payload.get('face_detected', True)
            })
            _log_debug(f"[RTSP] 保存视频情绪: {session_id}, 主导情绪: {payload.get('dominant_emotion')}")
            
        elif 'audio' in model.lower() or 'voice' in model.lower():
            data_manager.add_audio_emotion(session_id, {
                'dominant_emotion': payload.get('dominant_emotion', 'neutral'),
                'emotions': payload.get('emotions', {}),
                'confidence': payload.get('confidence', 0.0)
            })
            _log_debug(f"[RTSP] 保存音频情绪: {session_id}, 主导情绪: {payload.get('dominant_emotion')}")
            
        elif 'heart' in model.lower() or 'ppg' in model.lower():
            data_manager.add_heart_rate_data(session_id, {
                'heart_rate': payload.get('heart_rate', 0),
                'confidence': payload.get('confidence', 0.0),
                'signal_length': payload.get('signal_length', 0)
            })
            _log_debug(f"[RTSP] 保存心率数据: {session_id}, 心率: {payload.get('heart_rate')}")
            
    except Exception as e:
        _log_warn(f"[RTSP] DataManager保存失败: {e}")

def ensure_session_created(session_id: str):
    """确保DataManager中存在该会话，如果不存在则创建"""
    if data_manager and session_id:
        try:
            # 尝试加载会话，如果不存在则自动创建
            existing = data_manager.load_session(session_id)
            if not existing:
                _log_info(f"[RTSP] 创建新的DataManager会话: {session_id}")
                data_manager.create_session(session_id)
            else:
                _log_debug(f"[RTSP] 会话已存在: {session_id}")
        except Exception as e:
            _log_warn(f"[RTSP] 检查/创建会话失败: {e}")

_socketio = None
_app = None
_session_mapper: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None

# 轻量级最新状态缓存（用于HTTP轮询/SSE下行）
_latest_state: Dict[str, Dict[str, Any]] = {}
_state_lock = threading.Lock()
_state_version = 0


def set_socketio(socketio, app=None):
    global _socketio, _app
    _socketio = socketio
    _app = app
    _log_debug(f"[RTSP] Socket.IO 已设置: {socketio is not None}, App 已设置: {app is not None}")

def set_session_mapper(mapper: Callable[[str], Optional[Dict[str, Any]]]):
    """注册从 stream_name 映射到学生会话的回调。
    mapper(stream_name) -> { 'session_id': str, 'student_id': str } or None
    """
    global _session_mapper
    _session_mapper = mapper


def _bump_version() -> int:
    global _state_version
    _state_version += 1
    return _state_version


def _update_state(stream_name: str, key: str, payload: Dict[str, Any]):
    """更新某个流的最新状态。
    key: 'video' | 'heart'
    payload: 可序列化的结果数据
    """
    ts = datetime.now().isoformat()
    with _state_lock:
        st = _latest_state.get(stream_name) or {
            'stream_name': stream_name,
            'version': 0,
            'updated_at': ts,
            'video': None,
            'heart': None,
        }
        st[key] = payload
        st['updated_at'] = ts
        st['version'] = _bump_version()
        _latest_state[stream_name] = st


def get_latest_state(stream_name: Optional[str]) -> Optional[Dict[str, Any]]:
    """获取某条流的最新状态（浅拷贝）。"""
    if not stream_name:
        return None
    with _state_lock:
        st = _latest_state.get(stream_name)
        if not st:
            return None
        # 返回浅拷贝，避免并发读写问题
        out = dict(st)
        if out.get('video') is not None:
            out['video'] = dict(out['video'])
        if out.get('heart') is not None:
            out['heart'] = dict(out['heart'])
        return out


def _safe_emit(event, data, **kwargs):
    """在后台线程中安全地发送Socket.IO事件"""
    if _socketio is None:
        _log_warn(f"[RTSP] ❌ Socket.IO未初始化，无法发送事件: {event}")
        return False
    
    try:
        if _app is not None:
            # 使用Flask应用上下文
            with _app.app_context():
                _socketio.emit(event, data, **kwargs)
                return True
        else:
            # 如果没有app实例，直接尝试发送
            _socketio.emit(event, data, **kwargs)
            return True
    except Exception as e:
        _log_warn(f"[RTSP] ❌ 发送事件失败 {event}: {e}")
        return False


class _ConsumerThread(threading.Thread):
    def __init__(self, stream_name: str, rtsp_url: str, model_manager):
        super().__init__(daemon=True)
        self.stream_name = stream_name
        self.rtsp_url = rtsp_url
        self.model_manager = model_manager
        self._stop = threading.Event()
        self.connected = False
        self.last_frame_ts = 0.0
        self._ff_proc = None
        self._ff_w = 640
        self._ff_h = 360
        # 音频相关
        self._ff_proc_audio = None
        self._audio_thread = None
        self._audio_buf = bytearray()
        self._audio_sr = 16000
        self._audio_channels = 1
        self._audio_bytes_per_sample = 2  # s16le
        self._audio_chunk_sec = 2.0  # 每段2秒
        self._audio_bytes_read = 0
        self._audio_chunks = 0
        self._audio_last_ts = 0.0

    def _open_capture(self):
        # 尝试原始URL 与 TCP优先URL
        urls = [self.rtsp_url]
        if 'rtsp_transport=' not in self.rtsp_url:
            sep = '&' if '?' in self.rtsp_url else '?'
            urls.append(f"{self.rtsp_url}{sep}rtsp_transport=tcp")
        for i in range(2):  # 每轮尝试所有候选URL
            for u in urls:
                if self._stop.is_set():
                    return None
                cap = cv2.VideoCapture(u)
                if cap.isOpened():
                    if u != self.rtsp_url:
                        print(f"[RTSP] 使用TCP连接成功: {u}")
                    return cap
                try:
                    cap.release()
                except Exception:
                    pass
        return None

    def _start_ffmpeg(self):
        if self._ff_proc is not None:
            return True
        try:
            url = self.rtsp_url
            if 'rtsp_transport=' not in url:
                sep = '&' if '?' in url else '?'
                url = f"{url}{sep}rtsp_transport=tcp"
            ffbin = os.environ.get('FFMPEG_BIN') or which('ffmpeg') or '/usr/bin/ffmpeg'
            if not os.path.exists(ffbin):
                _log_warn(f"[RTSP/FFmpeg] 未找到 ffmpeg 可执行文件（FFMPEG_BIN={os.environ.get('FFMPEG_BIN','')}). 将不启用FFmpeg兜底解码")
                self._ff_proc = None
                return False
            cmd = [
                ffbin, '-nostdin', '-hide_banner', '-loglevel', 'warning',
                '-rtsp_transport', 'tcp', '-i', url,
                '-an', '-vf', f'scale={self._ff_w}:{self._ff_h}',
                '-pix_fmt', 'bgr24', '-f', 'rawvideo', 'pipe:1'
            ]
            self._ff_proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=self._ff_w*self._ff_h*3)
            _log_info(f"[RTSP/FFmpeg] 已启动FFmpeg解码管道")
            return True
        except Exception as e:
            _log_warn(f"[RTSP/FFmpeg] 启动失败: {e}")
            self._ff_proc = None
            return False

    def _start_ffmpeg_audio(self):
        if self._ff_proc_audio is not None:
            return True
        try:
            url = self.rtsp_url
            if 'rtsp_transport=' not in url:
                sep = '&' if '?' in url else '?'
                url = f"{url}{sep}rtsp_transport=tcp"
            ffbin = os.environ.get('FFMPEG_BIN') or which('ffmpeg') or '/usr/bin/ffmpeg'
            if not os.path.exists(ffbin):
                _log_warn(f"[RTSP/FFmpeg-Audio] 未找到 ffmpeg 可执行文件，音频分析禁用")
                self._ff_proc_audio = None
                return False
            # 输出16kHz单声道s16le原始PCM到stdout
            cmd = [
                ffbin, '-nostdin', '-hide_banner', '-loglevel', 'warning',
                '-rtsp_transport', 'tcp', '-i', url,
                '-vn', '-ac', str(self._audio_channels), '-ar', str(self._audio_sr),
                '-f', 's16le', 'pipe:1'
            ]
            self._ff_proc_audio = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            _log_info(f"[RTSP/FFmpeg-Audio] 已启动FFmpeg音频解码管道")
            return True
        except Exception as e:
            _log_warn(f"[RTSP/FFmpeg-Audio] 启动失败: {e}")
            self._ff_proc_audio = None
            return False

    def _audio_worker(self):
        """读取音频PCM并分段分析（Emotion2Vec）"""
        try:
            if not self._start_ffmpeg_audio():
                return
            chunk_bytes = int(self._audio_sr * self._audio_chunk_sec) * self._audio_bytes_per_sample
            last_emit = 0.0
            while not self._stop.is_set():
                if self._ff_proc_audio is None or self._ff_proc_audio.stdout is None:
                    time.sleep(0.05)
                    continue
                data = self._ff_proc_audio.stdout.read(4096)
                if not data:
                    time.sleep(0.01)
                    continue
                self._audio_buf.extend(data)
                self._audio_bytes_read += len(data)
                while len(self._audio_buf) >= chunk_bytes:
                    chunk = self._audio_buf[:chunk_bytes]
                    del self._audio_buf[:chunk_bytes]
                    try:
                        # s16le -> float32/64 numpy 波形，单声道
                        import numpy as _np
                        audio_np = _np.frombuffer(chunk, dtype=_np.int16).astype(_np.float32) / 32768.0
                        # 分析
                        emo2v = self.model_manager.get_emotion2vec_analyzer()
                        if not emo2v.is_initialized:
                            emo2v.initialize()
                        res = emo2v.analyze_array(audio_np, sample_rate=self._audio_sr)
                        res['timestamp'] = datetime.now().isoformat()
                        # 精简负载，避免过大导致传输异常
                        res_emit = {
                            'emotions': res.get('emotions') or {},
                            'dominant_emotion': res.get('dominant_emotion'),
                            'confidence': res.get('confidence'),
                            'model': res.get('model'),
                            'analysis_quality': res.get('analysis_quality') or 'high',
                            'timestamp': res.get('timestamp')
                        }
                        self._audio_chunks += 1
                        self._audio_last_ts = time.time()
                        # 状态缓存
                        try:
                            _update_state(self.stream_name, 'audio', res_emit)
                        except Exception:
                            pass
                        # 组装payload
                        payload = {
                            'session_id': self.stream_name,
                            'stream_name': self.stream_name,
                            'result': res_emit
                        }
                        now = time.time()
                        if _safe_emit('audio_emotion_result', payload):
                            if (now - last_emit) > 1.0:
                                _log_debug(f"[RTSP/AUDIO] 默认命名空间 audio_emotion_result: stream={self.stream_name}, dom={res.get('dominant_emotion')}")
                        # 备用事件名（与视频/心率一致的模式）
                        _safe_emit('rtsp_audio_analysis', payload)
                        # 广播到/monitor（并推送到房间 stream:<name> 的学生音频事件）
                        _safe_emit('audio_emotion_result', payload, namespace='/monitor')
                        _safe_emit('rtsp_audio_analysis', payload, namespace='/monitor')
                        room = f"stream:{self.stream_name}"
                        _safe_emit('student.audio', payload, room=room, namespace='/monitor')
                        # 学生定向/教师事件
                        if _session_mapper is not None:
                            info = _session_mapper(self.stream_name) or {}
                            sid = info.get('session_id')
                            student_id = info.get('student_id')
                            sid_default = info.get('sid_default')
                            # 向后端发送“音频情绪”检查点（节流）
                        # 保底写入：若未映射到学生会话ID，则使用 stream_name 作为会话键，确保缓冲有数据
                        if sid:
                            ensure_session_created(sid)
                            _maybe_send_checkpoint(sid, 'audio_emotion', {
                                'dominant_emotion': res_emit.get('dominant_emotion'),
                                'confidence': res_emit.get('confidence'),
                                'emotions': res_emit.get('emotions'),
                            })
                        else:
                            ensure_session_created(self.stream_name)
                            _maybe_send_checkpoint(self.stream_name, 'audio_emotion', {
                                'dominant_emotion': res_emit.get('dominant_emotion'),
                                'confidence': res_emit.get('confidence'),
                                'emotions': res_emit.get('emotions'),
                            })
                            sid_monitor = info.get('sid_monitor')
                            if sid:
                                _safe_emit('student_audio_emotion_result', {
                                    'session_id': sid,
                                    'student_id': student_id,
                                    'result': res_emit
                                })
                            if sid_default:
                                payload_target = dict(payload)
                                if sid:
                                    payload_target['session_id'] = sid
                                if _safe_emit('audio_emotion_result', payload_target, room=sid_default):
                                    _log_debug(f"[RTSP/AUDIO] 定向推送到默认命名空间 audio_emotion_result: sid_default={sid_default}")
                            if sid_monitor:
                                # 定向推送到/monitor 上该浏览器连接
                                if _safe_emit('audio_emotion_result', payload, room=sid_monitor, namespace='/monitor'):
                                    _log_debug(f"[RTSP/AUDIO] 定向推送到/monitor audio_emotion_result: sid_monitor={sid_monitor}")
                        last_emit = now
                    except Exception as e:
                        _log_warn(f"[RTSP/AUDIO] 分析失败: {e}")
        finally:
            if self._ff_proc_audio is not None:
                try:
                    self._ff_proc_audio.kill()
                except Exception:
                    pass
                self._ff_proc_audio = None

    def _read_ffmpeg_frame(self):
        if self._ff_proc is None or self._ff_proc.stdout is None:
            return False, None
        try:
            size = self._ff_w * self._ff_h * 3
            data = self._ff_proc.stdout.read(size)
            if not data or len(data) < size:
                return False, None
            frame = np.frombuffer(data, np.uint8).reshape((self._ff_h, self._ff_w, 3))
            return True, frame
        except Exception:
            return False, None

    def run(self):
        backoff = 0.5
        cap = None
        last_emit = 0.0
        self.last_frame_ts = time.time()
        empty_reads = 0
        last_diag = 0.0

        # 持续重试打开，直到成功或被停止
        while not self._stop.is_set() and cap is None:
            cap = self._open_capture()
            if cap is None:
                _log_warn(f"[RTSP] 尚未可用，等待后重试: {self.rtsp_url}")
                time.sleep(backoff)
                backoff = min(backoff * 2, 5.0)

        if self._stop.is_set():
            return

        _log_info(f"[RTSP] 开始消费: {self.rtsp_url}")
        self.connected = True
        # 启动音频分析线程（与视频并行）
        try:
            if self._audio_thread is None or not self._audio_thread.is_alive():
                self._audio_thread = threading.Thread(target=self._audio_worker, daemon=True)
                self._audio_thread.start()
        except Exception as _e:
            _log_warn(f"[RTSP] 启动音频线程失败: {_e}")
        try:
            while not self._stop.is_set():
                ok, frame = (cap.read() if cap is not None else (False, None))
                if not ok and self._ff_proc is not None:
                    ok, frame = self._read_ffmpeg_frame()
                if not ok or frame is None:
                    empty_reads += 1
                    # 连续读空帧，重连
                    if empty_reads >= 30:  # ~1.5s
                        try:
                            cap.release()
                        except Exception:
                            pass
                        cap = None
                        self.connected = False
                        backoff = 0.5
                        # 启动FFmpeg作为备用解码
                        if self._ff_proc is None:
                            self._start_ffmpeg()
                        while not self._stop.is_set() and cap is None:
                            cap = self._open_capture()
                            if cap is None:
                                if (time.time() - last_diag) > 2.0:
                                    _log_warn(f"[RTSP] 读取失败，正在重连: {self.rtsp_url}")
                                    last_diag = time.time()
                                time.sleep(backoff)
                                backoff = min(backoff * 2, 5.0)
                        if cap is not None:
                            self.connected = True
                        empty_reads = 0
                        continue
                    time.sleep(0.05)
                    continue
                empty_reads = 0
                self.last_frame_ts = time.time()

                # 周期性诊断：确认帧在读取
                if (self.last_frame_ts - last_diag) > 2.0:
                    print(f"[RTSP] 已读取视频帧: stream={self.stream_name}, ts={self.last_frame_ts:.2f}")
                    last_diag = self.last_frame_ts

                # 降采样处理，降低开销
                h, w = frame.shape[:2]
                scale = min(1.0, 640.0 / max(1, w))
                if scale < 1.0:
                    frame = cv2.resize(frame, (int(w*scale), int(h*scale)))

                # 分析（容错）
                result = {
                    'timestamp': datetime.now().isoformat(),
                    'dominant_emotion': 'unknown',
                    'confidence': 0.0
                }
                try:
                    deepface_analyzer = self.model_manager.get_deepface_analyzer()
                    if deepface_analyzer is not None:
                        if hasattr(deepface_analyzer, 'is_initialized') and not deepface_analyzer.is_initialized:
                            if hasattr(deepface_analyzer, 'initialize'):
                                deepface_analyzer.initialize()
                        # BGR -> RGB
                        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        r = deepface_analyzer.analyze(rgb)
                        result.update(r)
                except Exception:
                    # 分析失败不阻断
                    pass

                # 限频发送（每秒最多 2 次，降低频率避免前端渲染问题）
                now = time.time()
                if _socketio is not None and (now - last_emit) > 0.5:
                    payload = {
                        'session_id': self.stream_name,
                        'stream_name': self.stream_name,
                        'result': result,
                        'video_timestamp': now
                    }
                    # 更新HTTP轮询可读的最新状态（视频）
                    try:
                        _update_state(self.stream_name, 'video', result)
                    except Exception:
                        pass
                    # 广播给默认命名空间的所有客户端 - 使用应用上下文（限频打印）
                    if _safe_emit('video_emotion_result', payload):
                        if (now - last_diag) > 2.0:
                            print(f"[RTSP] ✅ 广播默认NS video_emotion_result: stream={self.stream_name}, dom={result.get('dominant_emotion')}")
                    
                    # 额外确认：也尝试广播到所有连接的客户端
                    if _safe_emit('rtsp_video_analysis', payload):
                        if (now - last_diag) > 2.0:
                            print(f"[RTSP] ✅ 额外广播 rtsp_video_analysis")

                    # 同时广播到监控命名空间（保留）
                    if _safe_emit('video_emotion_result', payload, namespace='/monitor'):
                        if (now - last_diag) > 2.0:
                            print(f"[RTSP] ✅ 广播/monitor video_emotion_result: stream={self.stream_name}")
                    
                    # 额外确认：也尝试在monitor命名空间广播备用事件
                    if _safe_emit('rtsp_video_analysis', payload, namespace='/monitor'):
                        if (now - last_diag) > 2.0:
                            print(f"[RTSP] ✅ /monitor 额外广播 rtsp_video_analysis")

                    # 发送到特定房间（保留房间机制）
                    room = f"stream:{self.stream_name}"
                    if _safe_emit('student.emotion', payload, room=room, namespace='/monitor'):
                        if (now - last_diag) > 1.5:
                            print(f"[RTSP] 已发送 student.emotion 至房间: {room}")

                    # 同步转发给教师端（student_* 事件），需要将 stream_name 映射为学生会话ID
                    if _session_mapper is not None:
                        try:
                            info = _session_mapper(self.stream_name)
                            if info and isinstance(info, dict):
                                sid = info.get('session_id')
                                student_id = info.get('student_id')
                                sid_default = info.get('sid_default')
                                if sid:
                                    if _safe_emit('student_video_emotion_result', {
                                        'session_id': sid,
                                        'student_id': student_id,
                                        'result': result
                                    }):
                                        if (now - last_diag) > 1.5:
                                            print(f"[RTSP] 已转发 student_video_emotion_result: sid={sid}, student_id={student_id}")
                                # 关键：复用本机检测通路，定向推送到默认命名空间的特定浏览器连接
                                if sid_default:
                                    payload_target = dict(payload)
                                    if sid:
                                        payload_target['session_id'] = sid  # 与当前监控学生会话ID对齐
                                    if _safe_emit('video_emotion_result', payload_target, room=sid_default):
                                        print(f"[RTSP] 🎯 定向推送到默认命名空间 video_emotion_result: sid_default={sid_default}")
                                # 发送视频情绪检查点（节流，1s一次）
                                # 发送视频情绪检查点：优先按会话ID；无会话ID则以 stream_name 缓存
                                if sid:
                                    ensure_session_created(sid)
                                    _maybe_send_checkpoint(sid, 'video_emotion', {
                                        'dominant_emotion': result.get('dominant_emotion'),
                                        'confidence': result.get('confidence'),
                                        'emotions': result.get('emotions'),
                                        'face_detected': result.get('face_detected'),
                                    })
                                else:
                                    ensure_session_created(self.stream_name)
                                    _maybe_send_checkpoint(self.stream_name, 'video_emotion', {
                                        'dominant_emotion': result.get('dominant_emotion'),
                                        'confidence': result.get('confidence'),
                                        'emotions': result.get('emotions'),
                                        'face_detected': result.get('face_detected'),
                                    })
                        except Exception:
                            pass

                    # 触发 PPG 心率检测并发送结果（轻量频率，不强制每帧）
                    try:
                        from models.enhanced_ppg_detector import enhanced_ppg_detector
                        hr = enhanced_ppg_detector.process_frame(rgb if 'rgb' in locals() else frame, bool(result.get('face_detected')))
                        hr['timestamp'] = datetime.now().isoformat()
                        base_hr_payload = {
                            'session_id': self.stream_name,
                            'stream_name': self.stream_name,
                            'result': hr
                        }
                        # 更新HTTP轮询可读的最新状态（心率）
                        try:
                            _update_state(self.stream_name, 'heart', hr)
                        except Exception:
                            pass
                        # 广播给默认命名空间的所有客户端 - 使用应用上下文
                        if _safe_emit('heart_rate_result', base_hr_payload):
                            if (now - last_diag) > 2.0:
                                print(f"[RTSP] ✅ 广播默认NS heart_rate_result: stream={self.stream_name}, state={hr.get('detection_state')}")
                        
                        # 额外确认：也尝试广播心率分析事件
                        if _safe_emit('rtsp_heart_rate_analysis', base_hr_payload):
                            if (now - last_diag) > 2.0:
                                print(f"[RTSP] ✅ 额外广播 rtsp_heart_rate_analysis")
                        
                        # 同时广播到监控命名空间（关键修复）
                        if _safe_emit('heart_rate_result', base_hr_payload, namespace='/monitor'):
                            if (now - last_diag) > 2.0:
                                print(f"[RTSP] ✅ 广播/monitor heart_rate_result: stream={self.stream_name}")
                        
                        # 额外确认：也尝试在monitor命名空间广播备用事件
                        if _safe_emit('rtsp_heart_rate_analysis', base_hr_payload, namespace='/monitor'):
                            if (now - last_diag) > 2.0:
                                _log_debug(f"[RTSP] /monitor 额外广播 rtsp_heart_rate_analysis")
                            
                        # 发送到特定房间（保留房间机制）
                        room = f"stream:{self.stream_name}"
                        if _safe_emit('student.heart_rate', base_hr_payload, room=room, namespace='/monitor'):
                            if (now - last_diag) > 1.5:
                                _log_debug(f"[RTSP] 已发送 student.heart_rate 至房间: {room}")
                        if _session_mapper is not None:
                            info = _session_mapper(self.stream_name)
                            if info and isinstance(info, dict):
                                sid = info.get('session_id')
                                student_id = info.get('student_id')
                                sid_default = info.get('sid_default')
                                if sid:
                                    if _safe_emit('student_heart_rate_result', {
                                        'session_id': sid,
                                        'student_id': student_id,
                                        'result': hr
                                    }):
                                        if (now - last_diag) > 1.5:
                                            _log_debug(f"[RTSP] 已转发 student_heart_rate_result: sid={sid}, hr={hr.get('heart_rate')}")
                                # 关键：复用本机检测通路，定向推送到默认命名空间的特定浏览器连接
                                if sid_default:
                                    payload_target = dict(base_hr_payload)
                                    if sid:
                                        payload_target['session_id'] = sid
                                    if _safe_emit('heart_rate_result', payload_target, room=sid_default):
                                        _log_debug(f"[RTSP] 定向推送到默认命名空间 heart_rate_result: sid_default={sid_default}")
                                # 发送心率检查点（节流），以便后端实时入库
                                # 发送心率检查点：优先按会话ID；无会话ID则以 stream_name 缓存
                                if sid:
                                    ensure_session_created(sid)
                                    _maybe_send_checkpoint(sid, 'ppg_detector', {
                                        'heart_rate': hr.get('heart_rate') or hr.get('hr_bpm'),
                                        'confidence': hr.get('confidence'),
                                        'detection_state': hr.get('detection_state') or hr.get('state'),
                                    })
                                else:
                                    ensure_session_created(self.stream_name)
                                    _maybe_send_checkpoint(self.stream_name, 'ppg_detector', {
                                        'heart_rate': hr.get('heart_rate') or hr.get('hr_bpm'),
                                        'confidence': hr.get('confidence'),
                                        'detection_state': hr.get('detection_state') or hr.get('state'),
                                    })
                    except Exception:
                        pass
                    last_emit = now
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass
            if self._ff_proc is not None:
                try:
                    self._ff_proc.kill()
                except Exception:
                    pass
                self._ff_proc = None
            _log_info(f"[RTSP] 结束: {self.rtsp_url}")
            self.connected = False

    def stop(self):
        self._stop.set()


class RTSPConsumerManager:
    def __init__(self, model_manager):
        self.model_manager = model_manager
        self._threads = {}
        self._lock = threading.Lock()

    def start(self, stream_name: str, rtsp_url: str) -> bool:
        key = stream_name
        with self._lock:
            th = self._threads.get(key)
            if th and th.is_alive():
                # 已有消费者在运行
                if getattr(th, 'rtsp_url', '') == rtsp_url:
                    return True
                # URL 变化，先停止再重建
                try:
                    th.stop()
                    th.join(timeout=1.0)
                except Exception:
                    pass
                self._threads.pop(key, None)
            elif th:
                # 线程不在运行，清理
                self._threads.pop(key, None)

            th_new = _ConsumerThread(stream_name, rtsp_url, self.model_manager)
            self._threads[key] = th_new
            th_new.start()
            return True

    def stop(self, stream_name: str) -> bool:
        key = stream_name
        with self._lock:
            th = self._threads.get(key)
            if th:
                try:
                    th.stop()
                    th.join(timeout=1.0)
                except Exception:
                    pass
                self._threads.pop(key, None)
                return True
            return False

    def status(self):
        now = time.time()
        info = {}
        for k, th in self._threads.items():
            info[k] = {
                'connected': getattr(th, 'connected', False),
                'last_frame_age_sec': (now - getattr(th, 'last_frame_ts', 0.0)) if getattr(th, 'last_frame_ts', 0.0) else None,
                'rtsp_url': getattr(th, 'rtsp_url', ''),
                'audio_started': getattr(th, '_audio_thread', None) is not None and getattr(th._audio_thread, 'is_alive', lambda: False)(),
                'audio_bytes': getattr(th, '_audio_bytes_read', 0),
                'audio_chunks': getattr(th, '_audio_chunks', 0),
                'audio_last_age_sec': (now - getattr(th, '_audio_last_ts', 0.0)) if getattr(th, '_audio_last_ts', 0.0) else None,
            }
        return info
