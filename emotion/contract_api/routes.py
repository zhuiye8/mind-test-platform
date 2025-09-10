"""
契约API路由
实现符合契约要求的REST API接口
"""

import json
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
        
        # 生成session_id
        session_id = str(uuid.uuid4())
        
        # 创建会话数据
        session_data = {
            'session_id': session_id,
            'participant_id': participant_id,  # 契约字段
            'student_id': participant_id,      # emotion内部字段映射
            'exam_id': exam_id,
            'started_at': ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc)),
            'status': 'active',
            'analysis_results': {}
        }
        
        # 保存会话到emotion的数据存储
        # 这里需要与emotion现有的会话存储机制集成
        try:
            # 集成emotion的实际会话管理
            from flask import current_app
            
            # 直接访问全局student_sessions变量
            session_registered = False
            
            # 方式1: 通过current_app
            try:
                if hasattr(current_app, 'student_sessions') and current_app.student_sessions is not None:
                    # 计算/采用统一流名
                    try:
                        from app_lan import compute_stream_name as _compute_stream_name
                        if provided_stream_name:
                            _stream_name = provided_stream_name
                        elif exam_public_uuid:
                            _stream_name = _compute_stream_name(exam_public_uuid, participant_id)
                        else:
                            _stream_name = _compute_stream_name(exam_id, participant_id)
                    except Exception:
                        _stream_name = provided_stream_name or None
                    current_app.student_sessions[session_id] = {
                        'session_id': session_id,
                        'student_id': participant_id,
                        'exam_id': exam_id,
                        'exam_public_uuid': exam_public_uuid,
                        'start_time': session_data['started_at'],
                        'status': 'active',
                        'last_activity': session_data['started_at'],
                        'stream_name': _stream_name
                    }
                    session_registered = True
                    logger.info(f"✅ 通过current_app注册会话: {session_id[:8]}..., 总数: {len(current_app.student_sessions)}")
            except Exception as app_error:
                logger.warning(f"⚠️ current_app访问失败: {app_error}")
            
            # 方式2: 通过全局变量导入
            if not session_registered:
                try:
                    # 导入全局变量
                    from app_lan import student_sessions as global_student_sessions
                    try:
                        from app_lan import compute_stream_name as _compute_stream_name
                        if provided_stream_name:
                            _stream_name = provided_stream_name
                        elif exam_public_uuid:
                            _stream_name = _compute_stream_name(exam_public_uuid, participant_id)
                        else:
                            _stream_name = _compute_stream_name(exam_id, participant_id)
                    except Exception:
                        _stream_name = provided_stream_name or None
                    global_student_sessions[session_id] = {
                        'session_id': session_id,
                        'student_id': participant_id,
                        'exam_id': exam_id,
                        'exam_public_uuid': exam_public_uuid,
                        'start_time': session_data['started_at'],
                        'status': 'active',
                        'last_activity': session_data['started_at'],
                        'stream_name': _stream_name
                    }
                    session_registered = True
                    logger.info(f"✅ 通过全局导入注册会话: {session_id[:8]}..., 总数: {len(global_student_sessions)}")
                except Exception as import_error:
                    logger.warning(f"⚠️ 全局导入失败: {import_error}")
            
            # 方式3: 通过sys.modules
            if not session_registered:
                try:
                    import sys
                    app_module = sys.modules.get('app_lan')
                    if app_module and hasattr(app_module, 'student_sessions'):
                        app_module.student_sessions[session_id] = {
                            'session_id': session_id,
                            'student_id': participant_id,
                            'exam_id': exam_id,
                            'start_time': session_data['started_at'],
                            'status': 'active',
                            'last_activity': session_data['started_at']
                        }
                        session_registered = True
                        logger.info(f"✅ 通过sys.modules注册会话: {session_id[:8]}..., 总数: {len(app_module.student_sessions)}")
                    else:
                        logger.warning("⚠️ sys.modules中未找到student_sessions")
                except Exception as sys_error:
                    logger.warning(f"⚠️ sys.modules访问失败: {sys_error}")
                    
            if not session_registered:
                logger.error("❌ 所有方式都失败，会话未注册到监控系统")
            
            # 同时保存到文件存储作为备份
            session_file = f"/home/aaron/心理测试平台/emotion/data/sessions/{session_id}.json"
            import os
            os.makedirs(os.path.dirname(session_file), exist_ok=True)
            
            with open(session_file, 'w') as f:
                json.dump(session_data, f, indent=2)
            
            # 通知教师端有新学生连接（如果socketio可用）
            try:
                from flask_socketio import emit
                try:
                    from app_lan import compute_stream_name as _compute_stream_name
                    if provided_stream_name:
                        _stream_name = provided_stream_name
                    elif exam_public_uuid:
                        _stream_name = _compute_stream_name(exam_public_uuid, participant_id)
                    else:
                        _stream_name = _compute_stream_name(exam_id, participant_id)
                except Exception:
                    _stream_name = provided_stream_name or None
                emit('student_connected', {
                    'session_id': session_id,
                    'student_id': participant_id,
                    'exam_id': exam_id,
                    'exam_public_uuid': exam_public_uuid,
                    'stream_name': _stream_name,
                    'timestamp': session_data['started_at']
                }, broadcast=True)
                logger.info(f"✅ 已通知教师端新学生连接: {session_id[:8]}...")
            except Exception as emit_error:
                logger.warning(f"⚠️ 无法通知教师端学生连接: {emit_error}")
            
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
    """结束AI分析会话"""
    try:
        # 解析请求参数
        data = request.get_json()
        if not data:
            return jsonify(ContractDataAdapter.end_session_response(
                success=False,
                message="Invalid JSON payload"
            )), 400
        
        # 兼容 camelCase 与 snake_case
        session_id = data.get('session_id') or data.get('sessionId')
        if not session_id:
            return jsonify(ContractDataAdapter.end_session_response(
                success=False,
                message="Missing required parameter: session_id"
            )), 400
        
        # 加载会话数据
        session_file = f"/home/aaron/心理测试平台/emotion/data/sessions/{session_id}.json"
        try:
            with open(session_file, 'r') as f:
                session_data = json.load(f)
        except FileNotFoundError:
            logger.warning(f"Session not found: {session_id}")
            # 会话不存在也返回成功，按契约要求不阻断考试
            return jsonify(ContractDataAdapter.end_session_response(
                success=True,
                message="Session not found, but treated as success"
            )), 200
        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {str(e)}")
            return jsonify(ContractDataAdapter.end_session_response(
                success=False,
                message=f"Failed to load session: {str(e)}"
            )), 500
        
        # 更新会话状态
        session_data['ended_at'] = ContractDataAdapter.to_iso8601_utc(datetime.now(timezone.utc))
        session_data['status'] = 'ended'
        
        # 保存更新后的会话数据
        try:
            with open(session_file, 'w') as f:
                json.dump(session_data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to update session {session_id}: {str(e)}")
        
        # 异步发送Finalize回调
        try:
            exam_id = session_data.get('exam_id')
            if exam_id:
                callback_service.send_finalize(session_id, exam_id, session_data, async_send=True)
            else:
                logger.warning(f"No exam_id found for session {session_id}, skipping finalize callback")
        except Exception as e:
            logger.error(f"Failed to send finalize callback for session {session_id}: {str(e)}")
        
        logger.info(f"Session ended: {session_id}")
        
        # 返回成功响应
        return jsonify(ContractDataAdapter.end_session_response(success=True)), 200
        
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
