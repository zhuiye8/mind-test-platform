from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import os
import json
import uuid
import base64
import io
import time
import numpy as np
from PIL import Image
from datetime import datetime
from config import Config
from utils.data_manager import DataManager
from utils.websocket_handler import WebSocketHandler
from utils.error_handler import error_handler, ErrorLevel
# 使用延迟加载模型管理器，避免启动时加载
from models.model_manager import model_manager
# 导入契约API适配层
from contract_api import contract_bp, set_callback_config
# 导入WebRTC信令处理器
# from webrtc_signaling import WebRTCSignalingHandler  # 历史方案（已停用）
from rtsp_consumer import RTSPConsumerManager, set_socketio

# 创建Flask应用
app = Flask(__name__)
app.config.from_object(Config)
Config.init_app(app)

# 初始化SocketIO
socketio = SocketIO(app, 
                   cors_allowed_origins="*",
                   async_mode=Config.SOCKETIO_ASYNC_MODE)

# 初始化组件
data_manager = DataManager()
websocket_handler = WebSocketHandler(socketio)
# 初始化 RTSP 消费管理器（新方案）
set_socketio(socketio)
rtsp_manager = RTSPConsumerManager(model_manager)

# 注册契约API蓝图
app.register_blueprint(contract_bp)

# 配置回调服务
backend_base_url = "http://localhost:3001"  # 后端地址
auth_token = "dev-fixed-token-2024"        # 与后端.env中的AI_SERVICE_TOKEN一致
set_callback_config(backend_base_url, auth_token)

# 将端口配置添加到app.config中供contract_api使用
app.config['AI_SERVICE_PORT'] = Config.PORT

# 存储活跃会话
active_sessions = {}

# 模型加载状态
models_loaded = False
model_loading_status = {
    'loading': False,
    'progress': 0,
    'current_model': '',
    'error': None
}

@app.route('/')
def index():
    """主页面"""
    return render_template('index.html')

# 旧的 WebRTC 监控页面已移除（统一改为 MediaMTX + RTSP/WHEP 方案）

@app.route('/api/health')
def health_check():
    """健康检查端点"""
    global models_loaded
    return jsonify({
        'status': 'ok',
        'models_loaded': models_loaded,
        'message': '服务器运行正常'
    })

@app.route('/api/rtsp/start', methods=['POST'])
def rtsp_start():
    data = request.get_json(silent=True) or {}
    stream_name = data.get('stream_name')
    rtsp_url = data.get('rtsp_url')
    if not stream_name or not rtsp_url:
        return jsonify({ 'success': False, 'message': 'stream_name 与 rtsp_url 必填' }), 400
    try:
        ok = rtsp_manager.start(stream_name, rtsp_url)
        return jsonify({ 'success': ok, 'stream_name': stream_name })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

@app.route('/api/rtsp/stop', methods=['POST'])
def rtsp_stop():
    data = request.get_json(silent=True) or {}
    stream_name = data.get('stream_name')
    if not stream_name:
        return jsonify({ 'success': False, 'message': 'stream_name 必填' }), 400
    try:
        ok = rtsp_manager.stop(stream_name)
        return jsonify({ 'success': ok, 'stream_name': stream_name })
    except Exception as e:
        return jsonify({ 'success': False, 'message': str(e) }), 500

@app.route('/records')
def records():
    """检测记录页面"""
    return render_template('records.html')


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

@app.route('/api/end_session', methods=['POST'])
def end_session():
    """结束分析会话"""
    request_data = request.get_json()
    session_id = request_data.get('session_id')

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

    return jsonify({
        'success': False,
        'message': '会话不存在'
    }), 404

@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """获取所有会话列表"""
    sessions = data_manager.get_all_sessions()

    return jsonify({
        'success': True,
        'sessions': sessions
    })

