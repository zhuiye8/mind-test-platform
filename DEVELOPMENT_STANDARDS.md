# 心理测试平台开发规范 v1.0

## 🎯 核心原则

### 1. 文件长度控制
- **硬性限制**: 单文件不超过 300 行（含注释）
- **推荐长度**:
  - 组件文件: < 200 行
  - 工具函数: < 100 行  
  - 路由文件: < 50 行
  - 配置文件: < 100 行

### 2. DRY原则（Don't Repeat Yourself）
- 相同逻辑出现 **3次** 必须提取为公共函数/组件
- 优先使用组合而非继承
- 工具函数必须放在 `utils/` 目录统一管理

### 3. 单一职责原则
- 一个文件只做一件事
- 一个函数只完成一个功能
- 一个组件只负责一个界面模块

## 📝 命名规范

### 数据库层 (PostgreSQL + Prisma)
```prisma
// 表名: 复数形式，snake_case
model exam_results {
  // 字段: snake_case
  participant_id    String
  ai_session_id     String?
  created_at        DateTime
}
```

### API层 (RESTful)
```typescript
// 路由: kebab-case
POST /api/create-session
GET  /api/exam-results

// 请求/响应字段: snake_case
{
  "participant_id": "2021001",
  "exam_id": "uuid-xxx",
  "started_at": "2025-01-25T10:00:00Z"
}
```

### 前端 (React + TypeScript)
```typescript
// 文件名: PascalCase
ExamList.tsx, QuestionForm.tsx

// 组件名: PascalCase
function ExamList() {}

// 变量/函数: camelCase
const examData = {};
const handleSubmit = () => {};

// 接口定义: 与API保持一致，使用 snake_case
interface ExamResult {
  participant_id: string;
  exam_id: string;
  ai_session_id?: string;
}

// 内部使用时转换
const participantId = examResult.participant_id;
```

### 后端 (Node.js + Express + TypeScript)
```typescript
// 文件名: camelCase
examController.ts, authMiddleware.ts

// 类名: PascalCase
class ExamService {}

// 变量/函数: camelCase
const examResult = await getExamResult();

// 数据库字段映射: snake_case → camelCase
const { participant_id: participantId } = req.body;
```

### AI服务 (Python + Flask)
```python
# 文件名: snake_case
emotion_analyzer.py, session_manager.py

# 类名: PascalCase
class EmotionAnalyzer:
    pass

# 所有变量/函数: snake_case
def analyze_emotion(session_id, frame_data):
    participant_id = get_participant_id()
    return emotion_result
```

## 📁 项目结构规范

### 前端结构
```
/src/
├── pages/                    # 页面组件
│   └── ExamManagement/       # 功能模块文件夹
│       ├── index.tsx         # 入口文件 (< 100行)
│       ├── ExamList.tsx      # 列表组件 (< 200行)
│       ├── ExamForm.tsx      # 表单组件 (< 200行)
│       ├── ExamDetail.tsx    # 详情组件 (< 200行)
│       ├── components/       # 子组件
│       ├── hooks/            # 自定义Hooks
│       ├── utils/            # 工具函数
│       └── types.ts          # 类型定义
├── components/               # 公共组件
├── services/                 # API服务
├── utils/                    # 公共工具
└── types/                    # 全局类型
```

### 后端结构
```
/src/
├── controllers/              # 控制器
│   └── exam/                # 模块化控制器
│       ├── index.ts         # 路由注册 (< 50行)
│       ├── list.ts          # 列表操作 (< 150行)
│       ├── create.ts        # 创建操作 (< 150行)
│       ├── update.ts        # 更新操作 (< 150行)
│       ├── delete.ts        # 删除操作 (< 100行)
│       └── validators.ts    # 验证逻辑 (< 100行)
├── services/                # 业务逻辑
├── middleware/              # 中间件
├── utils/                   # 工具函数
└── types/                   # 类型定义
```

