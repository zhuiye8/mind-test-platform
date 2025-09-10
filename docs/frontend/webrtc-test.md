# WebRTC 连接测试页面

路径：`/webrtc-test`

## 目的
- 独立于考试流程，最小闭环验证“创建会话 → 建链 → 发送音视频流 → 结束会话”。
- 对接 AI 服务信令（Socket.IO），观察端到端行为，便于排障。

## 使用步骤
1. 打开 `/webrtc-test`，确认 AI 配置：`available`、`websocketUrl`。
2. 选择摄像头与麦克风，点击“获取媒体”，预览画面与音量。
3. 点击“创建会话”，得到 `session_id`。
4. 点击“建立 WebRTC”，观察控制台日志与“连接状态”。
5. 进入 AI 服务页面或查看日志，确认收到 offer/answer/ice，且会话状态活跃。
6. 可点击“断开”与“结束会话”分别断开信令/释放会话。

## 实现要点
- 创建/结束会话：经后端代理 `/api/ai-proxy/create_session`、`/api/ai-proxy/end_session`（避免 CORS）。
- 信令：
  - 兼容事件名：前端同时发送/监听 `webrtc-*` 与 `signal.*`（offer/answer/ice）。
  - 心跳：每 3s 发送 `session.heartbeat { session_id, ts(ISO8601 Z) }`，避免服务端“时间解析异常”。
- 媒体流：从所选设备获取音视频流，注入到 RTCPeerConnection 作为外部流发送。

## 常见问题
- 未收到 answer：检查事件名兼容性；必要时临时只发 `signal.offer` 或只发 `webrtc-offer` 以定位。
- 时间解析异常：确认心跳格式 `new Date().toISOString()`，服务端应解析为 UTC 时间。
- ICE 失败：检查网络与端口；若走同机直连，`iceServers: []` 即可。
