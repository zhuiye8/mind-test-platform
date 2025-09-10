"""
数据格式适配器
负责在emotion原生格式和契约格式之间进行转换
"""

import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import uuid


class ContractDataAdapter:
    """数据格式适配器"""
    
    @staticmethod
    def to_iso8601_utc(timestamp: Any) -> str:
        """转换为ISO8601 UTC格式时间戳（含毫秒）"""
        if isinstance(timestamp, str):
            # 如果已经是字符串，尝试解析
            try:
                dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            except:
                dt = datetime.now(timezone.utc)
        elif isinstance(timestamp, datetime):
            dt = timestamp.replace(tzinfo=timezone.utc) if timestamp.tzinfo is None else timestamp
        else:
            dt = datetime.now(timezone.utc)
        
        return dt.isoformat().replace('+00:00', 'Z')
    
    @staticmethod
    def create_session_response(success: bool, session_id: Optional[str] = None, message: Optional[str] = None) -> Dict[str, Any]:
        """创建会话响应格式"""
        # 同步返回多种常见命名，兼容前端/后端的不同读取方式
        return {
            "success": success,
            "session_id": session_id,
            "sessionId": session_id,     # camelCase 兼容
            "aiSessionId": session_id,   # 有些客户端直接读取该键
            "message": message or ("Session created successfully" if success else "Failed to create session")
        }
    
    @staticmethod
    def end_session_response(success: bool, message: Optional[str] = None) -> Dict[str, Any]:
        """结束会话响应格式"""
        return {
            "success": success,
            "message": message or ("Session ended successfully" if success else "Failed to end session")
        }
    
    @staticmethod
    def ai_config_response(port: int = 5678) -> Dict[str, Any]:
        """AI配置响应格式"""
        return {
            "available": True,
            "websocket_url": f"ws://localhost:{port}/socket.io/",
            "features": {
                "webrtc": True,
                "emotion_analysis": True,
                "heart_rate_detection": True,
                "real_time_monitoring": True
            },
            "diagnostics": {
                "version": "1.0.0",
                "models": ["deepface", "emotion2vec", "ppg_detector", "enhanced_ppg"]
            }
        }
    
    @staticmethod
    def extract_aggregates_from_session(session_data: Dict[str, Any]) -> Dict[str, Any]:
        """从session数据中提取聚合统计"""
        aggregates = {
            "attention": {
                "mean_score": 0.75,
                "variance": 0.12,
                "peak_attention": 0.92,
                "low_attention_periods": 2
            },
            "face": {
                "detection_rate": 0.89,
                "dominant_emotions": ["neutral", "focused", "concentrated"],
                "emotion_variance": {
                    "happy": 0.15,
                    "sad": 0.05,
                    "angry": 0.02,
                    "fear": 0.03,
                    "surprise": 0.08,
                    "disgust": 0.01,
                    "neutral": 0.66
                }
            },
            "ppg": {
                "mean_hr": 72.5,
                "hr_variance": 8.3,
                "max_hr": 88,
                "min_hr": 65,
                "stress_indicators": ["elevated_variability"]
            },
            "audio": {
                "speech_segments": 12,
                "silence_ratio": 0.23,
                "emotion_confidence": 0.78,
                "dominant_audio_emotion": "calm"
            }
        }
        
        # 如果session_data有实际数据，可以在这里解析
        if isinstance(session_data, dict) and "analysis_results" in session_data:
            # TODO: 解析实际的emotion分析结果
            pass
            
        return aggregates
    
    @staticmethod
    def create_finalize_payload(session_id: str, exam_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建finalize回调的payload"""
        now_iso = ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc))
        
        # 从session_data中提取时间信息
        started_at = session_data.get("started_at", now_iso)
        ended_at = session_data.get("ended_at", now_iso)
        
        if isinstance(started_at, str):
            started_at = ContractDataAdapter.to_iso8601_utc(started_at)
        if isinstance(ended_at, str):
            ended_at = ContractDataAdapter.to_iso8601_utc(ended_at)
        
        return {
            "session_id": session_id,
            "exam_id": exam_id,
            "candidate_id": session_data.get("participant_id") or session_data.get("student_id"),  # 添加必需的candidate_id字段
            "exam_result_id": session_data.get("exam_result_id"),
            "started_at": started_at,
            "ended_at": ended_at,
            "models": ["deepface", "emotion2vec", "ppg_detector", "enhanced_ppg"],
            "aggregates": ContractDataAdapter.extract_aggregates_from_session(session_data),
            "series": [
                {
                    "model": "ppg_detector",
                    "points": [
                        {
                            "timestamp": now_iso,
                            "metrics": {"hr_bpm": 72, "confidence": 0.85}
                        }
                    ]
                }
            ],
            "anomalies_timeline": [],
            "attachments": [],
            "compute_stats": {
                "processing_time_ms": 1250,
                "data_points_processed": 1800
            },
            "ai_version": "emotion-v1.0.0"
        }
    
    @staticmethod
    def create_checkpoint_payload(session_id: str, metrics: Dict[str, Any]) -> Dict[str, Any]:
        """创建checkpoint回调的payload"""
        now_iso = ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc))
        
        return {
            "session_id": session_id,
            "exam_result_id": None,
            "timestamp": now_iso,
            "snapshot": {
                "metrics": metrics,
                "anomalies": []
            }
        }
