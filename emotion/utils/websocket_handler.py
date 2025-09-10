import base64
import io
import numpy as np
from PIL import Image
from flask_socketio import emit
from utils.data_manager import DataManager

class WebSocketHandler:
    """WebSocket事件处理器"""
    
    def __init__(self, socketio):
        self.socketio = socketio
        self.data_manager = DataManager()
        self.active_sessions = {}
    
    def handle_connect(self, sid):
        """处理客户端连接"""
        print(f'客户端连接: {sid}')
        emit('connected', {'message': '连接成功', 'sid': sid})
    
    def handle_disconnect(self, sid):
        """处理客户端断开连接"""
        print(f'客户端断开连接: {sid}')
        # 清理该客户端的会话信息
        sessions_to_remove = []
        for session_id, session_info in self.active_sessions.items():
            if session_info.get('client_sid') == sid:
                sessions_to_remove.append(session_id)
        
        for session_id in sessions_to_remove:
            self.end_session(session_id)
    
    def start_session(self, session_id, client_sid):
        """开始新会话"""
        session_data = self.data_manager.create_session(session_id)
        self.active_sessions[session_id] = {
            'client_sid': client_sid,
            'session_data': session_data
        }
        return session_data
    
    def end_session(self, session_id):
        """结束会话"""
        if session_id in self.active_sessions:
            self.data_manager.end_session(session_id)
            del self.active_sessions[session_id]
            return True
        return False
    
    def handle_audio_data(self, data, sid):
        """处理音频数据"""
        try:
            session_id = data.get('session_id')
            audio_data = data.get('audio_data')
            
            if not session_id or session_id not in self.active_sessions:
                emit('error', {'message': '无效的会话ID'})
                return
            
            if not audio_data:
                emit('error', {'message': '音频数据为空'})
                return
            
            # 解码音频数据
            try:
                # 移除data URL前缀
                if audio_data.startswith('data:'):
                    audio_data = audio_data.split(',')[1]
                
                audio_bytes = base64.b64decode(audio_data)
                
                # TODO: 这里集成Emotion2Vec模型
                # 目前使用模拟数据
                emotion_result = self._analyze_audio_emotion(audio_bytes)
                
                # 保存结果到数据库
                self.data_manager.add_audio_emotion(session_id, emotion_result)
                
                # 发送结果给客户端
                emit('audio_emotion_result', {
                    'session_id': session_id,
                    'result': emotion_result
                })
                
            except Exception as e:
                print(f"音频数据解码失败: {e}")
                emit('error', {'message': '音频数据处理失败'})
                
        except Exception as e:
            print(f"处理音频数据时出错: {e}")
            emit('error', {'message': '音频处理错误'})
    
    def handle_video_frame(self, data, sid):
        """处理视频帧数据"""
        try:
            session_id = data.get('session_id')
            frame_data = data.get('frame_data')
            
            if not session_id or session_id not in self.active_sessions:
                emit('error', {'message': '无效的会话ID'})
                return
            
            if not frame_data:
                emit('error', {'message': '视频帧数据为空'})
                return
            
            # 解码图像数据
            try:
                # 移除data URL前缀
                if frame_data.startswith('data:'):
                    frame_data = frame_data.split(',')[1]
                
                image_bytes = base64.b64decode(frame_data)
                image = Image.open(io.BytesIO(image_bytes))
                
                # 转换为numpy数组
                image_array = np.array(image)
                
                # TODO: 这里集成DeepFace模型
                # 目前使用模拟数据
                emotion_result = self._analyze_face_emotion(image_array)
                
                # 保存结果到数据库
                self.data_manager.add_video_emotion(session_id, emotion_result)
                
                # 发送结果给客户端
                emit('video_emotion_result', {
                    'session_id': session_id,
                    'result': emotion_result
                })
                
            except Exception as e:
                print(f"视频帧解码失败: {e}")
                emit('error', {'message': '视频帧处理失败'})
                
        except Exception as e:
            print(f"处理视频帧时出错: {e}")
            emit('error', {'message': '视频处理错误'})
    
    def _analyze_audio_emotion(self, audio_bytes):
        """分析音频情绪（模拟实现）"""
        # TODO: 集成真实的Emotion2Vec模型
        import random
        
        emotions = {
            'happy': random.uniform(0.1, 0.8),
            'sad': random.uniform(0.1, 0.6),
            'angry': random.uniform(0.1, 0.7),
            'neutral': random.uniform(0.2, 0.9)
        }
        
        # 归一化
        total = sum(emotions.values())
        emotions = {k: v/total for k, v in emotions.items()}
        
        # 找到主导情绪
        dominant_emotion = max(emotions.items(), key=lambda x: x[1])[0]
        confidence = emotions[dominant_emotion]
        
        return {
            'emotions': emotions,
            'dominant_emotion': dominant_emotion,
            'confidence': confidence,
            'model': 'emotion2vec_mock'
        }
    
    def _analyze_face_emotion(self, image_array):
        """分析面部情绪（模拟实现）"""
        # TODO: 集成真实的DeepFace模型
        import random
        
        # 模拟面部检测
        face_detected = random.choice([True, True, True, False])  # 75%概率检测到面部
        
        if not face_detected:
            return {
                'emotions': {},
                'dominant_emotion': 'unknown',
                'confidence': 0.0,
                'face_detected': False,
                'model': 'deepface_mock'
            }
        
        emotions = {
            'happy': random.uniform(0.1, 0.9),
            'sad': random.uniform(0.1, 0.5),
            'angry': random.uniform(0.1, 0.6),
            'surprise': random.uniform(0.1, 0.7),
            'fear': random.uniform(0.05, 0.4),
            'disgust': random.uniform(0.05, 0.3),
            'neutral': random.uniform(0.1, 0.8)
        }
        
        # 归一化
        total = sum(emotions.values())
        emotions = {k: v/total for k, v in emotions.items()}
        
        # 找到主导情绪
        dominant_emotion = max(emotions.items(), key=lambda x: x[1])[0]
        confidence = emotions[dominant_emotion]
        
        return {
            'emotions': emotions,
            'dominant_emotion': dominant_emotion,
            'confidence': confidence,
            'face_detected': True,
            'model': 'deepface_mock'
        }
    
    def get_session_status(self, session_id):
        """获取会话状态"""
        if session_id in self.active_sessions:
            return {
                'active': True,
                'session_data': self.active_sessions[session_id]['session_data']
            }
        else:
            # 尝试从文件加载
            session_data = self.data_manager.load_session(session_id)
            if session_data:
                return {
                    'active': False,
                    'session_data': session_data
                }
        
        return None
    
    def broadcast_to_session(self, session_id, event, data):
        """向特定会话广播消息"""
        if session_id in self.active_sessions:
            client_sid = self.active_sessions[session_id]['client_sid']
            self.socketio.emit(event, data, room=client_sid)
    
    def get_active_sessions_count(self):
        """获取活跃会话数量"""
        return len(self.active_sessions)
