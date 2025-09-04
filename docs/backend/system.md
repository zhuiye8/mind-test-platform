# 系统基础模块

## 涉及文件
- `/backend/src/utils/database.ts` - Prisma数据库客户端
- `/backend/src/utils/cache.ts` - Redis缓存管理
- `/backend/src/utils/logger.ts` - 统一日志服务
- `/backend/src/utils/response.ts` - API响应格式化
- `/backend/src/utils/pagination.ts` - 分页查询优化
- `/backend/src/middleware/auth.ts` - JWT认证中间件
- `/backend/src/middleware/errorHandler.ts` - 全局错误处理
- `/backend/src/routes/index.ts` - 路由配置
- `/backend/src/types/index.ts` - TypeScript类型定义

## 数据库配置
- PostgreSQL + Prisma ORM
- Redis缓存（命名空间管理）
- 连接池和优化配置

## API响应格式
```typescript
// 成功响应
{success: true, data: any, message?: string}

// 错误响应  
{success: false, error: string, code?: number}

// 分页响应
{success: true, data: {data: T[], pagination: {page, limit, total, hasNext}}}
```

## 核心工具
- `sendSuccess/sendError` - 统一响应格式
- `getOptimalPagination` - 智能分页策略选择
- `getCacheWithTTL` - 缓存管理和TTL预设
- `logInfo/logError` - 结构化日志记录
- `AppError` - 自定义错误类

## 路由结构
- `/api/auth` - 认证路由
- `/api/teacher` - 教师功能路由
- `/api/public` - 公开接口路由
- `/api/audio` - 音频服务路由
- `/api/ai-service` - AI服务路由

## 注意事项
- 所有API使用统一响应格式
- 支持深度分页性能优化
- Redis命名空间避免键冲突
- 全局错误处理和日志记录