"""
契约API路由
实现符合契约要求的REST API接口
"""

import json
import os
import uuid
import logging
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app
from .adapters import ContractDataAdapter
from .callbacks import callback_service
from typing import Dict, Any, Optional


# 配置日志
logger = logging.getLogger(__name__)

# 创建蓝图
contract_bp = Blueprint('contract_api', __name__, url_prefix='/api')


# 统一 /api/health 返回格式（即便主应用定义了同路径，也在此拦截并返回契约格式）
@contract_bp.before_app_request
def _enforce_contract_health():
    try:
        if request.path == '/api/health' and request.method == 'GET':
            return jsonify({
                "status": "healthy",
                "service": "emotion-ai",
                "version": "1.0.0",
                "timestamp": ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc))
            }), 200
    except Exception:
        # 发生异常不阻断其他请求流转
        return None


def get_session_manager():
    """获取会话管理器（需要从main app中获取）"""
    # 这里需要与emotion主应用中的会话管理器集成
    # 暂时返回一个模拟的管理器，实际需要与现有代码集成
    return getattr(current_app, 'session_manager', None)


@contract_bp.route('/create_session', methods=['POST'])
def create_session():
    """创建AI分析会话"""
    try:
        # 解析请求参数
        data = request.get_json()
        if not data:
            return jsonify(ContractDataAdapter.create_session_response(
                success=False, 
                message="Invalid JSON payload"
            )), 400
        
        # 兼容 camelCase 与 snake_case
        participant_id = data.get('participant_id') or data.get('participantId')
        exam_id = data.get('exam_id') or data.get('examId')
        exam_public_uuid = data.get('exam_public_uuid') or data.get('examPublicUuid')
        provided_stream_name = data.get('stream_name') or data.get('streamName')
        
        if not participant_id or not exam_id:
            return jsonify(ContractDataAdapter.create_session_response(
                success=False,
                message="Missing required parameters: participant_id, exam_id"
            )), 400
        
        # 生成唯一session_id (UUID)
        session_id = str(uuid.uuid4())
        logger.info(f"[CreateSession] 生成唯一UUID session_id: {session_id}")
        
        # 计算stream_name
        if provided_stream_name:
            stream_name = provided_stream_name
        elif exam_public_uuid and participant_id:
            try:
                from lan.stream_utils import compute_stream_name
                stream_name = compute_stream_name(exam_public_uuid, participant_id)
            except Exception:
                stream_name = f"exam-{exam_public_uuid[:8]}-user-{participant_id[:8]}"
        else:
            stream_name = f"exam-{exam_id[:8]}-user-{participant_id[:8]}"
        
        logger.info(f"[CreateSession] 计算stream_name用于RTSP: {stream_name}")
        
        # 使用DataManager创建本地会话文件
        try:
            from utils.data_manager import DataManager
            data_manager = DataManager()
            session_data = data_manager.create_session(session_id)
            session_data.update({
                'session_id': session_id,
                'participant_id': participant_id,
                'student_id': participant_id,
                'exam_id': exam_id,
                'exam_public_uuid': exam_public_uuid,
                'stream_name': stream_name,
                'status': 'active',
                'started_at': ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc))
            })
            data_manager.save_session(session_data)
            logger.info(f"✅ DataManager创建会话: {session_id[:8]}..., exam_id: {exam_id}")
        except Exception as e:
            logger.warning(f"⚠️ DataManager创建失败: {e}, 使用基础会话数据")
            session_data = {
                'session_id': session_id,
                'participant_id': participant_id,
                'student_id': participant_id,
                'exam_id': exam_id,
                'started_at': ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc)),
                'status': 'active',
                'analysis_results': {}
            }
        
        # 保存会话到emotion的数据存储（健壮化注册到监控系统）
        try:
            from flask import current_app, has_app_context
            import sys
            import os

            session_registered = False

            # 统一构造会话对象
            session_obj = {
                'session_id': session_id,
                'stream_name': stream_name,
                'student_id': participant_id,
                'exam_id': exam_id,
                'exam_public_uuid': exam_public_uuid,
                'start_time': session_data.get('started_at', ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc))),
                'status': 'active',
                'last_activity': session_data.get('started_at', ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc)))
            }

            # 找到真实的 app 模块：可能是 'app_lan'、'emotion.app_lan' 或 '__main__'
            candidates = ['app_lan', 'emotion.app_lan']
            if has_app_context():
                candidates.insert(0, getattr(current_app, 'import_name', '') or '__main__')
            app_module = None
            for name in candidates:
                mod = sys.modules.get(name)
                if mod is not None:
                    app_module = mod
                    break

            # 确保存在共享的 student_sessions 字典
            shared_sessions = None
            if has_app_context() and hasattr(current_app, 'student_sessions') and isinstance(current_app.student_sessions, dict):
                shared_sessions = current_app.student_sessions
            elif app_module is not None and hasattr(app_module, 'student_sessions') and isinstance(getattr(app_module, 'student_sessions'), dict):
                shared_sessions = getattr(app_module, 'student_sessions')
                if has_app_context():
                    current_app.student_sessions = shared_sessions
            else:
                # 创建共享 dict，并同时挂载到 current_app 与 app_module
                shared_sessions = {}
                if has_app_context():
                    current_app.student_sessions = shared_sessions
                if app_module is not None:
                    setattr(app_module, 'student_sessions', shared_sessions)

            # 正式注册会话
            shared_sessions[session_id] = session_obj
            session_registered = True
            try:
                total = len(shared_sessions)
            except Exception:
                total = '?'
            logger.info(f"✅ 学生会话注册成功: {session_id[:8]}..., 总数: {total}")

            # 同步为 RTSP 映射（通过 shared_sessions 与 app_lan 使用同一对象即可）

            # 同时保存到文件存储作为备份
            session_file = f"/home/aaron/心理测试平台/emotion/data/sessions/{session_id}.json"
            os.makedirs(os.path.dirname(session_file), exist_ok=True)
            with open(session_file, 'w') as f:
                json.dump(session_data, f, indent=2)
            
            # 通知教师端有新学生连接
            try:
                from flask_socketio import emit
                emit('student_connected', {
                    'session_id': session_id,
                    'student_id': participant_id,
                    'exam_id': exam_id,
                    'exam_public_uuid': exam_public_uuid,
                    'stream_name': stream_name,
                    'timestamp': session_data['started_at']
                }, broadcast=True)
                logger.info(f"✅ 已通知教师端新学生连接: {session_id[:8]}...")
            except Exception as emit_error:
                logger.error(f"⚠️ 无法通知教师端学生连接: {emit_error}")
            
            logger.info(f"Session created: {session_id}, participant: {participant_id}, exam: {exam_id}")
            
        except Exception as e:
            logger.error(f"Failed to save session: {str(e)}")
            return jsonify(ContractDataAdapter.create_session_response(
                success=False,
                message=f"Failed to save session: {str(e)}"
            )), 500
        
        # 返回成功响应
        response = ContractDataAdapter.create_session_response(
            success=True,
            session_id=session_id
        )
        return jsonify(response), 200
        
    except Exception as e:
        logger.error(f"Create session error: {str(e)}")
        return jsonify(ContractDataAdapter.create_session_response(
            success=False,
            message=f"Internal server error: {str(e)}"
        )), 500


