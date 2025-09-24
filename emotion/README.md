# 情绪检测系统 - 局域网版本

基于深度学习的情绪检测系统，支持音频、视频、心率的多模态情感识别，专为学生端和教师端局域网通信设计。

## 🎯 项目概述

本项目是一个专门为考试系统设计的情绪检测教师端项目，支持学生端通过局域网进行实时情绪监测和心理分析报告生成。系统已简化为两个核心API接口，降低了对接复杂度。

## ✨ 核心功能

### 🔗 学生端对接API

#### 1. 视音频流检测接口
- **开始检测**: `POST /api/student/start_detection`
  - 创建唯一会话ID
  - 返回WebSocket连接地址
  - 支持实时视频帧和音频数据传输

- **结束检测**: `POST /api/student/end_detection`
  - 结束检测会话
  - 返回检测数据摘要

#### 2. 题目时间戳分析接口
- **题目分析**: `POST /api/student/analyze_questions`
  - 接收题目内容、时间戳和会话ID
  - 5秒容差的精确时间匹配算法
  - 调用千问AI生成专业心理分析报告

### 🧠 AI分析能力

- **面部情绪检测**: 基于DeepFace模型，支持7种情绪
- **语音情绪分析**: 基于Emotion2Vec模型，支持多种情绪
- **PPG心率检测**: 实时心率监测算法
- **AI心理分析**: 千问模型生成专业心理医生风格报告

## 🚀 快速启动

### 环境要求
- Python 3.7+
- Windows/Linux/macOS
- 支持现代浏览器

### 安装步骤

1. **克隆项目**
```bash
git clone <项目地址>
cd emotion
```

2. **安装依赖**
```bash
pip install flask flask-socketio numpy pillow requests
```

3. **启动系统**
```bash
python app_lan.py
```

4. **访问系统**
- 教师端：`http://<局域网IP>:<AI_SERVICE_PORT>`（开发默认 6100）
- WebSocket：`ws://<局域网IP>:<AI_SERVICE_PORT>/socket.io/`

## 🧾 日志与调试

- 前端控制台：默认精简日志，需临时查看详尽日志可在 URL 追加 `?debug=1`。
- 服务端日志：可通过环境变量控制日志等级：
  - `AI_LOG_LEVEL=INFO`（默认）/`DEBUG`/`WARN`/`ERROR`
  - 仅 `rtsp_consumer.py` 的日志受此变量控制，其余模块后续会逐步收敛。

## 📋 学生端对接示例

### 1. 开始检测
```javascript
const response = await fetch('http://教师端IP:5000/api/student/start_detection', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        student_id: 'STUDENT_001',
        exam_id: 'EXAM_001'
    })
});
const {session_id} = await response.json();
```

### 2. WebSocket连接传输数据
```javascript
const socket = io('ws://教师端IP:5000/socket.io/');

// 发送视频帧
socket.emit('video_frame', {
    session_id: session_id,
    frame_data: 'data:image/jpeg;base64,/9j/4AAQ...'
});

// 发送音频数据
socket.emit('audio_data', {
    session_id: session_id,
    audio_data: 'data:audio/wav;base64,UklGR...'
});

// 接收检测结果
socket.on('video_emotion_result', (data) => {
    console.log('面部情绪:', data.result.dominant_emotion);
});
```

### 3. 题目分析
```javascript
const analysisResponse = await fetch('http://教师端IP:5000/api/student/analyze_questions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
        session_id: session_id,
        questions_data: [{
            question_id: 1,
            content: '你是否会在夜晚产生焦虑情绪？',
            start_time: '2025-08-14T09:10:10',
            end_time: '2025-08-14T09:10:30'
        }]
    })
});
const {report} = await analysisResponse.json();
```

## 🛠 技术架构

### 后端技术
- **Flask**: Web框架
- **Flask-SocketIO**: WebSocket实时通信
- **DeepFace**: 面部情绪分析
- **Emotion2Vec**: 语音情绪分析
- **千问API**: AI心理分析报告生成

### 数据流程
1. 学生端发起检测 → 教师端创建会话ID
2. 实时传输视音频流 → 教师端实时分析情绪和心率
3. 学生端发送答题数据 → 教师端匹配时间戳
4. AI生成心理分析报告 → 返回给学生端

## 📁 项目结构

```
emotion/
├── app_lan.py              # 局域网部署主程序
├── start_lan.py            # 优化启动脚本
├── config.py               # 系统配置
├── student_api/            # 学生端API模块
│   ├── simple_api.py       # 简化API核心实现
│   └── README.md           # API说明文档
├── models/                 # AI模型模块
├── utils/                  # 工具模块
├── static/                 # 前端资源
├── templates/              # HTML模板
└── data/                   # 数据存储
```

## ⚠️ 使用注意事项

1. **网络环境**: 建议在局域网环境下使用
2. **浏览器兼容**: 需要现代浏览器支持WebRTC
3. **权限授权**: 首次使用需授权摄像头和麦克风权限
4. **模型加载**: 首次启动需要15-30秒加载AI模型

## 🔧 常见问题

### 页面加载卡住
- 检查 `/api/model_loading_status` 接口是否正常
- 刷新页面重试
- 检查网络连接

### 音视频功能无法使用
- 确保在HTTPS环境或局域网环境
- 检查浏览器权限设置
- 确认摄像头和麦克风设备正常

### API接口连接失败
- 检查IP地址和端口配置
- 确认防火墙设置
- 验证服务器启动状态

## 📞 技术支持

如遇问题请检查：
1. Python版本和依赖包
2. 网络连接和防火墙设置
3. 浏览器控制台错误信息
4. 服务器启动日志

---

**版本**: 2.0.0 (简化版)  
**更新**: 2025年8月14日  
**特点**: 专为学生端对接设计的简化API系统
