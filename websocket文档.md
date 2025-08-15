# 学生端API接口文档

## 概述

本文档为学生端提供数据采集系统的API接口说明。系统采用三步工作流程：

1. **创建检测会话** → 2. **停止检测** → 3. **生成心理分析报告**

## 服务器信息

**服务器地址**: `http://192.168.9.84:5000`  
**WebSocket地址**: `ws://192.168.9.84:5000/socket.io/`


> **注意**：请确保你的设备与AI分析端在同一局域网内。

## 接口列表

### 1. 创建检测会话

**接口地址**: `POST http://192.168.9.84:5000/api/create_session`

**功能**: 开始数据采集，创建会话并返回session_id

**请求参数**:
```json
{
  "student_id": "学生ID (可选)",
  "exam_id": "考试ID (可选)"
}
```

**响应示例**:
```json
{
  "success": true,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "检测会话创建成功"
}
```

### 2. 停止检测

**接口地址**: `POST http://192.168.9.84:5000/api/end_session`

**功能**: 停止数据采集

**请求参数**:
```json
{
  "session_id": "步骤1返回的session_id"
}
```

**响应示例**:
```json
{
  "success": true,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "数据采集已停止，请发送题目数据以生成分析报告",
}
```

### 3. 生成心理分析报告

**接口地址**: `POST http://192.168.9.84:5000/api/analyze_questions`

**功能**: 提交题目数据，获取AI心理分析报告

**前置条件**: 必须先调用停止检测接口

**请求参数**:
```json
{
  "session_id": "会话ID",
  "questions_data": [
    {
      "question_id": "题目ID",
      "content": "题目内容",
      "start_time": "2025-08-15T10:00:00.000000",
      "end_time": "2025-08-15T10:02:30.000000"
    }
  ]
}
```

**响应示例**:
```json
{
  "success": true,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "report": "详细的心理分析报告内容...",
  "report_file": "report_550e8400.txt",
  "message": "心理分析报告生成成功"
}
```

## 调用流程示例

```javascript
// 步骤1: 创建检测会话
const response1 = await fetch('http://192.168.9.84:5000/api/create_session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    student_id: "STU001",
    exam_id: "EXAM2025001"
  })
});
const sessionData = await response1.json();
const sessionId = sessionData.session_id;

// ... 进行考试，学生端发送视音频数据，系统在后台进行分析 ...

// 步骤2: 停止检测
await fetch('http://192.168.9.84:5000/api/end_session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: sessionId })
});

// 步骤3: 发送题目数据，获取分析报告
const response3 = await fetch('http://192.168.9.84:5000/api/analyze_questions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    session_id: sessionId,
    questions_data: [
      {
        question_id: "Q1",
        content: "描述你的学习状态",
        start_time: "2025-08-15T10:00:00.000000",
        end_time: "2025-08-15T10:02:30.000000"
      }
    ]
  })
});
const reportData = await response3.json();
console.log(reportData.report); // 心理分析报告
```

## 数据格式说明

### 数据格式要求
- **时间格式**: `YYYY-MM-DDTHH:MM:SS.ffffff` (ISO 8601)
- **question_id**: 题目唯一标识
- **content**: 题目内容文本
- **start_time/end_time**: 答题开始/结束时间
- **session_id**: 会话ID（由第一步获取）

## 错误处理

所有接口错误时返回：
```json
{
  "success": false,
  "message": "具体错误信息"
}
```

**常见错误**:
- `会话不存在`: session_id无效
- `请先调用停止检测接口`: 状态错误
- `数据格式错误`: 参数格式不正确

## 注意事项

1. **必须按顺序调用**: 创建会话 → 停止检测 → 生成报告
2. **保存session_id**: 创建会话后的session_id需要在后续接口中使用
3. **数据处理**: 系统会根据题目时间匹配对应的分析数据（5秒容差）
4. **一次性流程**: 每个session_id只能生成一次报告

## WebSocket实时数据传输

学生端需要通过WebSocket发送视音频数据供系统分析，但不会接收到任何分析结果。

### 连接WebSocket
```javascript
const socket = io('http://192.168.9.84:5000');

// 连接成功
socket.on('connect', () => {
  console.log('WebSocket连接成功');
});
```

### 发送视频帧
```javascript
// 发送视频帧数据
socket.emit('video_frame', {
  session_id: 'your-session-id',
  frame_data: 'data:image/jpeg;base64,/9j/4AAQ...'
});
```

### 发送音频数据
```javascript
// 发送音频数据
socket.emit('audio_data', {
  session_id: 'your-session-id',
  audio_data: 'data:audio/wav;base64,UklGR...'
});
```


## 连接测试

在浏览器中访问以下地址测试连接：
```
http://192.168.9.84:5000/api/health
```

## 常见问题

1. **无法连接服务器**: 检查是否在同一局域网内
2. **接口调用失败**: 确认IP地址和端口正确
3. **WebSocket连接断开**: 检查网络稳定性