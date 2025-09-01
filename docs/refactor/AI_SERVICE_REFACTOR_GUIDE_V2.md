# AI 服务重构方案 v2（面向协作落地）

本方案为确定性重构方案，结合最新约束：生产环境前端与 AI 服务处于同一局域网；前端通过 WebRTC 传输音视频并使用 Socket.IO 进行信令；面部情绪使用 DeepFace（检测器使用 YOLOv8），语音情绪使用 emotion2vec；自研心率模型用于心跳分析；所有推理在 Linux + GPU 环境下运行；依赖通过 conda 环境严格隔离与固定版本。AI 服务仅负责“分析与展示”，所有正式数据统一存储到后端。

---

## 1. 目标与非目标

### 1.1 重构目标
- 降低耦合：AI 服务仅承担本地音视频预览、模型推理、实时指标聚合与大屏展示。
- 数据归一：所有考试正式数据只存后端；AI 服务本地仅作临时缓存并定时清理。
- 简化接口：对外 REST 固定为 2 个（创建会话、结束会话）。
- 稳定交付：结束会话前先汇总实时分析结果并上报后端，收到成功 ACK 后再结束并加入清理队列。
- 监控可视：提供大屏显示实时多模型指标、音视频预览和状态面板；前端支持跳转嵌入。
- 可运维：提供健康检查、运行指标、结构化日志与固定的保留/清理策略。

### 1.2 非目标（阶段外）
- AI 报告生成在后端完成。
- 长期存储、统计分析、权限与审计由后端承担。
- 模型精度优化不在本轮范围（本轮聚焦架构与协作接口）。

---

## 2. 角色与术语
- 会话（session）：一次检测/监考过程的生命周期单位，跨模型聚合。
- 本地检测（local check）：离线/局域网自测，数据只在本机，UI 读取本地缓存。
- 考试监控（exam monitor）：考试期间在线监控，实时展示由 AI 服务推理得出的指标；正式数据入后端。
- 大屏（monitoring wall）：用于监考室/控制中心的实时总览 UI，可跨会话聚合。
- 临时缓存（ephemeral store）：AI 服务本地文件/轻量 SQLite 索引的短期缓存，用于断点恢复与最终交付前保留。

---

## 3. 总体架构与模块边界

### 3.1 逻辑架构
- 传输层：前端使用 WebRTC 传输音视频，使用 Socket.IO 进行信令；生产环境位于同一局域网，不使用 STUN/TURN，仅启用主机候选（host candidates）。
- 采集与预览层：浏览器采集并预览；大屏展示音视频缩略画面与实时指标。
- 模型推理层：并行执行三类模型——自研心率（PPG）、DeepFace+YOLOv8 面部情绪、emotion2vec 语音情绪。
- 指标聚合层：固定使用统一时钟对齐、1 秒滑窗聚合、丢帧/缺失插补、异常去重；输出标准化事件。
- 会话管理层：创建/结束会话、WS 心跳、异常恢复；结束时与后端完成可靠交付与 ACK 确认。
- 存储与清理层：本地临时缓存（JSON 指标、缩略图、可选媒体切片）；SQLite 清理计划；到期删除。
- 展示与接口层：REST（2 个接口）、Socket.IO（实时指标与信令）、健康检查与内置大屏页面（详见 WEBRTC_SOCKETIO_DESIGN.md）。

### 3.2 技术选型（固定）
- 服务框架：Python FastAPI（REST + Socket.IO via ASGI）与 aiortc（WebRTC）。
- 进程模型：主进程承载 API/Socket.IO/信令；推理由独立子进程执行（视频情绪/音频情绪/PPG 各一进程），通过本地队列通信。
- 本地缓存：文件系统 + SQLite（清理计划、幂等状态、未完成交付会话索引）。
- GPU 管理：DeepFace 使用 YOLOv8 检测器在 GPU 上运行；emotion2vec 在 GPU 上运行；PPG 自研模型在 CPU 上运行。

---

## 4. 数据规范（对内与对外统一）

