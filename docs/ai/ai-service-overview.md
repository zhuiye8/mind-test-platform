# AI 服务概览（emotion 项目）

## 架构与技术栈
- 应用框架: Flask + Flask-SocketIO（threading 模式）
- AI 模型: DeepFace、Emotion2Vec、PPG/Enhanced PPG
- 数据源: RTSP流消费（MediaMTX → CV2）
- 合约层: `contract_api` Blueprint（REST 合约与回调）
- 结果推送: Socket.IO事件推送（支持Flask应用上下文）
- 环境配置: 支持.env文件和MediaMTX自动检测
- 运行端口: 5678（统一合约）

## 运行入口
- 推荐入口（本机/局域网统一）: `python emotion/app_lan.py`（默认 0.0.0.0:5678）

## 关键模块
- `emotion/app_lan.py`：主应用（LAN，建议部署入口）
  - 支持.env环境变量自动加载
  - MediaMTX服务器地址自动检测
  - Flask应用上下文传递给RTSP消费者
- `emotion/contract_api/`：合约 API 与回调
- `emotion/rtsp_consumer.py`：RTSP流消费与AI分析处理
  - 新增`_safe_emit()`函数支持Flask应用上下文
  - 多命名空间事件广播（默认+/monitor）
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
- **Flask应用上下文**: `_safe_emit()`确保后台线程正确发送Socket.IO事件
- **多命名空间广播**: 同时向`/`和`/monitor`命名空间广播事件

### AI模型集成
- **DeepFace**: 7种情绪检测（angry/disgust/fear/happy/sad/surprise/neutral）
- **Enhanced PPG**: 从视频中提取心率信号
- **容错设计**: 模型失败不中断流处理

### 会话管理
- **独立生命周期**: AI会话不依赖考试结果存在
- **ID对齐机制**: UUID session_id用于数据存储，stream_name仅用于RTSP流
- **映射机制**: student_sessions[session_id] = { session_id, stream_name, student_id, ... }
- **状态同步**: 自动向教师端和学生端推送结果

## 统一口径
- 端口固定 5678
- 字段命名 snake_case；时间戳 ISO8601 UTC（末尾 Z）
- 健康检查与配置以合约蓝图返回为准
- MediaMTX RTSP 地址格式：`rtsp://{host}:8554/{stream_name}`

## 环境配置
### MediaMTX服务器配置
- **环境变量**: `MEDIAMTX_HOST=http://192.168.0.112:8889`
- **自动检测**: 未设置环境变量时自动检测MediaMTX位置
  1. 检测WSL网关地址（如172.27.29.1）
  2. 尝试常见地址：192.168.0.112、192.168.1.1
  3. 回退到127.0.0.1
- **配置文件**: 支持`.env`文件加载环境变量

## 部署环境
- **开发环境**: WSL2(AI服务) + Windows(MediaMTX)
- **生产环境**: 全Linux部署，Docker容器化
- **网络要求**: AI服务需访问MediaMTX RTSP端口8554
- **资源需求**: GPU推荐但非必需，CPU模式可降级运行

## 重要注意事项 ⚠️

### ID对齐关键要求
- **session_id**: 始终是UUID格式，用于DataManager文件存储
- **stream_name**: 格式为 `exam-{uuid[:8]}-user-{pid[:8]}`，仅用于RTSP流
- **严禁混用**: 绝不能使用stream_name作为session_id
- **映射机制**: RTSP consumer通过`_map_stream_to_session()`查找session_id

### 数据文件管理
- **文件命名**: 使用session_id.json格式（如：d38c6f7a-32c9-47e7-a4ee-5c0d89641dfe.json）
- **数据传输**: 压缩JSON + MD5校验传输给后端
- **文件清理**: finalize成功后删除本地JSON文件
