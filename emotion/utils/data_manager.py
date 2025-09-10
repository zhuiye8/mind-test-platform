import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
from config import Config

class DataManager:
    """数据管理类，负责会话数据的存储和读取"""
    
    def __init__(self):
        self.sessions_folder = Config.SESSIONS_FOLDER
        self.ensure_directories()
    
    def ensure_directories(self):
        """确保必要的目录存在"""
        os.makedirs(self.sessions_folder, exist_ok=True)
    
    def create_session(self, session_id: str) -> Dict[str, Any]:
        """创建新的会话"""
        session_data = {
            'session_id': session_id,
            'start_time': datetime.now().isoformat(),
            'end_time': None,
            'audio_emotions': [],
            'video_emotions': [],
            'heart_rate_data': [],
            'statistics': {
                'total_audio_analyses': 0,
                'total_video_analyses': 0,
                'total_heart_rate_readings': 0,
                'dominant_audio_emotion': None,
                'dominant_video_emotion': None,
                'average_heart_rate': 0.0,
                'heart_rate_range': {'min': 0, 'max': 0},
                'audio_emotion_distribution': {},
                'video_emotion_distribution': {},
                'duration_seconds': 0.0
            }
        }
        
        self.save_session(session_data)
        return session_data
    
    def save_session(self, session_data: Dict[str, Any]) -> bool:
        """保存会话数据"""
        try:
            session_file = os.path.join(self.sessions_folder, f"{session_data['session_id']}.json")
            with open(session_file, 'w', encoding='utf-8') as f:
                json.dump(session_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"保存会话数据失败: {e}")
            return False
    
    def load_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """加载会话数据"""
        try:
            session_file = os.path.join(self.sessions_folder, f"{session_id}.json")
            if os.path.exists(session_file):
                with open(session_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return None
        except Exception as e:
            print(f"加载会话数据失败: {e}")
            return None
    
    def add_audio_emotion(self, session_id: str, emotion_data: Dict[str, Any]) -> bool:
        """添加语音情绪分析结果"""
        session_data = self.load_session(session_id)
        if not session_data:
            return False
        
        # 只保存需要的字段
        filtered_data = {
            'emotions': emotion_data.get('emotions', {}),
            'dominant_emotion': emotion_data.get('dominant_emotion'),
            'timestamp': datetime.now().isoformat()
        }
        
        # 添加到音频情绪列表
        session_data['audio_emotions'].append(filtered_data)
        
        # 更新统计信息
        self._update_audio_statistics(session_data, filtered_data)
        
        return self.save_session(session_data)
    
    def add_video_emotion(self, session_id: str, emotion_data: Dict[str, Any]) -> bool:
        """添加视频情绪分析结果"""
        session_data = self.load_session(session_id)
        if not session_data:
            return False

        # 只保存需要的字段
        filtered_data = {
            'emotions': emotion_data.get('emotions', {}),
            'dominant_emotion': emotion_data.get('dominant_emotion'),
            'timestamp': datetime.now().isoformat()
        }

        # 添加到视频情绪列表
        session_data['video_emotions'].append(filtered_data)

        # 更新统计信息
        self._update_video_statistics(session_data, filtered_data)

        return self.save_session(session_data)

    def add_heart_rate_data(self, session_id: str, heart_rate_data: Dict[str, Any]) -> bool:
        """添加心率检测结果"""
        session_data = self.load_session(session_id)
        if not session_data:
            return False

        # 只保存需要的字段
        filtered_data = {
            'heart_rate': heart_rate_data.get('heart_rate'),
            'signal_length': heart_rate_data.get('signal_length', 0),
            'timestamp': datetime.now().isoformat()
        }

        # 添加到心率数据列表
        session_data['heart_rate_data'].append(filtered_data)

        # 更新统计信息
        self._update_heart_rate_statistics(session_data, filtered_data)

        return self.save_session(session_data)

    def end_session(self, session_id: str) -> bool:
        """结束会话"""
        session_data = self.load_session(session_id)
        if not session_data:
            return False
        
        session_data['end_time'] = datetime.now().isoformat()
        session_data['status'] = 'completed'
        
        # 计算最终统计信息
        self._calculate_final_statistics(session_data)

        # 保存会话
        saved = self.save_session(session_data)

        # 尝试触发 Finalize 回调（通过契约回调服务）
        # 注意：这里作为兜底逻辑，仅在本地/简化接口 end_session 调用时生效；
        # 契约蓝图 /api/end_session 已独立实现 finalize 回调。
        try:
            exam_id = session_data.get('exam_id')
            if exam_id:
                from contract_api.callbacks import callback_service
                # 兼容 candidate_id: 从 student_id/participant_id 中择一
                if 'participant_id' not in session_data and 'student_id' in session_data:
                    session_data['participant_id'] = session_data.get('student_id')
                callback_service.send_finalize(session_id, exam_id, session_data, async_send=True)
        except Exception as _:
            # 回调失败不影响主流程保存
            pass

        return saved
    
    def get_all_sessions(self) -> List[Dict[str, Any]]:
        """获取所有会话的摘要信息"""
        sessions = []
        
        if not os.path.exists(self.sessions_folder):
            return sessions
        
        for filename in os.listdir(self.sessions_folder):
            if filename.endswith('.json'):
                session_data = self.load_session(filename[:-5])  # 移除.json后缀
                if session_data:
                    # 只返回摘要信息
                    summary = {
                        'session_id': session_data['session_id'],
                        'start_time': session_data['start_time'],
                        'end_time': session_data.get('end_time'),
                        'status': session_data['status'],
                        'audio_emotion_count': len(session_data.get('audio_emotions', [])),
                        'video_emotion_count': len(session_data.get('video_emotions', [])),
                        'statistics': session_data.get('statistics', {})
                    }
                    sessions.append(summary)
        
        # 按开始时间排序
        sessions.sort(key=lambda x: x['start_time'], reverse=True)
        return sessions
    
    def delete_session(self, session_id: str) -> bool:
        """删除会话"""
        try:
            session_file = os.path.join(self.sessions_folder, f"{session_id}.json")
            if os.path.exists(session_file):
                os.remove(session_file)
                return True
            return False
        except Exception as e:
            print(f"删除会话失败: {e}")
            return False
    
    def _update_audio_statistics(self, session_data: Dict[str, Any], emotion_data: Dict[str, Any]):
        """更新音频统计信息"""
        stats = session_data['statistics']
        stats['total_audio_analyses'] += 1
        
        # 更新主导情绪
        if 'dominant_emotion' in emotion_data:
            stats['dominant_audio_emotion'] = emotion_data['dominant_emotion']
    
    def _update_video_statistics(self, session_data: Dict[str, Any], emotion_data: Dict[str, Any]):
        """更新视频统计信息"""
        stats = session_data['statistics']
        stats['total_video_analyses'] += 1

        # 更新主导情绪
        if 'dominant_emotion' in emotion_data:
            stats['dominant_video_emotion'] = emotion_data['dominant_emotion']

    def _update_heart_rate_statistics(self, session_data: Dict[str, Any], heart_rate_data: Dict[str, Any]):
        """更新心率统计信息 - 简化版本"""
        stats = session_data['statistics']

        # 统计所有心率数据
        heart_rate = heart_rate_data.get('heart_rate', 0)
        if heart_rate and heart_rate > 0:  # 只统计有效心率
            stats['total_heart_rate_readings'] += 1

            # 更新平均心率
            current_avg = stats['average_heart_rate']
            total_count = stats['total_heart_rate_readings']
            new_avg = (current_avg * (total_count - 1) + heart_rate) / total_count
            stats['average_heart_rate'] = new_avg

            # 更新心率范围
            if stats['heart_rate_range']['min'] == 0 or heart_rate < stats['heart_rate_range']['min']:
                stats['heart_rate_range']['min'] = heart_rate
            if heart_rate > stats['heart_rate_range']['max']:
                stats['heart_rate_range']['max'] = heart_rate

    def _calculate_final_statistics(self, session_data: Dict[str, Any]):
        """计算最终统计信息"""
        audio_emotions = session_data.get('audio_emotions', [])
        video_emotions = session_data.get('video_emotions', [])

        # 计算情绪分布
        audio_emotion_counts = {}
        video_emotion_counts = {}

        for emotion in audio_emotions:
            dominant = emotion.get('dominant_emotion')
            if dominant:
                audio_emotion_counts[dominant] = audio_emotion_counts.get(dominant, 0) + 1

        for emotion in video_emotions:
            dominant = emotion.get('dominant_emotion')
            if dominant:
                video_emotion_counts[dominant] = video_emotion_counts.get(dominant, 0) + 1

        # 添加到统计信息
        session_data['statistics']['audio_emotion_distribution'] = audio_emotion_counts
        session_data['statistics']['video_emotion_distribution'] = video_emotion_counts

        # 计算会话持续时间
        if session_data.get('end_time') and session_data.get('start_time'):
            start_time = datetime.fromisoformat(session_data['start_time'])
            end_time = datetime.fromisoformat(session_data['end_time'])
            duration = (end_time - start_time).total_seconds()
            session_data['statistics']['duration_seconds'] = duration