### AI服务结构
```
/emotion/
├── app_lan.py               # 主入口 (< 200行)
├── api/                     # API路由
│   ├── __init__.py
│   ├── session_routes.py   # 会话路由 (< 150行)
│   └── analysis_routes.py  # 分析路由 (< 150行)
├── services/                # 业务服务
│   ├── emotion_service.py  # 情绪分析 (< 200行)
│   └── session_service.py  # 会话管理 (< 200行)
├── models/                  # AI模型
├── utils/                   # 工具函数
└── config.py               # 配置文件 (< 100行)
```

## 🔄 API响应格式

### 成功响应
```json
{
  "success": true,
  "data": {
    // 实际数据
  },
  "error": null,
  "timestamp": "2025-01-25T10:00:00Z"
}
```

### 错误响应
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "参与者ID不能为空",
    "details": {}
  },
  "timestamp": "2025-01-25T10:00:00Z"
}
```

### 错误码规范
- `4xx`: 客户端错误
  - `400`: 请求参数错误
  - `401`: 未认证
  - `403`: 无权限
  - `404`: 资源不存在
  - `409`: 资源冲突（如重复提交）
- `5xx`: 服务器错误
  - `500`: 内部服务器错误
  - `502`: AI服务不可用
  - `503`: 服务暂时不可用

## ⚡ 性能规范

### 查询优化
- 列表查询必须分页，默认每页 20 条
- 使用索引优化频繁查询的字段
- 避免 N+1 查询问题

### 文件处理
- 大文件(> 10MB)必须使用流式处理
- 音视频文件使用分片上传
- 图片自动压缩优化

### 实时通信
- WebSocket连接必须实现心跳检测（30秒）
- 自动重连机制（最多重试5次）
- 消息队列防止数据丢失

### 资源管理
- 定时清理过期数据（每天凌晨2点）
- 内存使用监控和告警（阈值: 80%）
- 自动释放未使用的资源

## 🔍 代码审查清单

### 提交前必须检查
- [ ] 单文件不超过 300 行
- [ ] 无重复代码（DRY原则）
- [ ] 命名符合规范
- [ ] 有必要的注释（复杂逻辑必须注释）
- [ ] 错误处理完整
- [ ] 无console.log（生产环境）
- [ ] 无硬编码的敏感信息

### 组件/函数设计
- [ ] 单一职责
- [ ] 参数不超过 4 个
- [ ] 有 TypeScript 类型定义
- [ ] 有单元测试（核心功能）

## 📋 Git提交规范

### 提交格式
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type类型
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

### 示例
```
feat(exam): 添加考试结果导出功能

- 支持导出为Excel和PDF格式
- 添加数据筛选功能
- 优化大数据量导出性能

Closes #123
```

## 🚫 禁止事项

1. **禁止**在一个文件中写超过 300 行代码
2. **禁止**复制粘贴代码（使用函数/组件复用）
3. **禁止**在代码中硬编码密码、密钥等敏感信息
4. **禁止**直接操作DOM（React项目）
5. **禁止**使用 `any` 类型（TypeScript项目）
6. **禁止**忽略错误处理
7. **禁止**在生产环境使用 console.log

## 📚 推荐实践

### 文件拆分时机
- 当文件超过 200 行时，开始考虑拆分
- 当有明显的功能边界时，立即拆分
- 当有可复用的逻辑时，提取到独立文件

### 命名建议
- 使用描述性的变量名，避免缩写
- 布尔值使用 `is/has/can` 前缀
- 事件处理函数使用 `handle` 前缀
- 获取数据函数使用 `get/fetch` 前缀

### 注释规范
- 复杂业务逻辑必须注释
- 正则表达式必须注释
- 特殊处理或hack必须注释原因
- TODO注释必须包含处理时间和负责人

## 🔄 版本更新

- v1.0 (2025-01-25): 初始版本，建立基础规范

---

**注意**: 本规范为强制执行标准，所有代码必须遵守。code review时不符合规范的代码将被拒绝合并。