@contract_bp.route('/end_session', methods=['POST'])
def end_session():
    """结束AI分析会话（契约端点）
    - 接收: { session_id, exam_result_id? }
    - 行为: 将 exam_result_id 写入会话文件，结束会话（标记 stopped 与 end_time），触发 finalize 回调
    - 返回: { success, message }
    """
    try:
        data = request.get_json(silent=True) or {}
        # 兼容 camelCase / snake_case
        session_id = data.get('session_id') or data.get('sessionId')
        exam_result_id = data.get('exam_result_id') or data.get('examResultId')

        if not session_id:
            return jsonify(ContractDataAdapter.end_session_response(
                success=False,
                message='Missing required parameter: session_id'
            )), 400

        # 加载/补全会话数据
        from utils.data_manager import DataManager
        dm = DataManager()
        session_data = dm.load_session(session_id) or {}

        # 若文件缺失，尽量从共享 student_sessions 中补全 exam_id 等元数据
        try:
            from flask import current_app, has_app_context
            import sys
            shared_sessions = None
            if has_app_context() and hasattr(current_app, 'student_sessions') and isinstance(current_app.student_sessions, dict):
                shared_sessions = current_app.student_sessions
            else:
                mod = sys.modules.get('app_lan') or sys.modules.get('emotion.app_lan')
                if mod is not None and hasattr(mod, 'student_sessions') and isinstance(getattr(mod, 'student_sessions'), dict):
                    shared_sessions = getattr(mod, 'student_sessions')
            if isinstance(shared_sessions, dict) and session_id in shared_sessions:
                meta = shared_sessions.get(session_id) or {}
            else:
                meta = {}
        except Exception:
            meta = {}

        # 写入/更新关键字段
        session_data.setdefault('session_id', session_id)
        if exam_result_id:
            session_data['exam_result_id'] = exam_result_id
        # 兼容字段：participant_id / student_id
        if 'participant_id' not in session_data and 'student_id' in session_data:
            session_data['participant_id'] = session_data.get('student_id')
        # 尽可能补全 exam_id
        if not session_data.get('exam_id') and meta.get('exam_id'):
            session_data['exam_id'] = meta.get('exam_id')

        # 先保存一次，确保 exam_result_id 写入文件
        dm.save_session(session_data)

        # 结束会话（内部会标记 stopped 与 end_time，并尝试触发 finalize 回调）
        ok = dm.end_session(session_id)
        if not ok:
            # 文件仍不存在或其他异常
            return jsonify(ContractDataAdapter.end_session_response(
                success=False,
                message='会话不存在或无法结束'
            )), 404

        # 同步更新共享的 student_sessions 状态，便于教师端监控
        try:
            if meta is not None and isinstance(meta, dict):
                meta['status'] = 'stopped'
                from datetime import datetime
                meta['end_time'] = ContractDataAdapter.to_iso8601_utc(datetime.utcnow())
        except Exception:
            pass

        return jsonify(ContractDataAdapter.end_session_response(
            success=True,
            message='检测已停止'
        )), 200

    except Exception as e:
        logger.error(f"End session error: {str(e)}")
        return jsonify(ContractDataAdapter.end_session_response(
            success=False,
            message=f"Internal server error: {str(e)}"
        )), 500



@contract_bp.route('/ai/config', methods=['GET'])
def get_ai_config():
    """获取AI服务配置信息"""
    try:
        # 获取端口配置
        port = current_app.config.get('AI_SERVICE_PORT', 5678)
        
        # 返回配置信息
        config = ContractDataAdapter.ai_config_response(port)
        return jsonify(config), 200
        
    except Exception as e:
        logger.error(f"Get AI config error: {str(e)}")
        return jsonify({
            "available": False,
            "websocket_url": None,
            "error": f"Configuration error: {str(e)}"
        }), 500


@contract_bp.route('/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    try:
        return jsonify({
            "status": "healthy",
            "service": "emotion-ai",
            "version": "1.0.0",
            "timestamp": ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc))
        }), 200
    except Exception as e:
        return jsonify({
            "status": "unhealthy", 
            "error": str(e)
        }), 500


# 兜底：若主应用存在同路径的本地实现，这里拦截并统一走契约实现
@contract_bp.before_app_request
def _enforce_contract_create_end():
    try:
        if request.path == '/api/create_session' and request.method == 'POST':
            return create_session()
        if request.path == '/api/end_session' and request.method == 'POST':
            return end_session()
    except Exception as _:
        # 出错则由后续路由继续处理
        return None
