# WebRTC流媒体模块

**Last Updated**: 2025-01-15 - 添加stream_name机制和AI服务映射说明

## 涉及文件
- `/backend/src/services/webrtcStreamService.ts` - WebRTC流服务
- `/backend/src/routes/webrtcRoutes.ts` - WHIP/WHEP代理路由
- `/backend/src/middleware/cors.ts` - 跨域配置（支持多端口）
- `/webrtc-demo/backend/src/utils/webrtc.ts` - WebRTC工具类
- `/webrtc-demo/backend/src/hooks/useWebRTC.ts` - WebRTC React Hook

## 技术架构

### 数据流传输
```
学生端浏览器 → WHIP协议 → MediaMTX服务器(stream_name) → RTSP流 → AI服务(映射到session_id)
```

### Stream命名机制
- **stream_name格式**: `exam-{examUuid[:8]}-user-{participantId[:8]}`
- **生成函数**: `generateStreamName(examPublicUuid, participantId)`
- **用途**: 仅用于RTSP流传输标识，AI服务通过映射获取对应的session_id
- **示例**: `exam-5e3a23e1-user-2025011`

### MediaMTX集成
- **WHIP(WebRTC-HTTP Ingestion Protocol)**: 标准化的WebRTC推流协议
- **WHEP(WebRTC-HTTP Egress Protocol)**: 标准化的WebRTC拉流协议  
- **RTSP转换**: MediaMTX自动将WebRTC流转换为RTSP供AI服务消费

## 核心功能

### WHIP/WHEP代理服务
- **代理转发**: 后端作为代理转发WHIP/WHEP请求到MediaMTX
- **CORS处理**: 支持多源跨域访问（端口3000和7001）
- **错误处理**: 自动重试和降级机制
- **健康检查**: MediaMTX服务可用性检测

### WebRTC编码优化
```typescript
// 高质量编码参数
params.encodings[0].maxBitrate = 8_000_000; // 8Mbps最大码率
params.encodings[0].scaleResolutionDownBy = 1; // 不降分辨率
params.degradationPreference = 'maintain-resolution'; // 分辨率优先
```

### H.264编码优先级
- **编解码器选择**: 优先使用H.264 (AVC)
- **配置文件**: profile-level-id=42e01f (Baseline Profile)
- **兼容性**: 确保与MediaMTX和AI服务兼容

## API接口

### WHIP推流代理
- `POST /api/webrtc/whip` - 代理WHIP推流请求到MediaMTX
  - 自动将stream_name传递给MediaMTX
  - URL参数包含stream_name: `/api/webrtc/whip?stream=exam-5e3a23e1-user-2025011`
- `PATCH /api/webrtc/whip` - 代理WHIP ICE候选更新

### WHEP拉流代理  
- `POST /api/webrtc/whep` - 代理WHEP拉流请求到MediaMTX
- `PATCH /api/webrtc/whep` - 代理WHEP ICE候选更新

### 流管理
- `GET /api/webrtc/streams` - 获取活跃流列表
- `DELETE /api/webrtc/streams/:id` - 停止指定流

## 关键实现细节

### 编码参数时机
```typescript
// 关键：必须在createOffer之前设置编码参数
const transceivers = stream.getTracks().map(track => {
  return pc.addTrack(track, stream);
});
await webrtcManager.current.configureEncodingParameters(pc, transceivers);
await webrtcManager.current.setH264Priority(pc);
// 然后才能发起推流
resourceUrl.current = await whipClient.current.publish(pc);
```

### CORS多源支持
```typescript
// 支持多个源地址
const getAllowedOrigins = (): string[] => {
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  return corsOrigin.split(',').map(origin => origin.trim());
};
```

### 错误恢复机制
- **网络中断恢复**: 自动重连MediaMTX
- **编码降级**: 带宽不足时自动调整码率
- **设备切换**: 支持动态切换摄像头/麦克风

## 环境配置

### 后端环境变量
```bash
# MediaMTX服务地址
MEDIAMTX_WHIP_URL=http://localhost:8889/test/whip
MEDIAMTX_WHEP_URL=http://localhost:8889/test/whep

# CORS多源支持
CORS_ORIGIN=http://localhost:3000,http://localhost:7001
```

### MediaMTX配置
```yaml
# mediamtx.yml
paths:
  test:
    runOnDemand: true
    runOnDemandStartTimeout: 10s
    runOnDemandCloseAfter: 10s
```

## 性能优化

### 编码参数调优
- **分辨率**: 1920x1080 (固定，不降级)
- **帧率**: 30fps理想，适应网络条件
- **码率**: 8Mbps最大，动态调整
- **关键帧**: 自动GOP大小

### 网络适配
- **带宽估计**: WebRTC内置带宽适配
- **抗丢包**: H.264错误恢复机制
- **延迟优化**: 实时传输优先级

## 开发环境注意事项

### WSL2 + Windows部署
- **MediaMTX**: 运行在Windows主机
- **后端代理**: 运行在WSL2，代理请求到Windows
- **网络映射**: 确保WSL2可访问Windows端口

### 调试工具
- **chrome://webrtc-internals**: WebRTC连接状态
- **MediaMTX API**: http://localhost:8889/v3/paths/list
- **网络监控**: 实时码率和丢包率监控

## 故障排除

### 常见问题
| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 推流失败 | MediaMTX未启动 | 检查MediaMTX服务状态 |
| 码率很低 | 编码参数设置时机错误 | 确保在createOffer前设置 |
| CORS错误 | 跨域配置不当 | 检查CORS_ORIGIN环境变量 |
| 连接中断 | 网络波动 | 实现自动重连机制 |
| AI无数据 | stream_name映射错误 | 检查generateStreamName函数和AI服务映射 |
| 流名重复 | 多次提交相同参数 | stream_name可重复，但session_id必须唯一 |

### 性能调优
1. **监控码率**: 确保达到预期的Mbps级别
2. **检查分辨率**: 验证不会降级到低分辨率
3. **延迟测试**: 端到端延迟应<500ms
4. **CPU使用率**: 编码不应超过50% CPU