### 4.1 命名与通用字段
- 外部接口与存储统一使用 snake_case；内部代码变量使用 camelCase；注释全部使用中文。
- 统一 ID：`session_id`、`exam_id`、`candidate_id`、`room_id`、`station_id`、`device_id`、`org_id`。
- 时间戳统一 ISO8601（UTC，含毫秒）：`2025-01-01T08:00:00.123Z`。

### 4.2 指标事件标准格式
```json
{
  "timestamp": "2025-01-01T08:00:00.123Z",
  "session_id": "...",
  "model": "attention|face|ppg|audio|pose|identity",
  "metrics": { "score": 0.87, "confidence": 0.93, "extras": {"blink_rate": 12} },
  "anomalies": [
    { "code": "LOOK_AWAY", "severity": "medium", "duration_ms": 1200 }
  ],
  "latency_ms": 24
}
```

### 4.3 会话汇总（结束时上报后端）
```json
{
  "session_id": "...",
  "exam_id": "...",
  "candidate_id": "...",
  "started_at": "...",
  "ended_at": "...",
  "models": ["face", "attention", "ppg"],
  "aggregates": {
    "attention": {"avg": 0.81, "low_ratio": 0.12, "spikes": 3},
    "face": {"occlusion_ratio": 0.06, "multi_face_secs": 5},
    "ppg": {"hr_avg": 76, "hr_var": 7.2}
  },
  "anomalies_timeline": [
    { "code": "PHONE_DETECTED", "from": "...", "to": "...", "evidence": {"frames": ["thumb_001.jpg"]} }
  ],
  "attachments": [
    { "type": "thumbnail", "path": "local:/sessions/abc/thumb_001.jpg", "sha256": "...", "size": 12345 }
  ],
  "compute_stats": {"avg_latency_ms": 28, "dropped_frames": 42},
  "ai_version": "ai-service@2.0.0+models-2025-01-01"
}
```

---

## 5. 接口设计（固定为两个 REST 接口）

说明：以下为 AI 服务自身对外接口；与后端的交互由 AI 服务在结束会话时主动调用后端 API 完成最终交付与确认。

### 5.1 创建会话（Create Session）
- 方法与路径：`POST /api/sessions`
- 请求体：
```json
{
  "exam_id": "e-1001",
  "candidate_id": "c-9001",
  "room_id": "r-01",
  "station_id": "pc-03",
  "mode": "local" 或 "exam",
  "enable_recording": false,
  "models": ["face", "attention", "ppg"],
  "client": {"user_agent": "...", "version": "frontend@1.4.0"}
}
```
- 响应体：
```json
{
  "session_id": "s-uuid",
  "ws_token": "jwt-or-random",
  "monitor_url": "/monitor/s-uuid",
  "retention_ttl_sec": 86400
}
```

### 5.2 结束会话（End Session + Flush）
- 方法与路径：`POST /api/sessions/{session_id}/end`
- 执行顺序：
  1) AI 服务聚合内存与本地缓存的实时分析数据；
  2) 调用后端 finalize 接口交付汇总与附件清单；
  3) 收到后端 `ack=true` 后标记会话结束，并把所有本地文件加入清理计划队列。
- 请求体：
```json
{
  "reason": "manual|timeout|error|disconnect",
  "finalize_strategy": "strict_ack|best_effort"
}
```
- 响应体：
```json
{ "status": "ok", "deleted_at": null, "backend_ack": true }
```

### 5.3 运维接口
- `GET /health`：存活与依赖探活。
- `GET /metrics`：Prometheus 文本或 JSON 指标。
- `GET /monitor`：AI 服务内置大屏聚合页面（展示所有活跃会话）。
- `GET /monitor/sessions/:session_id`：单会话诊断页面（可选）。
- Socket.IO 事件与信令：详见 `WEBRTC_SOCKETIO_DESIGN.md`。

---

## 6. 与后端交互（可靠交付）

