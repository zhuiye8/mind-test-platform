# 故障排查

## 学生会话被立即清理（"清理异常会话"）
- 现象：创建会话后，AI 终端日志出现 `清理异常会话: <id>`
- 根因：时间戳为 ISO8601 `...Z`，`datetime.fromisoformat` 解析失败
- 修复：已在 `app_lan.py:/api/student_sessions` 中兼容 `Z` 并在解析异常时不清理会话
- 影响：已消除误清理，新会话会正常保留并统计

## WebSocket 连接可达但事件无响应
- 检查是否命中了兼容事件名：前端可能发送 `webrtc-offer/ice-candidate`
- 处理：AI 端已兼容映射到 `signal.offer/signal.ice`，无需前端改动

## 代理导致 502/不可达
- 现象：`curl` 访问本机服务报 502
- 处理：清理 `http_proxy/https_proxy` 或配置 `no_proxy`（见 `run-and-deploy.md`）

## 后端回调报 3001 存储不可用
- 根因：后端数据库/Prisma 配置或表结构问题
- 处理：联系后端/DBA 检查；AI 端回调格式与路径已符合契约

