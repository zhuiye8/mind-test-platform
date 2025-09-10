import os

class Config:
    """应用配置类"""
    
    # Flask配置
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'emotion-analysis-secret-key-2024'
    DEBUG = True
    
    # 服务器配置
    HOST = '127.0.0.1'  # 改为localhost以避免Windows防火墙问题
    PORT = 5678  # 改为5678以符合契约要求
    
    # 文件上传配置
    UPLOAD_FOLDER = 'static/uploads'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
    ALLOWED_EXTENSIONS = {'wav', 'mp3', 'mp4', 'avi', 'mov', 'webm'}
    
    # 数据存储配置
    DATA_FOLDER = 'data'
    SESSIONS_FOLDER = 'data/sessions'
    
    # 模型配置
    EMOTION2VEC_MODEL_PATH = 'models/emotion2vec'
    DEEPFACE_MODEL_NAME = 'VGG-Face'
    EMOTION_DETECTION_BACKEND = 'opencv'
    
    # 分析配置
    ANALYSIS_INTERVAL = 2.0  # 秒，分析间隔
    AUDIO_CHUNK_DURATION = 3.0  # 秒，音频分析块长度
    VIDEO_FRAME_RATE = 1  # 每秒分析帧数
    
    # WebSocket配置
    SOCKETIO_ASYNC_MODE = 'threading'
    SOCKETIO_CORS_ALLOWED_ORIGINS = "*"
    
    @staticmethod
    def init_app(app):
        """初始化应用配置"""
        # 创建必要的目录
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(Config.DATA_FOLDER, exist_ok=True)
        os.makedirs(Config.SESSIONS_FOLDER, exist_ok=True)
        os.makedirs('static/css', exist_ok=True)
        os.makedirs('static/js', exist_ok=True)
        os.makedirs('templates', exist_ok=True)
        os.makedirs('models', exist_ok=True)
        os.makedirs('utils', exist_ok=True)