### 6.1 后端接收接口（AI 服务主动调用）
- 方法与路径：`POST {BACKEND}/api/ai/sessions/{session_id}/finalize`
- 幂等：重复发送同一 `session_id` 返回 200 与已接收标识。
- 交付内容：会话汇总、异常时间线、附件清单、版本信息与校验哈希。
- 成功返回：`{ "ack": true, "session_id": "..." }`。

### 6.2 失败与重试
- 后端不可达：AI 服务将会话置为 `PENDING_FLUSH`，进入重试队列（指数退避 + 抖动）。大屏标记“未完成上报”，提供“立即重试”。
- 重启恢复：服务启动扫描 SQLite 索引，恢复所有 `PENDING_FLUSH` 并继续重试。

### 6.3 增量保护
- 会话过程中每 60 秒向后端写入增量 checkpoint 摘要，降低数据丢失风险。

---

## 7. 本地存储与清理计划

### 7.1 目录结构
```
/var/ai-service/
  sessions/
    s-uuid/
      meta.json            # 会话基础信息
      metrics.jsonl        # 实时指标追加写（可选）
      thumbnails/*.jpg     # 证据缩略图（可选）
      media/*.mp4          # 若启用录制
  cleanup.db               # SQLite：清理计划与状态
  tmp/
```

### 7.2 清理计划与策略
- 入队：结束会话并收到后端 ACK 后，将 `session_id` 资源入队，记录 `delete_after`（默认 24 小时）。
- 执行：后台任务每 60 秒扫描到期项并删除；删除前校验会话已完成且无待重试项。
- 手动：运维页面提供“立即删除 / 延迟删除 / 取消删除”。
- 安全：删除采用权限校验；日志仅保留摘要与计数，不包含 PII。

---

## 8. 大屏与实时指标

### 8.1 展示要点（AI 服务自带 Web UI）
- 顶部：AI 服务版本、后端连接状态（ACK/重试/延迟）。
- 会话列表：展示所有活跃会话（无权限隔离时老师可见全部）。

---

## 9. 现状对齐与过渡策略

为确保与当前仓库实现协同稳定，AI 服务在短期内保持以下“现状接口/页面”，并逐步向本方案的目标接口迁移：

- 现状·已实现接口与页面：
  - `POST /api/create_session`：创建检测会话
  - `POST /api/end_session`：结束检测会话
  - `POST /api/analyze_questions`：根据题目与时间线生成报告文本（返回字符串）
  - `GET /api/health`：健康检查
  - `GET /`：实时检测页面；`GET /records`：历史记录页面
  - Socket.IO：用于信令与监控事件（详见《WEBRTC_SOCKETIO_DESIGN.md》）

- 目标·对后端交付（规划中）：
  - Finalize：`POST {BACKEND}/api/ai/sessions/{session_id}/finalize`
  - Checkpoint：`POST {BACKEND}/api/ai/sessions/{session_id}/checkpoint`

过渡建议：
- 后端先实现 Finalize/Checkpoint 接口与 `AiSession/*` 数据模型（见《DB_SCHEMA.md》），AI 端在会话结束时对后端进行可靠交付并获得 ACK。
- 在过渡期内，报告生成仍走 `POST /api/analyze_questions` 返回文本，由后端保存至 `AIReport` 表，等 Finalize 就绪后统一迁移到 `AiSession` 体系。
- 管理端前端通过环境变量 `VITE_AI_SERVICE_URL` 跳转到 AI 服务页面（`/` 或 `/records`），不在前端复刻 AI 大屏渲染。
- 预览：音视频缩略/马赛克以保护隐私。
- 指标卡片：注意力、抬头率、遮挡、多人、人脸置信度、心率区间、音频异常等。
- 时间线：异常事件条带图，支持按模型过滤。
- 状态：GPU/CPU 占用、推理延迟、丢帧率、队列长度、重试计数。

### 8.2 订阅机制
- Socket.IO 推送：以 250–500ms 节流频率推送聚合后的最新快照（事件 `monitor.update`）。
- 断线恢复：重连后下发最近 10 秒补档快照（来自内存 ring buffer）。

---

