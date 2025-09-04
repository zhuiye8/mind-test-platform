# 前端工具函数和Hooks

## utils/ 工具函数模块

### 认证工具
- `auth.ts` - 用户认证相关工具（token管理、登录状态检查）

### 数据处理工具
- `fieldConverter.ts` - 字段格式转换工具
- `validation.ts` - 表单验证和数据校验工具
- `logger.ts` - 前端日志记录工具

### 时间和记录工具
- `timelineRecorder.ts` - 时间线事件记录器（重构版，支持新格式）
- `precisionTimeTracker.ts` - 高精度时间跟踪器

### 音频处理工具
- `audioEncoder.ts` - 音频编码处理工具
- `audioManager.ts` - 音频管理器
- `speechQueue.ts` - 语音队列处理

## hooks/ 自定义Hooks模块

### 数据通信Hooks
- `useDataChannel.ts` - WebRTC数据通道Hook

## 主要功能
- 用户认证状态管理
- 数据格式转换和验证
- 事件时间线记录和追踪
- 音频编码和队列管理
- WebRTC数据通信封装

## 技术特性
- TypeScript类型安全
- 向后兼容性设计
- 高精度时间戳记录
- 音频流处理优化
- 自定义Hook抽象

## 依赖关系
- 依赖: React hooks, 浏览器APIs
- 被依赖: 所有页面和组件