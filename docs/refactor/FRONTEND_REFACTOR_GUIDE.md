# 前端重构指南（监控大屏）

目标：提供监控大屏（聚合视图）与单会话诊断页，基于 WebRTC + Socket.IO 与 AI 服务联动。使用 React + Vite + TypeScript。

注意：实现前需核对 Socket.IO 客户端、WebRTC API 与 Vite 的最新官方文档。若无法访问，请在实现处标注“待调研”，不要直接拍板。

## 1. 页面与路由
- 推荐在管理端增加“大屏监控”入口，直接跳转到 AI 服务页面：
  - 现状页面：`http://<ai-host>:5000/`（实时检测）、`http://<ai-host>:5000/records`（历史记录）
  - 目标页面（规划）：`/monitor`（聚合墙）、`/monitor/sessions/:session_id`（单会话）
  - 前端不复刻渲染逻辑，仅做跳转，确保最大限度解耦

## 2. 数据与通信
- 跳转策略：采用新窗口或同窗口跳转，携带短期 Token（可选）；前端不在本仓库复刻大屏渲染。
- Socket.IO：大屏由 AI 服务端驱动，前端可订阅 `monitor.update`，定时发送 `session.heartbeat`（2s）；信令事件见《WEBRTC_SOCKETIO_DESIGN.md》。
- WebRTC：仅在需要实时预览时建立 PeerConnection；ICE host-only（待调研不同浏览器行为）。
- API：创建/结束会话在考试页触发；大屏仅展示与必要控制（不重复创建/结束）。

## 2.1 环境变量（建议）
- `VITE_AI_SERVICE_URL`：AI 服务地址（例如 `http://localhost:5678`）。前端跳转时拼接该地址。
- `VITE_API_BASE_URL`：后端 API 地址（已有）。

## 3. 组件建议
- MonitorWall：聚合卡片；显示会话基本信息、缩略预览、关键指标与异常徽标。
- SessionCard：卡片内图表（attention/ppg/audio）、状态指示（ACK/重试/延迟）。
- SessionDetail：时间线、指标折线、异常表；用于排查。

## 4. 类型与约定
- 所有接口字段 snake_case；前端类型使用 camelCase，但与服务器交互前后做映射。
- 响应统一：`{ code, message, data, request_id, timestamp }`。
- 时间：服务器 UTC → 前端按本地时区展示。

示例 TypeScript 类型（与 `AI_API_CONTRACT.md` / `DB_SCHEMA.md` 对齐）：
```ts
export type MonitorUpdate = {
  session_id: string;
  timestamp: string; // ISO8601 UTC
  models: Array<'face'|'attention'|'ppg'|'audio'|'pose'|'identity'>;
  metrics: {
    attention?: { score: number; confidence?: number };
    face?: { detected: boolean; multi_face_secs?: number; occlusion_ratio?: number };
    ppg?: { hr_bpm: number; signal_quality?: number };
    audio?: { dominant: string; confidence?: number };
  };
  anomalies: Array<{ code: string; severity: 'low'|'medium'|'high'; duration_ms?: number }>;
  latency_ms?: number;
  system?: { gpu_util?: number; cpu_util?: number; dropped_frames?: number };
}
```

## 5. 性能与隐私
- 节流：按 250–500ms 频率更新 UI；使用 requestAnimationFrame 合批渲染。
- 媒体：默认马赛克/缩略图；音频不回放，仅电平/频谱。

## 6. 配置
- 环境变量：`VITE_AI_BASE_URL`、`VITE_WS_PATH`。
- 错误处理：全局 Toast 与重连提示；对 `code` 做分支处理（1001/1002/2001/300x）。

本指南与 `WEBRTC_SOCKETIO_DESIGN.md`、`AI_API_CONTRACT.md` 为联调依据，前端以此为唯一标准开发。
## 6. UI 集成示例（跳转按钮）
```tsx
// 示例：在 Dashboard 添加按钮
const aiBase = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:5678';
<Button onClick={() => window.open(`${aiBase}/records`, '_blank')}>打开AI大屏</Button>
```

## 7. 现状与过渡
- 现状 AI 服务页面为 `/` 与 `/records`；目标 `/monitor*` 待 AI 端页面规范后切换。
- 若局域网直连不可用，退化为仅查看历史记录页面。

## 8. 学生考试页与 WebRTC（关键）

- 触发时机：收到 `create-ai-session` 成功回包（包含 `aiSessionId`）后，立即启动 WebRTC。
- 握手方式：使用 Socket.IO 信令（`signal.offer/answer/ice`）。
- 断开时机：`submit` 成功后，立即 `pc.close()` 与停止本地轨；同时后端调用 AI `/api/end_session`。
- 代码参考（伪代码）：
```ts
const { data } = await publicApi.createAISession(examUuid, { participant_id, participant_name });
if (data.aiSessionId) {
  await webrtcManager.initialize();
  await webrtcManager.connectToAI({ sessionId: data.aiSessionId, signaling: 'socketio' });
}

// 提交后
await publicApi.submitExam(examUuid, payload);
webrtcManager.disconnect();
```

### 8.1 时间线事件上报（供后端解析）
- 事件载荷规范（确定版）：
```ts
type TimelinePayload = {
  events: Array<
    | { type: 'display';  question_id: string; ts: string }
    | { type: 'select';   question_id: string; option: string; ts: string; source?: 'click'|'voice'|'keyboard' }
    | { type: 'deselect'; question_id: string; option: string; ts: string }
    | { type: 'change';   question_id: string; from?: string; to?: string; ts: string }
    | { type: 'navigate'; from: string; to: string; ts: string }
    | { type: 'focus';    question_id: string; ts: string }
    | { type: 'blur';     question_id: string; ts: string }
  >
}
```
- 规范要求：
  - ts：ISO8601，毫秒精度（示例：`2025-01-01T08:00:05.500Z`）。
  - 序：同一 payload 内按时间升序；前端保证近似实时记录，不必强制去重。
  - 题型兼容：多选通过多次 select/deselect 表达；单选通过 change 表达从 A→B。
  - navigate：表示题目间跳转（from/to 为题目 ID）；用于统计回看（逆序跳转记为回看）。
  - 可选字段：source 标注选择来源（点击/语音/键盘）。
- 解析目标：
  - 后端基于该时间线生成/更新 `QuestionResponse`（最终答案、显示时间、提交时间、作答用时）。
  - 全量写入 `QuestionActionEvent`（用于详细行为分析与审计）。

### 8.2 失败场景与前端处理
- 会话创建成功但信令失败：指数退避重试 3 次；失败后标记“AI监测不可用”，不阻断考试。
- 信令成功但无媒体：监控 `connectionstatechange` 和 `ontrack`，触发一次 renegotiation；仍失败则降级提示。
- 提交成功但 `end_session` 失败：不影响 UX；前端在 `finally` 中断开 WebRTC；后端重试。
- `end_session` 成功但 WebRTC 未断：`finally`/`beforeunload`/`pagehide` 断开，停止本地轨道。
- 关闭页签：`beforeunload/pagehide` 断开，无法保证成功；AI 端通过心跳/ICE 断线清理。
