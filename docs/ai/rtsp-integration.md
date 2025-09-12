# RTSP集成与Socket.IO广播机制

## 架构概览
```
学生端(WebRTC WHIP) → MediaMTX → RTSP流 → AI服务(rtsp_consumer.py) → Socket.IO事件 → 前端页面
```

## RTSP消费机制

### RTSPConsumerManager类
- **功能**: 管理多个RTSP流的并发消费
- **实现**: `emotion/rtsp_consumer.py`
- **特性**: 
  - 多线程并行处理多个学生流
  - 自动重连和容错处理
  - 动态启动/停止流消费

### _ConsumerThread线程类
```python
class _ConsumerThread(threading.Thread):
    def __init__(self, stream_name: str, rtsp_url: str, model_manager):
        # 初始化OpenCV VideoCapture
        # 配置AI模型管理器
        # 设置流名称和URL
```

### 核心处理流程
1. **连接建立**: OpenCV连接RTSP流，支持TCP传输备选
2. **帧读取**: 实时读取视频帧，640x360降采样优化
3. **AI推理**: DeepFace情绪检测 + Enhanced PPG心率检测
4. **结果广播**: 通过Socket.IO向多个命名空间广播结果

## Socket.IO事件广播

### Flask应用上下文问题与解决

#### 问题描述
Flask-SocketIO在后台线程中发送事件时需要Flask应用上下文，直接调用`socketio.emit()`会导致事件发送失败。

#### 解决方案：_safe_emit函数
```python
def _safe_emit(event, data, **kwargs):
    """在后台线程中安全地发送Socket.IO事件"""
    if _socketio is None:
        print(f"[RTSP] ❌ Socket.IO未初始化，无法发送事件: {event}")
        return False
    
    try:
        if _app is not None:
            # 使用Flask应用上下文
            with _app.app_context():
                _socketio.emit(event, data, **kwargs)
                return True
        else:
            # 如果没有app实例，直接尝试发送
            _socketio.emit(event, data, **kwargs)
            return True
    except Exception as e:
        print(f"[RTSP] ❌ 发送事件失败 {event}: {e}")
        return False
```

### 多命名空间广播策略

#### 广播事件类型
1. **视频情绪分析结果**:
   - `video_emotion_result` - 默认命名空间
   - `video_emotion_result` - /monitor命名空间
   - `rtsp_video_analysis` - 备用事件名

2. **心率检测结果**:
   - `heart_rate_result` - 默认命名空间  
   - `heart_rate_result` - /monitor命名空间
   - `rtsp_heart_rate_analysis` - 备用事件名

3. **房间特定事件**:
   - `student.emotion` - 发送到特定流房间
   - `student.heart_rate` - 发送到特定流房间

#### 事件负载格式
```json
{
    "session_id": "学生会话ID", 
    "stream_name": "exam-xxxx-user-yyyy",
    "result": {
        "dominant_emotion": "happy",
        "face_detected": true,
        "confidence": 0.85,
        "emotions": {
            "happy": 0.85,
            "neutral": 0.12,
            "surprise": 0.03
        }
    },
    "video_timestamp": 1637123456.789
}
```

### 前端事件监听策略

#### 双重监听机制
为确保事件接收，前端在两个Socket连接上监听相同事件：

1. **主Socket连接**（默认命名空间）
```javascript
socket.on('video_emotion_result', (data) => {
    console.log('🎯 [主Socket收到视频情绪分析]', data);
    updateVideoEmotionDisplay(data.result);
});
```

2. **Monitor Socket连接**（/monitor命名空间）
```javascript
monitorSocket.on('video_emotion_result', (data) => {
    console.log('🎯 [Monitor收到视频情绪分析]', data);
    updateVideoEmotionDisplay(data.result);
});
```

#### 备用事件监听
同时监听备用事件名确保接收：
```javascript
socket.on('rtsp_video_analysis', (data) => {
    console.log('🎯 [收到备用视频分析事件]', data);
    updateVideoEmotionDisplay(data.result);
});
```

## 技术亮点

### 1. 容错与重连机制
- **自动重连**: 网络中断或流断开时自动重连
- **多协议支持**: RTSP over TCP/UDP自动切换
- **解码回退**: OpenCV失败时尝试FFmpeg解码

### 2. 性能优化
- **帧率控制**: 限制处理频率避免CPU过载
- **降采样处理**: 640x360分辨率减少计算量
- **异步推理**: AI模型推理不阻塞帧读取

### 3. 调试与监控
- **详细日志**: 每个处理环节都有状态日志
- **性能指标**: 帧率、处理延迟、错误统计
- **健康检查**: 提供RTSP消费状态API

### 4. 流映射与会话管理
```python
def _map_stream_to_session(stream_name: str):
    # 根据 stream_name 反查学生会话
    # 支持手动绑定和自动映射两种模式
    return { 'session_id': sid, 'student_id': student_id }
```

## 部署注意事项

### 环境配置
1. **MediaMTX地址**: 通过`MEDIAMTX_HOST`环境变量或自动检测
2. **网络访问**: 确保AI服务能访问MediaMTX的8554端口
3. **依赖安装**: OpenCV-Python、NumPy等视频处理库

### 监控建议
1. **连接状态**: 监控RTSP连接是否稳定
2. **处理延迟**: 关注从帧读取到结果推送的端到端延迟
3. **错误率**: 统计模型推理失败率和网络连接失败率

### 性能调优
1. **并发控制**: 根据硬件性能调整最大并发流数量
2. **模型优化**: 使用GPU加速AI推理
3. **网络优化**: 使用TCP传输提高稳定性

## API接口

### 启动RTSP消费
```http
POST /api/rtsp/start
Content-Type: application/json

{
    "stream_name": "exam-xxxx-user-yyyy",
    "rtsp_url": "rtsp://192.168.0.112:8554/exam-xxxx-user-yyyy"
}
```

### 停止RTSP消费  
```http
POST /api/rtsp/stop
Content-Type: application/json

{
    "stream_name": "exam-xxxx-user-yyyy"
}
```

### 查询消费状态
```http
GET /api/rtsp/status
```

返回当前所有活跃的RTSP消费线程状态和统计信息。