@app.route('/api/upload_video', methods=['POST'])
def upload_video():
    """处理视频文件上传"""
    try:
        # 检查是否有文件上传
        if 'video' not in request.files:
            return jsonify({
                'success': False,
                'message': '没有上传视频文件'
            }), 400
        
        file = request.files['video']
        if file.filename == '':
            return jsonify({
                'success': False,
                'message': '未选择文件'
            }), 400
        
        # 检查文件格式
        if not model_manager.get_video_processor().is_supported_format(file.filename):
            return jsonify({
                'success': False,
                'message': f'不支持的视频格式。支持的格式: {", ".join(model_manager.get_video_processor().supported_formats)}'
            }), 400
        
        # 检查文件大小 (100MB限制)
        file_data = file.read()
        if len(file_data) > 100 * 1024 * 1024:
            return jsonify({
                'success': False,
                'message': '文件太大，请上传小于100MB的视频'
            }), 400
        
        # 保存文件
        video_path = model_manager.get_video_processor().save_uploaded_file(file_data, file.filename)
        
        # 获取视频信息
        video_info = model_manager.get_video_processor().get_video_info(video_path)
        if not video_info:
            return jsonify({
                'success': False,
                'message': '无法处理该视频文件'
            }), 400
        
        # 创建新会话
        session_id = str(uuid.uuid4())
        session_data = data_manager.create_session(session_id)
        session_data['video_path'] = video_path
        session_data['video_info'] = video_info
        session_data['analysis_type'] = 'video_upload'
        active_sessions[session_id] = session_data
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'video_info': video_info,
            'message': '视频上传成功'
        })
        
    except Exception as e:
        print(f"视频上传失败: {e}")
        return jsonify({
            'success': False,
            'message': f'视频上传失败: {str(e)}'
        }), 500

@app.route('/api/start_video_analysis', methods=['POST'])
def start_video_analysis():
    """开始视频分析"""
    try:
        request_data = request.get_json()
        session_id = request_data.get('session_id')
        
        if not session_id or session_id not in active_sessions:
            return jsonify({
                'success': False,
                'message': '会话不存在'
            }), 404
        
        session_data = active_sessions[session_id]
        video_path = session_data.get('video_path')
        
        if not video_path or not os.path.exists(video_path):
            return jsonify({
                'success': False,
                'message': '视频文件不存在'
            }), 404
        
        # 定义回调函数
        def frame_callback(session_id, timestamp, frame):
            """处理视频帧"""
            try:
                print(f"开始处理视频帧: 会话={session_id}, 时间={timestamp:.2f}s, 尺寸={frame.shape}")
                
                # 获取并确保DeepFace分析器已初始化
                deepface_analyzer = model_manager.get_deepface_analyzer()
                if deepface_analyzer is None:
                    print(f"警告: DeepFace分析器未就绪 ({timestamp}s)")
                    return
                
                # 确保分析器已初始化
                if hasattr(deepface_analyzer, 'is_initialized') and not deepface_analyzer.is_initialized:
                    print(f"正在初始化DeepFace分析器...")
                    if hasattr(deepface_analyzer, 'initialize'):
                        deepface_analyzer.initialize()
                
                # 使用DeepFace分析面部情绪
                result = deepface_analyzer.analyze(frame)
                result['timestamp'] = datetime.now().isoformat()
                result['video_timestamp'] = timestamp

                print(f"视频帧分析完成: {result.get('dominant_emotion', 'unknown')} (置信度: {result.get('confidence', 0):.3f})")

                # 保存到数据管理器
                data_manager.add_video_emotion(session_id, result)

                # 通过WebSocket发送结果
                socketio.emit('video_emotion_result', {
                    'session_id': session_id,
                    'result': result,
                    'video_timestamp': timestamp
                })
                
                print(f"已发送视频分析结果到前端: {result.get('dominant_emotion', 'unknown')}")

            except Exception as e:
                print(f"视频帧分析失败 ({timestamp}s): {e}")
                import traceback
                traceback.print_exc()
        
        def audio_callback(session_id, timestamp, audio_data):
            """处理音频段"""
            try:
                print(f"开始处理音频段: 会话={session_id}, 时间={timestamp:.2f}s, 大小={len(audio_data)} bytes")
                
                # 获取并确保Emotion2Vec分析器已初始化
                emotion2vec_analyzer = model_manager.get_emotion2vec_analyzer()
                if emotion2vec_analyzer is None:
                    print(f"警告: Emotion2Vec分析器未就绪 ({timestamp}s)")
                    return
                
                # 确保分析器已初始化
                if not emotion2vec_analyzer.is_initialized:
                    print(f"正在初始化Emotion2Vec分析器...")
                    emotion2vec_analyzer.initialize()
                
                # 使用Emotion2Vec分析语音情绪
                result = emotion2vec_analyzer.analyze(audio_data)
                result['timestamp'] = datetime.now().isoformat()
                result['video_timestamp'] = timestamp
                
                print(f"音频段分析完成: {result.get('dominant_emotion', 'unknown')} (置信度: {result.get('confidence', 0):.3f})")
                
                # 保存到数据管理器
                data_manager.add_audio_emotion(session_id, result)
                
                # 通过WebSocket发送结果
                socketio.emit('audio_emotion_result', {
                    'session_id': session_id,
                    'result': result,
                    'video_timestamp': timestamp
                })
                
                print(f"已发送音频分析结果到前端: {result.get('dominant_emotion', 'unknown')}")
                
            except Exception as e:
                print(f"音频段分析失败 ({timestamp}s): {e}")
                import traceback
                traceback.print_exc()
        
        def progress_callback(progress_data):
            """发送进度更新"""
            socketio.emit('video_analysis_progress', progress_data)
        
        def completion_callback(completion_data):
            """分析完成回调"""
            socketio.emit('video_analysis_complete', completion_data)
        
        # 启动异步视频处理
        model_manager.get_video_processor().process_video_async(
            video_path=video_path,
            session_id=session_id,
            frame_callback=frame_callback,
            audio_callback=audio_callback,
            progress_callback=progress_callback,
            completion_callback=completion_callback
        )
        
        return jsonify({
            'success': True,
            'message': '视频分析已开始'
        })
        
    except Exception as e:
        print(f"启动视频分析失败: {e}")
        return jsonify({
            'success': False,
            'message': f'启动视频分析失败: {str(e)}'
        }), 500

