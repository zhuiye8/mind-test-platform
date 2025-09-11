# AI 服务概览（emotion 项目）

## 架构与技术栈
- 应用框架: Flask + Flask-SocketIO（threading 模式）
- AI 模型: DeepFace、Emotion2Vec、PPG/Enhanced PPG
- 数据源: RTSP流消费（MediaMTX → CV2）
- 合约层: `contract_api` Blueprint（REST 合约与回调）
- 结果推送: Socket.IO事件推送
- 运行端口: 5678（统一合约）

## 运行入口
- 本机开发: `python emotion/app.py`（127.0.0.1:5678）
- 局域网部署: `python emotion/app_lan.py`（0.0.0.0:5678）

## 关键模块
- `emotion/app_lan.py`：主应用（LAN，建议部署入口）
- `emotion/contract_api/`：合约 API 与回调
- `emotion/rtsp_consumer.py`：RTSP流消费与AI分析处理
- `emotion/models/*`：AI 模型加载与推理
- `emotion/utils/*`：数据处理辅助工具
- `emotion/config.py`：全局配置（端口、CORS、SocketIO）

## 数据流架构
```
学生端(WebRTC) → MediaMTX(WHIP) → RTSP流 → AI服务(rtsp_consumer.py) → 分析结果 → Socket.IO推送
```

## 合约与事件
- REST 合约：`/api/health`、`/api/ai/config`、`/api/create_session`、`/api/end_session`
- 回调：AI→Backend `finalize`、`checkpoint`（`/api/ai-service/sessions/...`）
- Socket.IO 推送：`video_emotion_result`、`heart_rate_result`、`student_*_result`
- RTSP 消费：`RTSPConsumerManager` 管理多个流消费线程

调试辅助（仅 app_lan，不影响合约）：
- `/api/lan/health`、`/api/simple/create_session`、`/api/simple/end_session`

## 技术特性

### RTSP流消费
- **多路复用**: `RTSPConsumerManager` 管理多个学生流
- **容错处理**: OpenCV + FFmpeg 双重解码备选
- **自动重连**: 网络中断自动恢复连接
- **性能优化**: 640x360降采样，减少计算开销

### AI模型集成
- **DeepFace**: 7种情绪检测（angry/disgust/fear/happy/sad/surprise/neutral）
- **Enhanced PPG**: 从视频中提取心率信号
- **容错设计**: 模型失败不中断流处理

### 会话管理
- **独立生命周期**: AI会话不依赖考试结果存在
- **流映射机制**: stream_name → session_id + student_id
- **状态同步**: 自动向教师端和学生端推送结果

## 统一口径
- 端口固定 5678
- 字段命名 snake_case；时间戳 ISO8601 UTC（末尾 Z）
- 健康检查与配置以合约蓝图返回为准
- MediaMTX RTSP 地址格式：`rtsp://localhost:8554/{stream_name}`

## 部署环境
- **开发环境**: WSL2(AI服务) + Windows(MediaMTX)
- **生产环境**: 全Linux部署，Docker容器化
- **网络要求**: AI服务需访问MediaMTX RTSP端口8554
- **资源需求**: GPU推荐但非必需，CPU模式可降级运行