## 9. 运行与配置

### 9.1 环境变量
- `BACKEND_BASE_URL`：后端 API 根路径。
- `RETENTION_TTL_SEC`：默认保留秒数（默认 86400）。
- `CHECKPOINT_SEC`：增量快照周期（固定 60）。
- `CLEANUP_SCAN_SEC`：清理任务轮询周期（固定 60）。
- `ENABLE_RECORDING`：是否启用录制（默认 false）。
- `MAX_CONCURRENT_SESSIONS`：最大并发会话数（默认 8）。
- `GPU_VISIBLE_DEVICES`：可见 GPU（默认 `0`）。

### 9.2 部署形态
- 单机部署：一体化服务（API/Socket.IO + 推理子进程）。
- 依赖：不引入持久 DB；仅使用本地文件与 SQLite。

### 9.3 GPU/conda 环境（隔离）
- 运行环境：WSL-Ubuntu + conda。
- 环境划分：
  - `ai-tf-gpu`（DeepFace/YOLOv8）：TensorFlow GPU 及其 CUDA/cuDNN 依赖。
  - `ai-torch-gpu`（emotion2vec）：PyTorch GPU 及其 CUDA/cuDNN 依赖。
- 运行方式：主进程通过 `conda run -n <env>` 启动各推理子进程，实现运行时隔离，避免 TF 与 Torch 的 CUDA 运行时冲突。
- GPU 校验：启动时固定打印 `tf.config.list_physical_devices('GPU')` 与 `torch.cuda.is_available()`；若任一不可用，记录错误并提示检查 CUDA/驱动（具体 CUDA/cuDNN 版本需按当期官方文档确认，无法访问时标注“待调研”）。
- YOLOv8：通过 `Config.EMOTION_DETECTION_BACKEND = 'yolov8'` 固定启用。
- 模型文件：emotion2vec 与 YOLOv8 权重需提前下发至本地目录，服务不从公网下载。

---

## 10. 安全与合规
- 身份与权限：大屏访问需要 Token；内部 Socket.IO 使用短期 `ws_token` 绑定 `session_id`。
- 隐私最小化：默认不落盘原始媒体；启用录制时按短期保留策略；大屏仅显示指标或马赛克预览，不回放原始音频。
- 传输安全：与后端通信使用 HTTPS 与证书校验；结束会话交付使用幂等键与签名。
- 日志：结构化日志，不写入人脸图像/音频内容，仅保留编号与统计摘要。

---

## 11. 失败场景与恢复策略
- 后端不可达：会话进入 `PENDING_FLUSH` 并重试；前台展示提醒并支持手动重试。
- 服务重启：使用 `cleanup.db` + `meta.json` 恢复状态；继续未完成交付。
- 推理崩溃：模型子进程隔离并自动拉起；大屏显示降级状态。
- 时间漂移：使用后端下发的服务器时间基线进行对齐。

---

## 12. 交互流程（时序）

### 12.1 本地检测
1) 前端跳转 AI 服务内置大屏并选择“本地检测”。
2) 调用 `POST /api/sessions` 创建本地会话（`mode=local`）。
3) 浏览器通过 WebRTC 传输媒体流，开始推理；Socket.IO 实时推送指标。
4) 结束：调用 `POST /api/sessions/{id}/end`；不上报后端；直接入清理队列。

### 12.2 考试监控
1) 前端创建会话（`mode=exam`）。
2) 推理与大屏展示在 AI 服务内置页面进行；每 60 秒向后端写入 checkpoint。
3) 结束：聚合 → 调后端 finalize → ACK → 返回客户端 → 入清理计划。

### 12.3 清理计划
1) 会话结束并 ACK 后将 `session_id` 入队，记录 `delete_after`。
2) 定时任务删除到期资源；成功后写入审计摘要（不含 PII）。

---

