# 音频相关组件

## 功能说明
音频播放、管理和状态监控相关的前端组件

## 组件列表
- `AudioFilePlayer.tsx` - 音频文件播放器组件
- `AudioManagementPanel.tsx` - 音频批量管理面板
- `AudioProgressDisplay.tsx` - 音频处理进度显示组件
- `AudioStatusOverview.tsx` - 音频状态总览组件
- `audioTableConfig.tsx` - 音频表格配置和列定义

## 主要功能
- 音频文件播放控制（播放、暂停、进度）
- 批量音频生成和管理
- TTS任务进度实时显示
- 音频文件状态监控
- 表格化音频数据展示

## 技术特性
- HTML5 Audio API集成
- WebSocket实时进度更新
- 批量操作用户界面
- 音频格式验证和错误处理

## 依赖关系
- 依赖: `services/api`, 音频相关服务接口
- 被依赖: PaperDetail, QuestionRenderer等组件

## 注意事项
- 支持多种音频格式
- 网络异常处理和重试机制
- 进度条和状态指示器
- 移动端音频播放兼容性