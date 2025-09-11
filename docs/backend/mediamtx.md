# MediaMTX 流媒体服务器集成

## 概述
MediaMTX是一个现代化的流媒体服务器，用作WebRTC和RTSP之间的桥梁，实现学生端WebRTC推流到AI服务RTSP消费的完整链路。

## 技术架构

### 数据流传输
```
学生端浏览器 --WHIP--> MediaMTX --RTSP--> AI服务(Python)
          (WebRTC)      (转换)     (分析)
```

### 协议支持
- **WHIP (WebRTC-HTTP Ingestion Protocol)**: 标准化的WebRTC推流协议
- **WHEP (WebRTC-HTTP Egress Protocol)**: 标准化的WebRTC拉流协议
- **RTSP (Real Time Streaming Protocol)**: 实时流传输协议
- **自动转换**: WebRTC流自动转换为RTSP供AI服务消费

## 部署配置

### 开发环境 (WSL2 + Windows)
```yaml
# mediamtx.yml
listen: :8889
listenTLS: :8443
rtspAddress: :8554
rtmpAddress: :1935
hlsAddress: :8888
webrtcAddress: :8889

# 路径配置
paths:
  # 测试路径
  test:
    runOnDemand: true
    runOnDemandStartTimeout: 10s
    runOnDemandCloseAfter: 10s
    
  # 动态路径（学生流）
  ~^.*:
    runOnDemand: true
    runOnDemandStartTimeout: 10s
    runOnDemandCloseAfter: 10s
```

### 生产环境 (全Linux部署)
```yaml
# Docker部署配置
version: '3.8'
services:
  mediamtx:
    image: aler9/mediamtx:latest
    ports:
      - "8889:8889"  # WebRTC/HTTP API
      - "8554:8554"  # RTSP
      - "8888:8888"  # HLS
    volumes:
      - ./mediamtx.yml:/mediamtx.yml
    restart: unless-stopped
```

## API集成

### 后端代理服务
- **WHIP Endpoint**: `POST /api/webrtc/whip` → 转发到 MediaMTX
- **WHEP Endpoint**: `POST /api/webrtc/whep` → 转发到 MediaMTX
- **健康检查**: `GET /api/webrtc/health` → 检查MediaMTX状态

### 环境变量配置
```bash
# MediaMTX服务地址
MEDIAMTX_HOST=localhost
MEDIAMTX_WHIP_PORT=8889
MEDIAMTX_RTSP_PORT=8554

# WHIP/WHEP URLs
MEDIAMTX_WHIP_URL=http://localhost:8889/test/whip
MEDIAMTX_WHEP_URL=http://localhost:8889/test/whep
```

## 流管理

### 流命名规则
```
格式: {examId}_{participantId}_{timestamp}
示例: exam_123_student_456_1693875600000
RTSP URL: rtsp://localhost:8554/exam_123_student_456_1693875600000
```

### 流生命周期
1. **创建**: 学生开始考试 → 调用WHIP API创建推流
2. **活跃**: MediaMTX接收WebRTC流并提供RTSP输出
3. **监控**: AI服务消费RTSP流进行分析
4. **销毁**: 考试结束 → 停止推流，MediaMTX自动清理

### API管理接口
```bash
# 获取所有活跃流
GET http://localhost:8889/v3/paths/list

# 获取特定流信息
GET http://localhost:8889/v3/paths/get/{path_name}

# 强制关闭流
DELETE http://localhost:8889/v3/paths/delete/{path_name}
```

## 性能优化

### 编码参数
- **视频编码**: H.264 (AVC) profile-level-id=42e01f
- **分辨率**: 1920x1080 (固定，不降级)
- **帧率**: 30fps 理想，适应网络条件
- **码率**: 8Mbps 最大，动态调整

### 缓存策略
- **GOP缓存**: 关键帧缓存提升连接速度
- **低延迟模式**: 实时传输优先级
- **自适应码率**: 根据网络条件自动调整

### 资源管理
```yaml
# 性能调优配置
rtspReadTimeout: 10s
rtspWriteTimeout: 10s
runOnDemandStartTimeout: 10s
runOnDemandCloseAfter: 10s

# 限制并发连接
maxConnections: 100
```

## 监控与诊断

### 健康检查
```typescript
// 检查MediaMTX服务状态
const checkMediaMTXHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch('http://localhost:8889/v3/config/get');
    return response.ok;
  } catch {
    return false;
  }
};
```

### 流状态监控
```bash
# 实时监控活跃流
curl -s http://localhost:8889/v3/paths/list | jq '.items[] | select(.ready==true)'

# 监控流统计信息
curl -s http://localhost:8889/v3/paths/get/test | jq '.bytesReceived'
```

### 日志分析
```yaml
# 启用详细日志
logLevel: debug
logDestinations: [file]
logFile: mediamtx.log
```

## 故障排除

### 常见问题
| 问题 | 症状 | 解决方案 |
|------|------|----------|
| 推流失败 | WHIP返回403/500错误 | 检查MediaMTX服务状态和配置 |
| 流中断 | RTSP连接断开 | 检查网络连接，重启MediaMTX |
| 延迟过高 | 视频播放卡顿 | 调整GOP大小，启用低延迟模式 |
| 端口冲突 | 服务启动失败 | 修改端口配置，检查防火墙 |

### 调试命令
```bash
# 检查端口占用
netstat -tlnp | grep :8889
netstat -tlnp | grep :8554

# 测试RTSP连接
ffplay rtsp://localhost:8554/test

# 检查MediaMTX进程
ps aux | grep mediamtx
```

## 安全配置

### 访问控制
```yaml
# 启用认证
authentication:
  method: internal
  internalUsers:
    - user: student
      pass: password123
      permissions: [publish]
```

### 网络安全
```yaml
# 限制访问IP
readIPs: [127.0.0.1, 192.168.1.0/24]
publishIPs: [127.0.0.1, 192.168.1.0/24]

# HTTPS配置
serverCert: /path/to/cert.pem
serverKey: /path/to/key.pem
```

## 开发注意事项

### WSL2环境
- **网络映射**: MediaMTX运行在Windows，后端在WSL2
- **端口转发**: 确保WSL2可访问Windows端口8889和8554
- **防火墙**: Windows防火墙需允许MediaMTX端口

### 调试工具
- **chrome://webrtc-internals**: 查看WebRTC连接状态
- **VLC/FFplay**: 测试RTSP流播放
- **MediaMTX Web UI**: http://localhost:8889 查看流状态

### 性能监控
- **CPU使用率**: MediaMTX转码占用
- **内存使用**: 流缓存占用
- **网络带宽**: 上下行流量监控
- **并发连接**: 活跃流数量限制