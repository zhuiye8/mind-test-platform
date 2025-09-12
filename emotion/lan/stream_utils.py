"""流名工具（从 app_lan.py 拆分）"""

def _sanitize_token(s: str) -> str:
    if not s:
        return ''
    allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'
    return ''.join([ch for ch in str(s) if ch in allowed])


def compute_stream_name(exam_id: str, student_id: str) -> str:
    """根据考试ID与学生ID计算唯一流名（与前端一致）"""
    ex = _sanitize_token(exam_id)[:8] if exam_id else 'dev'
    pid = _sanitize_token(student_id)[:8] if student_id else 'anon'
    return f"exam-{ex}-user-{pid}"