## 13. 迁移计划与里程碑（重零写）
- M1 架构骨架：FastAPI + Socket.IO + aiortc，跑通本地检测与大屏。
- M2 模型接入：接入自研 PPG、DeepFace+YOLOv8、emotion2vec；统一事件与聚合。
- M3 会话闭环：创建/结束接口；结束会话可靠交付后端并入清理队列；checkpoint 生效。
- M4 运维完善：监控指标、结构化日志、告警、手动重试与清理控制台。
- M5 性能与稳定：压力测试、资源限额、并发会话治理、断点恢复。

---

## 14. 现有设想的确认与必要补充
- 两个 REST 接口固定，心跳/保活固定走 Socket.IO 事件（`session.heartbeat`），用于异常结束检测与自动回收。
- 结束会话之外，固定每 60 秒写入 checkpoint 到后端，降低数据丢失风险。
- 大屏默认启用马赛克/缩略预览与“仅指标显示”，音频仅显示电平/频谱，不回放内容。
- 清理计划使用 SQLite 持久索引；删除前固定校验“后端 ACK 已完成”。
- 本地检测与考试监控共享一套链路，差异仅在 `mode` 与是否上报后端。
- 报告生成/导出/统计集中在后端；AI 服务仅上传必要的缩略图与聚合指标（短期保留）。
- 所有上报包含 `ai_version` 与模型版本指纹，便于回溯与对账。

### 14.1 WebRTC + Socket.IO（局域网固定方案）
- 信令事件：`signal.offer`、`signal.answer`、`signal.ice`、`signal.ready`、`signal.close`。
- 指标事件：`monitor.update`（250–500ms 节流）、`session.heartbeat`（2s）。
- 局域网：不配置 STUN/TURN，ICE 仅使用 host 候选；禁止公网回落。

- 面部情绪：DeepFace 使用 YOLOv8 检测器；`detector_backend='yolov8'` 固定；权重 `yolov8n-face.pt` 预置到 `emotion/models/deepface_models/weights/`。
- 语音情绪：emotion2vec 使用 `iic/emotion2vec_plus_seed` 本地快照，缓存至 `emotion/models/emotion2vec_models/`。
- 心率：自研 PPG 使用 CPU。
- 运行平台：Linux + NVIDIA GPU；依赖以 `emotion/requirements.txt` 为准（WSL-Ubuntu + conda）。

---

## 15. 与后端/前端的固定对齐项
- 后端 finalize 接口：`POST /api/ai/sessions/{session_id}/finalize`（JWT 鉴权 + Idempotency-Key 头），返回 `{ack: true}`。
- 检查点存储：后端存储时间序列与异常摘要；使用按考试分区 + 时间压缩归档策略。
- 证据保留：仅保留缩略图/关键帧，默认 TTL 24 小时；不保留原始音频。
- 大屏路由：前端网关跳转到 AI 服务 `/monitor`，携带短期 Token。
- 并发会话：默认上限 8；GPU/CPU/带宽按节点限额进行拒绝与排队。
- 数据模型：详见 `DB_SCHEMA.md`，后端以其为唯一来源。

---

## 16. 最小实现清单（同事落地参考）
- API：`POST /api/sessions`、`POST /api/sessions/{id}/end`、`GET /health`、Socket.IO 事件链路（信令 + 监控）。
- 模块：会话管理、三类模型适配（PPG/DeepFace+YOLOv8/emotion2vec）、聚合器、清理计划器、本地缓存、运维指标。
- 配置：环境变量与配置文件；覆盖后端地址、保留 TTL、并发数、是否录制、GPU 设备。
- 大屏：单页应用 + Socket.IO 订阅，包含会话信息、指标卡、时间线与系统状态。
- 可靠交付：结束会话调用后端 finalize 并处理重试/幂等；checkpoint 固定为 60 秒。

---

## 17. API 响应规范（统一）
- 顶层结构：
```json
{ "code": 0, "message": "ok", "data": { ... }, "request_id": "uuid", "timestamp": "2025-01-01T08:00:00.123Z" }
```
- 约定：
- `code`：0 表示成功；非 0 为错误码（例如 1001 参数错误、1002 未授权、2001 会话不存在、3001 后端不可达）。
- `message`：简体中文描述。
- `data`：具体业务数据。
- `request_id`：服务生成的请求标识。
- `timestamp`：服务器时间。

