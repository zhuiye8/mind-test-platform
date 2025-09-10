import threading
import time
import cv2
import numpy as np
from datetime import datetime
import subprocess
import os
from shutil import which
from typing import Optional, Callable, Dict, Any

_socketio = None
_session_mapper: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None


def set_socketio(socketio):
    global _socketio
    _socketio = socketio

def set_session_mapper(mapper: Callable[[str], Optional[Dict[str, Any]]]):
    """注册从 stream_name 映射到学生会话的回调。
    mapper(stream_name) -> { 'session_id': str, 'student_id': str } or None
    """
    global _session_mapper
    _session_mapper = mapper


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
                print(f"[RTSP/FFmpeg] 未找到 ffmpeg 可执行文件（FFMPEG_BIN={os.environ.get('FFMPEG_BIN','')}). 将不启用FFmpeg兜底解码")
                self._ff_proc = None
                return False
            cmd = [
                ffbin, '-nostdin', '-hide_banner', '-loglevel', 'warning',
                '-rtsp_transport', 'tcp', '-i', url,
                '-an', '-vf', f'scale={self._ff_w}:{self._ff_h}',
                '-pix_fmt', 'bgr24', '-f', 'rawvideo', 'pipe:1'
            ]
            self._ff_proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=self._ff_w*self._ff_h*3)
            print(f"[RTSP/FFmpeg] 已启动FFmpeg解码管道: {cmd}")
            return True
        except Exception as e:
            print(f"[RTSP/FFmpeg] 启动失败: {e}")
            self._ff_proc = None
            return False

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
                print(f"[RTSP] 尚未可用，等待后重试: {self.rtsp_url}")
                time.sleep(backoff)
                backoff = min(backoff * 2, 5.0)

        if self._stop.is_set():
            return

        print(f"[RTSP] 开始消费: {self.rtsp_url}")
        self.connected = True
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
                                print(f"[RTSP] 读取失败，正在重连: {self.rtsp_url}")
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

                # 限频发送（每秒最多 10 次）
                now = time.time()
                if _socketio is not None and (now - last_emit) > 0.1:
                    payload = {
                        'session_id': self.stream_name,
                        'result': result,
                        'video_timestamp': now
                    }
                    try:
                        _socketio.emit('video_emotion_result', payload)
                        if (now - last_diag) > 1.5:
                            print(f"[RTSP] 已发送 video_emotion_result: stream={self.stream_name}, face={result.get('face_detected')}, dom={result.get('dominant_emotion')}")
                    except Exception as e:
                        print(f"[RTSP] 发送 video_emotion_result 失败: {e}")

                    # 同步转发给教师端（student_* 事件），需要将 stream_name 映射为学生会话ID
                    try:
                        if _session_mapper is not None:
                            info = _session_mapper(self.stream_name)
                            if info and isinstance(info, dict):
                                sid = info.get('session_id')
                                student_id = info.get('student_id')
                                if sid:
                                    try:
                                        _socketio.emit('student_video_emotion_result', {
                                            'session_id': sid,
                                            'student_id': student_id,
                                            'result': result
                                        })
                                        if (now - last_diag) > 1.5:
                                            print(f"[RTSP] 已转发 student_video_emotion_result: sid={sid}, student_id={student_id}")
                                    except Exception as e:
                                        print(f"[RTSP] 发送 student_video_emotion_result 失败: {e}")
                    except Exception:
                        pass

                    # 触发 PPG 心率检测并发送结果（轻量频率，不强制每帧）
                    try:
                        from models.enhanced_ppg_detector import enhanced_ppg_detector
                        hr = enhanced_ppg_detector.process_frame(rgb if 'rgb' in locals() else frame, bool(result.get('face_detected')))
                        hr['timestamp'] = datetime.now().isoformat()
                        try:
                            _socketio.emit('heart_rate_result', {
                                'session_id': self.stream_name,
                                'result': hr
                            })
                            if (now - last_diag) > 1.5:
                                print(f"[RTSP] 已发送 heart_rate_result: stream={self.stream_name}, state={hr.get('detection_state')}, hr={hr.get('heart_rate')}")
                        except Exception as e:
                            print(f"[RTSP] 发送 heart_rate_result 失败: {e}")
                        if _session_mapper is not None:
                            info = _session_mapper(self.stream_name)
                            if info and isinstance(info, dict):
                                sid = info.get('session_id')
                                student_id = info.get('student_id')
                                if sid:
                                    try:
                                        _socketio.emit('student_heart_rate_result', {
                                            'session_id': sid,
                                            'student_id': student_id,
                                            'result': hr
                                        })
                                        if (now - last_diag) > 1.5:
                                            print(f"[RTSP] 已转发 student_heart_rate_result: sid={sid}, hr={hr.get('heart_rate')}")
                                    except Exception as e:
                                        print(f"[RTSP] 发送 student_heart_rate_result 失败: {e}")
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
            print(f"[RTSP] 结束: {self.rtsp_url}")
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
            }
        return info
