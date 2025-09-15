# 故障排查指南

**Last Updated**: 2025-01-15 - 创建AI服务集成故障排查文档

## AI服务集成常见问题

### 1. ID对齐问题

#### 问题症状
- AI服务生成JSON文件正常，但传输给后端失败
- 错误日志：`Session ID mismatch` 或找不到对应会话
- 学生会话卡片未显示或显示异常

#### 根本原因
session_id 和 stream_name 混用，导致数据关联失败：
- **session_id**: 必须是UUID格式，用于数据存储和后端关联
- **stream_name**: 仅用于RTSP流传输，格式为 `exam-{uuid[:8]}-user-{pid[:8]}`

#### 解决方案
1. **确认ID生成逻辑**：
   ```python
   # 正确：AI服务 contract_api/routes.py
   session_id = str(uuid.uuid4())  # 总是UUID
   # stream_name 单独计算，仅用于RTSP
   ```

2. **检查映射机制**：
   ```python
   # 确认 student_sessions 映射正确建立
   student_sessions[session_id] = {
       'session_id': session_id,
       'stream_name': stream_name,
       'student_id': participant_id
   }
   ```

3. **验证数据文件命名**：
   - JSON文件应以session_id命名：`{session_id}.json`
   - 不应使用stream_name作为文件名

### 2. 导入错误

#### 问题症状
```
ImportError: cannot import name '_session_buffer' from 'rtsp_consumer'
```

#### 根本原因
- 已删除的模块或函数仍在被引用
- 模块重构后引用路径未更新

#### 解决方案
1. **移除无效引用**：
   ```python
   # 删除这些导致ImportError的行
   # from rtsp_consumer import _session_buffer
   # _session_buffer.clear_session(session_id)
   ```

2. **简化依赖关系**：
   - 移除已废弃的功能引用
   - 使用直接的文件操作替代复杂的模块间调用

### 3. 会话注册失败

#### 问题症状
- 错误：`会话未注册到监控系统`
- 前端无法获取AI会话状态
- RTSP流无法关联到正确会话

#### 根本原因
sys.modules 注册时缺少必要字段

#### 解决方案
1. **完善注册对象**：
   ```python
   # AI服务注册时包含所有必要字段
   session_data = {
       'session_id': session_id,
       'stream_name': stream_name,
       'exam_public_uuid': exam_public_uuid,
       'participant_id': participant_id,
       'status': 'active'
   }
   ```

2. **验证注册成功**：
   - 检查日志确认会话已注册
   - 确认stream_name映射建立

### 4. 数据传输失败

#### 问题症状
- JSON文件生成正常但后端接收失败
- 网络请求超时或连接拒绝
- 幂等性校验失败

#### 解决方案
1. **检查网络连接**：
   ```bash
   # 测试AI服务到后端连接
   curl -X POST http://localhost:3001/api/ai-service/sessions/{session_id}/finalize \
        -H "Authorization: Bearer dev-fixed-token-2024" \
        -H "Content-Type: application/json"
   ```

2. **验证认证token**：
   - 确认使用正确的Bearer token
   - 检查token是否过期或被更改

3. **幂等性处理**：
   - 确保每次请求使用唯一的Idempotency-Key
   - 检查后端是否正确处理重复请求

## WebRTC流媒体问题

### 1. 推流失败

#### 问题症状
- WebRTC连接建立失败
- 视频流无法到达AI服务
- MediaMTX无法接收流

#### 解决方案
1. **检查MediaMTX状态**：
   ```bash
   # 查看MediaMTX运行状态
   curl http://localhost:8889/v3/paths/list
   ```

2. **验证编码参数时机**：
   ```typescript
   // 必须在createOffer之前设置编码参数
   await configureEncodingParameters(pc, transceivers);
   const offer = await pc.createOffer();
   ```

3. **检查CORS配置**：
   - 确认后端CORS_ORIGIN包含前端地址
   - 验证跨域请求头设置

### 2. 流质量问题

#### 问题症状
- 视频码率过低
- 分辨率自动降级
- AI分析质量差

#### 解决方案
1. **确认编码参数**：
   ```typescript
   // 设置高质量编码
   params.encodings[0].maxBitrate = 8_000_000; // 8Mbps
   params.encodings[0].scaleResolutionDownBy = 1; // 不降分辨率
   params.degradationPreference = 'maintain-resolution';
   ```

2. **监控实际码率**：
   - 使用chrome://webrtc-internals检查
   - 确认达到预期的Mbps级别

## 环境配置问题

### 1. 服务端口冲突

#### 问题症状
- 服务启动失败
- 端口被占用错误
- 跨服务通信失败

#### 解决方案
1. **标准端口配置**：
   - 前端：3000
   - 后端：3001  
   - AI服务：5678
   - MediaMTX：8889 (HTTP), 8554 (RTSP)

2. **检查端口占用**：
   ```bash
   # Linux/WSL
   ss -tulpn | grep :5678
   
   # Windows
   netstat -ano | findstr :5678
   ```

### 2. 网络环境问题

#### 问题症状
- WSL2与Windows主机网络不通
- 容器间网络访问失败
- AI服务无法访问MediaMTX

#### 解决方案
1. **WSL2网络配置**：
   ```bash
   # 获取WSL网关地址
   ip route | grep default
   ```

2. **MediaMTX地址检测**：
   - 检查环境变量MEDIAMTX_HOST
   - 使用自动检测机制找到正确地址

## 调试工具

### 1. 日志分析
- **AI服务日志**: 查看emotion/logs/或控制台输出
- **后端日志**: backend/src/utils/logger.ts输出
- **前端控制台**: 浏览器开发者工具

### 2. 实时监控
- **WebRTC状态**: chrome://webrtc-internals
- **MediaMTX状态**: http://localhost:8889/v3/paths/list
- **数据库状态**: Prisma Studio

### 3. 网络工具
```bash
# 测试服务连通性
curl -f http://localhost:5678/api/health

# 测试RTSP流
ffplay rtsp://localhost:8554/exam-test-stream

# 检查端口监听
ss -tulpn | grep -E ":(3000|3001|5678|8889|8554)"
```

## 预防措施

### 1. 开发规范
- **ID对齐原则**: 始终区分session_id和stream_name用途
- **文档同步**: 代码修改必须同步更新文档
- **错误处理**: 实现完整的错误捕获和日志记录

### 2. 测试流程
1. 单元测试：各模块独立功能
2. 集成测试：AI服务与后端对接
3. 端到端测试：完整考试流程
4. 压力测试：多并发会话处理

### 3. 监控告警
- 服务健康检查
- 关键指标监控（成功率、响应时间）
- 异常日志告警
- 资源使用监控

## 常用诊断命令

```bash
# 检查所有服务状态
docker-compose ps

# 查看AI服务日志
tail -f emotion/logs/app.log

# 测试完整链路
curl -X POST http://localhost:3001/api/public/exams/{uuid}/create-ai-session \
     -H "Content-Type: application/json" \
     -d '{"participant_id":"test123","participant_name":"测试用户"}'

# 检查数据库AI会话
cd backend && npx prisma studio
```