# AI相关组件

## 功能说明
AI分析和报告相关的前端组件模块

## 组件列表
- `AIReportViewer.tsx` - AI分析报告查看器，支持报告显示和下载
- `VoiceInteraction.tsx` - 语音交互组件，集成STT/TTS功能
- `VoiceSTTPanel.tsx` - 语音转文字面板，录音和识别界面
- `VoiceTTSPanel.tsx` - 文字转语音面板，语音合成控制
- `RecoveryStatusMonitor.tsx` - 恢复状态监控器，AI服务状态检测

## 主要功能
- AI报告内容渲染和格式化
- 语音录制和播放控制
- 实时语音识别和合成
- AI服务连接状态监控
- 错误处理和用户反馈

## 技术特性
- WebRTC语音数据传输
- 实时状态更新
- 专业报告格式化
- 多模态交互支持

## 依赖关系
- 依赖: `services/api`, AI服务接口, WebRTC APIs
- 被依赖: ParticipantExam, ExamDetail页面

## 注意事项
- 支持AI服务降级处理
- 语音权限检测和引导
- 异步数据处理和状态同步
- 响应式设计适配移动端