@app.route('/api/stop_video_analysis', methods=['POST'])
def stop_video_analysis():
    """停止视频分析"""
    try:
        request_data = request.get_json()
        session_id = request_data.get('session_id')
        
        if not session_id or session_id not in active_sessions:
            return jsonify({
                'success': False,
                'message': '会话不存在'
            }), 404
        
        # 停止视频处理
        model_manager.get_video_processor().stop_processing()
        
        return jsonify({
            'success': True,
            'message': '视频分析已停止'
        })
        
    except Exception as e:
        print(f"停止视频分析失败: {e}")
        return jsonify({
            'success': False,
            'message': f'停止视频分析失败: {str(e)}'
        }), 500

# WebSocket事件处理
@socketio.on('connect')
def handle_connect():
    """客户端连接"""
    print(f'Client connected: {request.sid}')
    emit('connected', {'message': '连接成功'})

@socketio.on('disconnect')
def handle_disconnect():
    """客户端断开连接"""
    print(f'Client disconnected: {request.sid}')

# 旧的基于 Socket.IO 的音频入口已移除（统一改用 MediaMTX RTSP 消费）

"""
旧的视频帧入口与相关处理函数已移除（统一改为 RTSP 消费）。
"""

@app.route('/api/system_cleanup', methods=['POST'])
def system_cleanup():
    """执行系统清理"""
    try:
        from utils.cleanup_manager import cleanup_manager
        
        # 获取清理参数
        request_data = request.get_json() or {}
        days_to_keep = request_data.get('days_to_keep', 7)
        max_sessions = request_data.get('max_sessions', 50)
        
        # 执行清理
        results = {
            'sessions_deleted': cleanup_manager.cleanup_old_sessions(days_to_keep, max_sessions),
            'temp_files_deleted': cleanup_manager.cleanup_temp_files(),
            'uploads_deleted': cleanup_manager.cleanup_old_uploads()
        }
        
        # 获取清理后的存储信息
        storage_info = cleanup_manager.get_storage_info()
        
        return jsonify({
            'success': True,
            'results': results,
            'storage_info': storage_info,
            'message': f"清理完成：删除{results['sessions_deleted']}个会话，{results['temp_files_deleted']}个临时文件"
        })
        
    except Exception as e:
        print(f"系统清理失败: {e}")
        return jsonify({
            'success': False,
            'message': f'系统清理失败: {str(e)}'
        }), 500

@app.route('/api/storage_info', methods=['GET'])
def get_storage_info():
    """获取存储空间信息"""
    try:
        from utils.cleanup_manager import cleanup_manager
        storage_info = cleanup_manager.get_storage_info()
        
        return jsonify({
            'success': True,
            'storage_info': storage_info
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取存储信息失败: {str(e)}'
        }), 500