---

## 18. 代码开发规范（AI 服务）
- 语言与风格：Python 3.10；`ruff` + `black` 固定格式；严格类型注解；所有注释为中文。
- 目录结构：`api/`、`services/`、`models/`、`sio/`（Socket.IO 事件）、`webrtc/`、`storage/`、`utils/`、`monitor/`。
- 命名：模块/文件 `snake_case.py`；类 `PascalCase`；变量/函数 `snake_case`（内部）；接口与持久化字段 `snake_case`（外部）。
- 日志：`structlog` 或 `logging` 结构化输出（JSON），不包含 PII；错误带错误码。
- 安全：禁止硬编码密钥；与后端通信使用 JWT；权重与模型存于本地目录，不从公网动态下载。

---

## 19. DeepFace + YOLOv8 与 emotion2vec 集成细则
- DeepFace：
  - `detector_backend='yolov8'` 固定；权重 `yolov8n-face.pt` 预置到 `emotion/models/deepface_models/weights/`。
  - 使用 `ai-tf-gpu` 环境；启动时打印 `tf.config.list_physical_devices('GPU')` 结果；推理在 `/GPU:0`。
  - 仅启用 `actions=['emotion']`；输出情绪标签统一为 `['angry','disgust','fear','happy','sad','surprise','neutral']`，归一化到 0-1。
- emotion2vec：
  - 本地模型目录固定为 `emotion/models/emotion2vec_models/iic/emotion2vec_plus_seed`（或 `snapshots/<hash>`）；不依赖外网下载。
  - 使用 `ai-torch-gpu` 环境；`device='cuda:0'`；采样率固定 16kHz；输入为 PCM float32。
  - 输出情绪标签固定映射为 `['angry','disgusted','fearful','happy','neutral','other','sad','surprised','unknown']`，值域 0-1。
- PPG 心率：
  - 固定使用 CPU；输入为视频 ROI（面部区域）或绿色通道；输出 `hr_bpm`、`signal_quality`。

---

## 20. WebRTC/Socket.IO 确定性协议
- 信令（Socket.IO）：
  - `signal.offer`（前端→服务）：`{session_id, sdp}`
  - `signal.answer`（服务→前端）：`{session_id, sdp}`
  - `signal.ice`（双向）：`{session_id, candidate}`
  - `signal.ready`（服务→前端）：`{session_id}`
  - `signal.close`（服务→前端）：`{session_id, reason}`
- 监控（Socket.IO）：
  - `monitor.update`（服务→前端，250–500ms）：聚合指标快照
  - `session.heartbeat`（前端→服务，2s）：`{session_id, ts}`

---

## 21. 现有代码评估与决策（重零写）
- 评估结论：
  - 代码体量与耦合度过高（如 `app_lan.py` 体积庞大且混合控制/业务/外部调用）。
  - 存在硬编码外部 API 密钥与公网调用的安全风险。
  - DeepFace 与 YOLOv8、emotion2vec 的 GPU 使用不统一，检测器与设备选择分散且不一致。
  - WebRTC 与 Socket.IO 逻辑与业务逻辑交织，难以维护与扩展。
- 确定方案：
  - 重零写服务层与传输层；模型适配层保留并小幅重构（`emotion/models/deepface_analyzer*_gpu.py`、`emotion/models/emotion2vec*_gpu.py`、`enhanced_ppg_detector.py`）。
  - 推理子进程分别运行于两个 conda 环境（`ai-tf-gpu` 与 `ai-torch-gpu`），彻底规避 TensorFlow 与 PyTorch 在 CUDA/cuDNN 上的潜在冲突。
  - 新服务按本方案固定接口、固定数据规范与模块边界交付。

---

---

以上为确定性 v2 方案，按此执行即可与后端/前端重构对齐并快速落地。

---

以上方案可作为 v2 基线，后续可根据落地过程中的性能与安全需求迭代细化。
