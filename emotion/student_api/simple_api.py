"""
简化的学生端API模块
工作流程：
1. 创建检测会话 (create_detection_session)
2. 停止检测 (end_detection_session) 
3. 发送题目数据并获取心理分析报告 (analyze_exam_questions)
"""

import json
import uuid
from datetime import datetime
from typing import Dict, List, Any
import requests

class SimpleStudentAPI:
    """简化的学生端API处理器"""
    
    def __init__(self, data_manager, model_manager):
        """
        初始化API处理器
        
        Args:
            data_manager: 数据管理器实例
            model_manager: 模型管理器实例
        """
        self.data_manager = data_manager
        self.model_manager = model_manager
        self.active_sessions = {}
        
    def create_detection_session(self, student_id: str = None, exam_id: str = None) -> Dict[str, Any]:
        """
        创建检测会话
        对应接口1：学生端发送视音频流，返回会话ID
        
        Args:
            student_id: 学生ID（可选）
            exam_id: 考试ID（可选）
            
        Returns:
            包含会话ID的字典
        """
        try:
            # 创建唯一会话ID
            session_id = str(uuid.uuid4())
            
            # 创建会话数据
            session_data = self.data_manager.create_session(session_id)
            session_data.update({
                'student_id': student_id,
                'exam_id': exam_id,
                'analysis_type': 'student_detection',
                'start_time': datetime.now().isoformat(),
                'status': 'active'
            })
            
            # 存储活跃会话
            self.active_sessions[session_id] = session_data
            
            return {
                'success': True,
                'session_id': session_id,
                'message': '检测会话创建成功'
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'创建检测会话失败: {str(e)}'
            }
    
    def end_detection_session(self, session_id: str) -> Dict[str, Any]:
        """
        停止检测会话
        接收学生端的停止检测指令，将会话状态设置为stopped，等待题目数据
        同时保存检测数据到数据库供教师端查看
        
        Args:
            session_id: 会话ID
            
        Returns:
            确认停止检测的响应
        """
        try:
            if session_id not in self.active_sessions:
                return {
                    'success': False,
                    'message': '会话不存在'
                }
            
            # 停止检测但保留会话数据
            success = self.data_manager.end_session(session_id)
            
            if success:
                # 更新会话状态为stopped，等待题目数据
                session_data = self.active_sessions.get(session_id, {})
                session_data['end_time'] = datetime.now().isoformat()
                session_data['status'] = 'stopped'  # 改为stopped状态，而不是completed
                
                # 保存检测数据到数据库供教师端查看
                self._save_detection_record(session_id, session_data)
                
                return {
                    'success': True,
                    'session_id': session_id,
                    'message': '检测已停止，请发送题目数据以生成分析报告'
                }
            else:
                return {
                    'success': False,
                    'message': '停止检测失败'
                }
                
        except Exception as e:
            return {
                'success': False,
                'message': f'停止检测失败: {str(e)}'
            }
    
    def analyze_exam_questions(self, session_id: str, questions_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        分析考试题目并生成心理分析报告
        必须在调用end_detection_session停止检测后才能调用此接口
        
        Args:
            session_id: 会话ID
            questions_data: 题目数据列表，包含内容和时间戳
            
        Returns:
            包含AI心理分析报告的字典
        """
        try:
            # 检查会话是否存在于活跃会话中
            if session_id not in self.active_sessions:
                # 尝试从数据管理器加载
                session_data = self.data_manager.load_session(session_id)
                if not session_data:
                    return {
                        'success': False,
                        'message': '会话数据不存在，请先创建检测会话'
                    }
            else:
                session_data = self.active_sessions[session_id]
            
            # 验证会话状态：兼容 stopped/ended/completed
            status = session_data.get('status')
            if status not in ('stopped', 'ended', 'completed'):
                return {
                    'success': False,
                    'message': '请先调用停止检测接口，再发送题目数据'
                }
            
            # 验证题目数据
            if not questions_data or not isinstance(questions_data, list):
                return {
                    'success': False,
                    'message': '题目数据格式错误'
                }
            
            # 生成心理分析报告
            analysis_report = self._generate_psychological_report(session_data, questions_data)
            
            # 保存报告
            report_info = self._save_analysis_report(session_id, analysis_report)
            
            # 将会话状态更新为completed
            if session_id in self.active_sessions:
                self.active_sessions[session_id]['status'] = 'completed'
                # 清理活跃会话
                self.active_sessions.pop(session_id, None)
            
            return {
                'success': True,
                'session_id': session_id,
                'report': analysis_report,
                'report_file': report_info.get('filename'),
                'message': '心理分析报告生成成功'
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'分析考试题目失败: {str(e)}'
            }
    
    def _generate_psychological_report(self, session_data: Dict[str, Any], questions_data: List[Dict[str, Any]]) -> str:
        """
        生成心理分析报告
        
        Args:
            session_data: 会话数据
            questions_data: 题目数据
            
        Returns:
            心理分析报告文本
        """
        try:
            # 匹配题目时间戳与情绪数据
            matched_data = []
            
            for question in questions_data:
                question_emotions = self._match_emotions_by_timestamp(
                    session_data,
                    question.get('start_time'),
                    question.get('end_time')
                )
                
                matched_data.append({
                    'question_id': question.get('question_id', ''),
                    'content': question.get('content', ''),
                    'start_time': question.get('start_time'),
                    'end_time': question.get('end_time'),
                    'emotions': question_emotions
                })
            
            # 调用AI生成报告
            report = self._call_ai_for_report(session_data, matched_data)
            
            return report
            
        except Exception as e:
            print(f"生成心理分析报告失败: {e}")
            return self._generate_fallback_report(session_data, questions_data)
    
    def _match_emotions_by_timestamp(self, session_data: Dict[str, Any], start_time: str, end_time: str) -> Dict[str, List]:
        """
        根据时间戳匹配情绪数据（5秒容差）
        
        Args:
            session_data: 会话数据
            start_time: 开始时间
            end_time: 结束时间
            
        Returns:
            匹配的情绪数据
        """
        try:
            from datetime import datetime, timedelta
            
            # 解析时间
            start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
            
            # 5秒容差
            tolerance = timedelta(seconds=5)
            start_range = start_dt - tolerance
            end_range = end_dt + tolerance
            
            matched_emotions = {
                'video_emotions': [],
                'audio_emotions': [],
                'heart_rate_data': []
            }
            
            # 匹配视频情绪
            for emotion in session_data.get('video_emotions', []):
                try:
                    emotion_time = datetime.fromisoformat(emotion['timestamp'].replace('Z', '+00:00'))
                    if start_range <= emotion_time <= end_range:
                        matched_emotions['video_emotions'].append(emotion)
                except Exception:
                    continue
            
            # 匹配音频情绪
            for emotion in session_data.get('audio_emotions', []):
                try:
                    emotion_time = datetime.fromisoformat(emotion['timestamp'].replace('Z', '+00:00'))
                    if start_range <= emotion_time <= end_range:
                        matched_emotions['audio_emotions'].append(emotion)
                except Exception:
                    continue
            
            # 匹配心率数据
            for hr_data in session_data.get('heart_rate_data', []):
                try:
                    hr_time = datetime.fromisoformat(hr_data['timestamp'].replace('Z', '+00:00'))
                    if start_range <= hr_time <= end_range:
                        matched_emotions['heart_rate_data'].append(hr_data)
                except Exception:
                    continue
                    
            return matched_emotions
            
        except Exception as e:
            print(f"时间戳匹配失败: {e}")
            return {'video_emotions': [], 'audio_emotions': [], 'heart_rate_data': []}
    
    def _call_ai_for_report(self, session_data: Dict[str, Any], matched_data: List[Dict[str, Any]]) -> str:
        """
        调用千问AI生成心理分析报告
        
        Args:
            session_data: 会话数据
            matched_data: 匹配的题目和情绪数据
            
        Returns:
            AI生成的心理分析报告
        """
        try:
            # 构建AI提示词
            prompt = self._build_ai_prompt(session_data, matched_data)
            
            # 调用千问API
            headers = {
                'Authorization': 'Bearer sk-0d506103c664443ca37f9866c9702b4c',
                'Content-Type': 'application/json'
            }
            
            data = {
                'model': 'qwen-plus',
                'input': {
                    'prompt': prompt
                },
                'parameters': {
                    'temperature': 0.7,
                    'max_tokens': 2000
                }
            }
            
            response = requests.post(
                'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
                headers=headers,
                json=data,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                if 'output' in result and 'text' in result['output']:
                    return result['output']['text']
                else:
                    raise Exception(f"API响应格式错误: {result}")
            else:
                raise Exception(f"API调用失败: {response.status_code}, {response.text}")
                
        except Exception as e:
            print(f"AI报告生成失败: {e}")
            raise e
    
    def _build_ai_prompt(self, session_data: Dict[str, Any], matched_data: List[Dict[str, Any]]) -> str:
        """构建针对学生考试答题心理分析的AI提示词"""
        prompt = "作为一名专业的学生心理咨询师，我需要基于学生考试答题过程中的情绪和生理数据，为学生提供专业的心理状态分析和调整建议。\n\n"
        
        # 学生基本信息
        student_id = session_data.get('student_id', '学生')
        exam_id = session_data.get('exam_id', '本次考试')
        prompt += f"【学生信息】\n学生: {student_id}\n考试: {exam_id}\n\n"
        
        # 逐题分析数据
        prompt += "【逐题心理状态分析数据】\n"
        for i, data in enumerate(matched_data, 1):
            prompt += f"\n题目 {i}: {data['content']}\n"
            prompt += f"答题时间段: {data['start_time']} 至 {data['end_time']}\n"
            
            # 详细情绪分析
            video_emotions = data['emotions']['video_emotions']
            if video_emotions:
                emotions = [e.get('dominant_emotion', 'neutral') for e in video_emotions]
                confidence_scores = [e.get('confidence', 0) for e in video_emotions if e.get('confidence')]
                avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0
                emotion_changes = self._analyze_emotion_changes(emotions)
                prompt += f"  面部表情变化: {emotion_changes}\n"
                prompt += f"  情绪识别可信度: {avg_confidence:.2f}\n"
            
            audio_emotions = data['emotions']['audio_emotions']
            if audio_emotions:
                emotions = [e.get('dominant_emotion', 'calm') for e in audio_emotions]
                emotion_changes = self._analyze_emotion_changes(emotions)
                prompt += f"  语音情绪变化: {emotion_changes}\n"
            
            heart_rates = data['emotions']['heart_rate_data']
            if heart_rates:
                hr_values = [hr.get('heart_rate') for hr in heart_rates if hr.get('heart_rate')]
                if hr_values:
                    avg_hr = sum(hr_values) / len(hr_values)
                    min_hr = min(hr_values)
                    max_hr = max(hr_values)
                    hr_variability = max_hr - min_hr
                    prompt += f"  心率状况: 平均{avg_hr:.1f}bpm, 波动{min_hr}-{max_hr}bpm, 变异度{hr_variability}bpm\n"
                    
                    # 心率变化趋势分析
                    if len(hr_values) >= 3:
                        trend = self._analyze_hr_trend(hr_values)
                        prompt += f"  心率趋势: {trend}\n"
        
        prompt += f"""

【分析要求】
请以温和关怀的心理咨询师身份，为这位学生撰写个性化的心理分析报告，包含：

1. **答题心理状态评估**
   - 分析学生在不同题目上的心理状态变化
   - 识别哪些题目让学生感到压力或焦虑
   - 评估学生的考试适应能力和情绪调节能力

2. **学习压力与应对分析**
   - 基于心率和情绪变化分析学生的压力反应模式
   - 判断学生在面对困难题目时的应对策略
   - 评估学生的心理韧性

3. **个性化心理调适建议**
   - 针对学生的具体表现提供考试心理调适技巧
   - 建议合适的放松和减压方法
   - 提供学习策略和时间管理建议

4. **鼓励与成长指导**
   - 肯定学生的积极表现和进步空间
   - 提供心理成长和自我提升的方向
   - 给予温暖的鼓励和支持

【报告风格要求】
- 使用温和、理解、鼓励的语调
- 避免使用医学诊断术语
- 重点关注学生的成长潜力和积极面
- 提供具体可操作的建议
- 体现对学生个体差异的理解和尊重
- 报告长度控制在800-1200字之间

请为{student_id}同学撰写专业的心理分析报告。"""
        
        return prompt
    
    def _analyze_emotion_changes(self, emotions: List[str]) -> str:
        """分析情绪变化模式"""
        if not emotions:
            return "数据不足"
        
        if len(emotions) == 1:
            return f"保持{emotions[0]}"
        
        # 统计情绪分布
        emotion_counts = {}
        for emotion in emotions:
            emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1
        
        # 分析变化
        changes = []
        for i in range(1, len(emotions)):
            if emotions[i] != emotions[i-1]:
                changes.append(f"{emotions[i-1]}→{emotions[i]}")
        
        main_emotion = max(emotion_counts, key=emotion_counts.get)
        change_desc = f", 变化: {' '.join(changes[:3])}" if changes else ""
        
        return f"主要{main_emotion}({emotion_counts[main_emotion]}/{len(emotions)}){change_desc}"
    
    def _analyze_hr_trend(self, hr_values: List[float]) -> str:
        """分析心率变化趋势"""
        if len(hr_values) < 3:
            return "数据不足"
        
        # 计算前后平均值差异
        first_third = hr_values[:len(hr_values)//3]
        last_third = hr_values[-len(hr_values)//3:]
        
        first_avg = sum(first_third) / len(first_third)
        last_avg = sum(last_third) / len(last_third)
        
        diff = last_avg - first_avg
        
        if abs(diff) < 5:
            return "相对稳定"
        elif diff > 5:
            return f"上升趋势(+{diff:.1f}bpm)"
        else:
            return f"下降趋势({diff:.1f}bpm)"
    
    def _generate_fallback_report(self, session_data: Dict[str, Any], questions_data: List[Dict[str, Any]]) -> str:
        """生成备用分析报告"""
        report = "心理状态分析报告\n"
        report += "="*50 + "\n\n"
        
        report += "检测概况:\n"
        report += f"- 视频分析次数: {len(session_data.get('video_emotions', []))}\n"
        report += f"- 音频分析次数: {len(session_data.get('audio_emotions', []))}\n"
        report += f"- 心率检测次数: {len(session_data.get('heart_rate_data', []))}\n\n"
        
        report += "题目分析:\n"
        for i, question in enumerate(questions_data, 1):
            report += f"{i}. {question.get('content', '未知题目')}\n"
        
        report += "\n建议:\n"
        report += "- 保持良好的学习状态\n"
        report += "- 注意情绪调节和压力管理\n"
        report += "- 如有需要，可寻求专业心理指导\n"
        
        return report
    
    def _save_detection_record(self, session_id: str, session_data: Dict[str, Any]) -> bool:
        """
        保存检测记录到数据库
        
        Args:
            session_id: 会话ID
            session_data: 会话数据
            
        Returns:
            是否保存成功
        """
        try:
            import os
            import json
            
            # 确保数据库目录存在
            database_dir = 'database'
            os.makedirs(database_dir, exist_ok=True)
            
            # 获取完整的会话数据
            full_session_data = self.data_manager.load_session(session_id)
            
            if full_session_data:
                # 添加元数据
                full_session_data['session_id'] = session_id
                full_session_data['student_id'] = session_data.get('student_id')
                full_session_data['exam_id'] = session_data.get('exam_id')
                full_session_data['analysis_type'] = session_data.get('analysis_type')
                full_session_data['detection_status'] = 'stopped'
                full_session_data['report_generated'] = False
                
                # 保存到数据库
                db_filepath = os.path.join(database_dir, f"{session_id}.json")
                with open(db_filepath, 'w', encoding='utf-8') as f:
                    json.dump(full_session_data, f, ensure_ascii=False, indent=2)
                
                print(f"检测记录已保存: {db_filepath}")
                return True
            else:
                print(f"无法加载会话数据: {session_id}")
                return False
                
        except Exception as e:
            print(f"保存检测记录失败: {e}")
            return False
    
    def _save_analysis_report(self, session_id: str, report: str) -> Dict[str, str]:
        """保存分析报告到文件"""
        try:
            import os
            import json
            
            # 创建报告目录
            report_dir = os.path.join('data', 'reports')
            os.makedirs(report_dir, exist_ok=True)
            
            # 生成文件名
            filename = f"report_{session_id}.txt"
            filepath = os.path.join(report_dir, filename)
            
            # 保存报告
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(report)
            
            # 更新数据库中的记录，标记报告已生成
            database_dir = 'database'
            db_filepath = os.path.join(database_dir, f"{session_id}.json")
            if os.path.exists(db_filepath):
                with open(db_filepath, 'r', encoding='utf-8') as f:
                    db_data = json.load(f)
                
                db_data['report_generated'] = True
                db_data['report_file'] = filename
                db_data['report_generation_time'] = datetime.now().isoformat()
                
                with open(db_filepath, 'w', encoding='utf-8') as f:
                    json.dump(db_data, f, ensure_ascii=False, indent=2)
            
            return {
                'filename': filename,
                'filepath': filepath
            }
            
        except Exception as e:
            print(f"保存报告失败: {e}")
            return {'filename': '', 'filepath': ''}

    def force_disconnect_session(self, session_id: str) -> Dict[str, Any]:
        """
        强制断开学生会话
        由教师端调用，用于主动断开学生连接
        
        Args:
            session_id: 会话ID
            
        Returns:
            断开结果
        """
        try:
            # 从活跃会话中移除
            removed_session = self.active_sessions.pop(session_id, None)
            
            # 强制结束数据管理器中的会话
            success = self.data_manager.end_session(session_id)
            
            return {
                'success': True,
                'message': '学生会话已强制断开',
                'session_id': session_id,
                'was_active': removed_session is not None
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'强制断开会话失败: {str(e)}'
            }

# 创建全局实例（将在app_lan.py中使用）
simple_student_api = None

def init_simple_api(data_manager, model_manager):
    """初始化简化API"""
    global simple_student_api
    simple_student_api = SimpleStudentAPI(data_manager, model_manager)
    return simple_student_api