@app.route('/api/error_statistics', methods=['GET'])
def get_error_statistics():
    """获取错误统计信息"""
    try:
        stats = error_handler.get_error_statistics()
        return jsonify({
            'success': True,
            'error_statistics': stats
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'获取错误统计失败: {str(e)}'
        }), 500

@app.route('/api/reset_error_stats', methods=['POST'])
def reset_error_statistics():
    """重置错误统计"""
    try:
        error_handler.reset_statistics()
        return jsonify({
            'success': True,
            'message': '错误统计已重置'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'重置失败: {str(e)}'
        }), 500

@app.route('/api/model_status', methods=['GET'])
def get_model_status():
    """获取模型状态"""
    return jsonify({
        'success': True,
        'models': {
            'emotion2vec': model_manager.get_emotion2vec_analyzer().get_model_info(),
            'deepface': model_manager.get_deepface_analyzer().get_model_info(),
        }
    })

@app.route('/api/model_loading_status', methods=['GET'])
def get_model_loading_status():
    """获取模型加载状态"""
    global models_loaded, model_loading_status
    return jsonify({
        'success': True,
        'models_loaded': models_loaded,
        'loading_status': model_loading_status
    })

@app.route('/api/session/<session_id>', methods=['GET'])
def get_session_detail(session_id):
    """获取会话详细信息"""
    session_data = data_manager.load_session(session_id)

    if session_data:
        return jsonify({
            'success': True,
            'session': session_data
        })
    else:
        return jsonify({
            'success': False,
            'message': '会话不存在'
        }), 404

