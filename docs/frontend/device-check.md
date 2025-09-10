# 设备连接模块

## 概述
设备连接与验证模块，建立并维持与用户摄像头和麦克风的连接状态，从连接验证阶段持续到考试结束，为AI情绪分析提供稳定的媒体流传输。

## 涉及文件
```
frontend/src/components/DeviceCheck/
├── DeviceCheckPage.tsx           # 设备连接主页面
├── components/
│   ├── CameraPreview.tsx         # 摄像头预览组件  
│   ├── MicrophoneMeter.tsx       # 麦克风音量检测
│   └── TroubleshootTips.tsx      # 故障排除提示
├── hooks/
│   └── useDeviceCheck.ts         # 设备连接核心逻辑
├── utils/
│   └── media.ts                  # 媒体流获取工具
├── types.ts                      # TypeScript类型定义
└── index.ts                      # 导出文件
```

## 设备连接流程

### 1. 权限获取阶段
```typescript
// 检查现有权限状态
const cameraPermission = await navigator.permissions.query({ name: 'camera' });
const microphonePermission = await navigator.permissions.query({ name: 'microphone' });

// 如果被拒绝，提供明确指引
if (permission.state === 'denied') {
  // 显示解决方案提示
}
```

### 2. 设备流获取阶段  
```typescript
// 多级回退策略
VIDEO_PRESETS: [
  { video: { width: 640, height: 480, frameRate: 15, aspectRatio: 4/3 } }, // 理想配置
  { video: { width: 640, height: 360, frameRate: 10, aspectRatio: 16/9 } }, // 降级配置
  { video: { width: { min: 320 }, height: { min: 240 } } }, // 最低配置
  { video: true }, // 任意配置
]
```

### 3. Windows平台优化
- **虚拟摄像头处理**: 过滤`/virtual|obs|snap|youcam|manycam|droidcam/i`
- **优先级策略**: 真实摄像头 > 虚拟摄像头  
- **音频配置优化**: 44.1kHz采样率，单声道，增强降噪

### 4. 设备预览确认阶段
- 用户可以看到摄像头实时画面
- 麦克风音量实时检测和显示
- 用户可切换不同的摄像头/麦克风设备
- **关键变更**：用户点击"确认连接正常，保持连接"后进入下一阶段，但设备流不会被停止

### 5. 流生命周期管理 🆕
```typescript
// 流保持策略（新架构）：
// 1. 用户点击确认按钮 → 流保存到MediaStreamContext，不停止
// 2. 页面导航 → 流在Context中保持活跃状态
// 3. 进入考试页面 → 复用Context中的流，避免重新请求权限
// 4. 考试结束 → 由顶层MediaStreamProvider统一清理

// 新增Context管理：
// - MediaStreamContext维护全局流状态
// - 流有效性验证机制
// - 自动降级到重新获取流（如果失效）
// - 统一的资源清理时机
```

## 错误处理机制

### 常见错误类型及解决方案

| 错误类型 | 原因 | 解决方案 |
|---------|------|----------|
| `NotReadableError` | 设备被其他应用占用 | 关闭QQ、微信、腾讯会议、OBS等 |
| `NotFoundError` | 设备未找到或驱动异常 | 检查设备连接，重启浏览器 |
| `PermissionDeniedError` | 权限被拒绝 | 刷新页面重新授权 |
| `OverConstrainedError` | 设备不支持要求的配置 | 自动降级到更低配置 |

### 错误恢复策略
1. **自动重试**: `OverConstrainedError`会自动降级重试
2. **手动重试**: 提供"重新检测"按钮
3. **降级模式**: 设备完全失败时允许跳过检测
4. **详细指引**: 针对Windows平台提供具体操作步骤

## AI服务集成

### 配置管理
```bash
# 前端环境变量（优先级最高）
VITE_AI_SERVICE_URL=http://localhost:5678

# 后端配置提供给前端
AI_SERVICE_URL=http://localhost:5678
```

### WebRTC连接流程 🆕 
1. 设备连接阶段获取并验证流
2. 流保存到全局MediaStreamContext中
3. 进入考试时直接使用Context中的流（无需重新获取权限）
4. aiSessionWebRTC优先使用外部流，降级到重新获取
5. AI服务通过Socket.IO返回分析结果

### 新增架构组件
```typescript
// MediaStreamContext - 全局流状态管理
interface MediaStreamContextValue {
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  isStreamsActive: boolean;
  setStreams: (video, audio) => void;
  validateStreams: () => { videoValid, audioValid };
  clearStreams: () => void;
}
```

## 性能优化

### Windows平台特殊处理
- 音频采样率：44.1kHz（Windows兼容性更好）
- 视频帧率：15fps理想，5-30fps范围（适应性能差异）
- 宽高比：4:3优先，16:9备选（兼容不同设备）

### 内存管理
- 使用`useRef`避免闭包陷阱
- 及时断开AudioContext和AnalyserNode
- 确保MediaStream轨道正确停止

## 测试指南

### Windows测试要点
1. **设备占用测试**: 开启QQ/微信视频通话，验证错误提示
2. **虚拟摄像头测试**: 安装OBS，测试虚拟摄像头支持
3. **浏览器兼容**: Chrome、Edge、Firefox分别测试
4. **权限测试**: 拒绝权限后，验证重新授权流程

### 验收标准 🆕
- ✅ 设备预览持续显示直到用户确认
- ✅ 音频音量实时检测正常
- ✅ 设备切换不中断预览
- ✅ 错误提示准确且具有指导性
- 🆕 **流连续性**: 从连接验证到考试结束，流保持活跃状态
- 🆕 **权限复用**: 考试开始时无需再次请求媒体权限
- 🆕 **流健康检查**: 自动检测流状态，失效时能够降级处理
- 🆕 **统一清理**: 考试结束或页面卸载时统一清理所有资源