@app.route('/api/session/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """删除会话"""
    success = data_manager.delete_session(session_id)

    # 如果是活跃会话，也从内存中移除
    if session_id in active_sessions:
        del active_sessions[session_id]

    if success:
        return jsonify({
            'success': True,
            'message': '会话已删除'
        })
    else:
        return jsonify({
            'success': False,
            'message': '删除会话失败'
        }), 500

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
        
        # 检查记录数据是否完整
        if not record_data.get('session_id'):
            # 如果是导出格式的文件，尝试补充缺失字段
            filename = os.path.basename(file_path).replace('.json', '')
            record_data['session_id'] = filename
            record_data['start_time'] = record_data.get('start_time', '')
            record_data['end_time'] = record_data.get('end_time', '')
            
            # 如果没有统计信息，生成基本统计
            if not record_data.get('statistics'):
                record_data['statistics'] = generate_basic_statistics(record_data)
        
        # 准备分析数据
        analysis_prompt = prepare_analysis_prompt(record_data)
        
        # 调用千问API
        qwen_response = call_qwen_api(analysis_prompt)
        
        return jsonify({
            'success': True,
            'analysis': qwen_response
        })
    except Exception as e:
        print(f"AI分析失败: {e}")
        return jsonify({
            'success': False,
            'message': f'AI分析失败: {str(e)}'
        }), 500

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
    
    # 估算持续时间
    start_time = None
    end_time = None
    
    all_timestamps = []
    for emotion_data in audio_emotions + video_emotions + heart_rate_data:
        if emotion_data.get('timestamp'):
            all_timestamps.append(emotion_data['timestamp'])
    
    if all_timestamps:
        all_timestamps.sort()
        start_time = all_timestamps[0]
        end_time = all_timestamps[-1]
        
        try:
            from datetime import datetime
            start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            duration = (end_dt - start_dt).total_seconds()
            stats['duration_seconds'] = duration
        except Exception as e:
            print(f"时间解析失败: {e}")
            stats['duration_seconds'] = 0
    
    return stats

def prepare_analysis_prompt(record_data):
    """准备AI分析的提示词"""
    stats = record_data.get('statistics', {})
    duration = stats.get('duration_seconds', 0)
    avg_heart_rate = stats.get('average_heart_rate', 0)
    dominant_emotion = stats.get('dominant_video_emotion', 'unknown')
    
    # 分析情绪变化趋势
    video_emotions = record_data.get('video_emotions', [])
    audio_emotions = record_data.get('audio_emotions', [])
    heart_rate_data = record_data.get('heart_rate_data', [])
    
    emotion_changes = []
    if video_emotions:
        for i, emotion in enumerate(video_emotions[::5]):  # 每5个取一个样本
            time_point = i * 5
            emotion_changes.append(f"{time_point}秒: {emotion.get('dominant_emotion', 'unknown')}")
    
    heart_rate_changes = []
    if heart_rate_data:
        for data in heart_rate_data[::3]:  # 每3个取一个样本
            timestamp = data.get('timestamp', '')
            heart_rate = data.get('heart_rate', 0)
            heart_rate_changes.append(f"心率: {heart_rate} bpm")
    
    prompt = f"""请直接撰写一份心理健康评估报告，不要包含任何"好的"、"下面我会"等回复性语句，直接开始报告内容：

基于以下情绪检测数据进行心理健康评估：

检测时长: {duration:.1f}秒
平均心率: {avg_heart_rate:.1f} bpm  
主要情绪: {dominant_emotion}
视频分析次数: {stats.get('total_video_analyses', 0)}
语音分析次数: {stats.get('total_audio_analyses', 0)}

情绪变化: {', '.join(emotion_changes[:10])}
心率变化: {', '.join(heart_rate_changes[:10])}
情绪分布: {json.dumps(stats.get('video_emotion_distribution', {}), ensure_ascii=False)}

请以心理医生的专业角度，直接撰写包含以下内容的评估报告：
1. 情绪状态总体评估
2. 心率指标分析  
3. 情绪变化特点
4. 心理健康建议
5. 生活改善建议

要求：语气温和专业，像关心患者的心理医生，直接开始报告内容，不要任何开场白或确认语句。"""
    return prompt

def call_qwen_api(prompt):
    """调用千问API进行分析"""
    import requests
    
    headers = {
        'Authorization': 'Bearer sk-0d506103c664443ca37f9866c9702b4c',
        'Content-Type': 'application/json'
    }
    
    data = {
        'model': 'qwen-turbo-latest',
        'messages': [
            {
                'role': 'user',
                'content': prompt
            }
        ],
        'temperature': 0.7,
        'max_tokens': 1500
    }
    
    response = requests.post(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        headers=headers,
        json=data,
        timeout=30
    )
    
    if response.status_code == 200:
        result = response.json()
        content = result['choices'][0]['message']['content']
        
        # 清理AI回复中的无关语句
        content = clean_ai_response(content)
        
        return content
    else:
        raise Exception(f"API调用失败: {response.status_code} - {response.text}")

def clean_ai_response(content):
    """清理AI回复中的无关语句"""
    # 移除常见的AI回复开头
    prefixes_to_remove = [
        "好的，", "下面我会", "我会以", "我将以", "以下是", "根据您提供的",
        "基于以上", "让我来", "我来为您", "下面是", "以下为您",
        "好的，我会", "我将为您", "我来", "让我"
    ]
    
    lines = content.split('\n')
    cleaned_lines = []
    
    for line in lines:
        line = line.strip()
        if not line:
            cleaned_lines.append('')
            continue
            
        # 检查是否是需要移除的开头语句
        should_remove = False
        for prefix in prefixes_to_remove:
            if line.startswith(prefix):
                should_remove = True
                break
        
        if not should_remove:
            cleaned_lines.append(line)
    
    # 移除开头的空行
    while cleaned_lines and not cleaned_lines[0].strip():
        cleaned_lines.pop(0)
    
    return '\n'.join(cleaned_lines)

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
        models_loaded = True  # 即使失败也标记为完成，使用备用方案
        print("系统将使用备用方案运行")
        print("="*60)
        return False

if __name__ == '__main__':
    import threading

    print("启动情绪分析系统...")

    # 在后台线程中初始化模型（添加错误处理）
    def load_models_async():
        try:
            initialize_models()
        except Exception as e:
            print(f"模型加载出现错误: {e}")
            print("系统将继续运行，但某些功能可能不可用")

    model_thread = threading.Thread(target=load_models_async, daemon=True)
    model_thread.start()

    print(f"访问地址: http://localhost:{Config.PORT}")
    print("AI模型正在后台加载中，请稍候...")

    try:
        print(f"正在启动服务器，地址: {Config.HOST}:{Config.PORT}")
        print("等待5秒确保模型加载...")
        time.sleep(5)  # 等待模型加载
        
        print("服务器即将启动，请稍候...")
        socketio.run(app,
                    host=Config.HOST,
                    port=Config.PORT,
                    debug=False,
                    use_reloader=False,
                    allow_unsafe_werkzeug=True)
    except Exception as e:
        print(f"服务器启动失败: {e}")
        import traceback
        traceback.print_exc()
