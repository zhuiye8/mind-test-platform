# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a psychological testing system for campus use (心理测试平台) that implements a questionnaire/survey system with conditional logic for psychological assessments. The system has two main user types:

1. **Teachers** - Create questionnaires, manage exams, and view results (authenticated)
2. **Students** - Take psychological tests via public links (no authentication required)

**Current Phase**: V1.1.1状态同步版 - 前后端状态枚举完全同步。项目完成度95%（核心功能100%），前端完成现代化升级：统一错误处理、安全认证、路由系统、Loading管理、本地存储系统、状态枚举统一化。UI全面升级到shadcn/ui组件库，采用cream-white色彩系统。后端功能完整，包括考试生命周期管理、批量操作、复杂条件逻辑、Redis缓存、Docker部署。系统已达到生产级别标准，仅需修复5个前端API调用即可100%完成。

## Architecture

**Frontend**: Next.js 15 with React 19, TypeScript, Tailwind CSS, and shadcn/ui components
**Backend**: Node.js + Express.js + Prisma ORM + TypeScript + PostgreSQL (完整实现)
**Database**: PostgreSQL with Docker deployment (生产级数据库)
**Authentication**: JWT tokens for teacher endpoints only

## Key System Features

### 核心功能
- **Question Snapshot System**: When exams are published, question IDs are "frozen" in a snapshot to prevent modifications affecting live exams
- **Complex Conditional Logic**: Questions support AND/OR logic with circular dependency detection
- **Exam Lifecycle Management**: Complete 5-state lifecycle (DRAFT → PUBLISHED → SUCCESS/EXPIRED → ARCHIVED) with smart deletion and archive system
- **Status Enum Synchronization**: Frontend and backend use identical uppercase status values (DRAFT, PUBLISHED, EXPIRED, SUCCESS, ARCHIVED) with type safety
- **Batch Operations**: Bulk question management with progress indicators and validation
- **Redis Caching**: Multi-tier caching strategy (SHORT/MEDIUM/LONG/VERY_LONG TTL)
- **Smart Pagination**: Automatic cursor/offset strategy selection based on data volume
- **Progress Persistence**: Student answers are auto-saved to localStorage to prevent data loss
- **Duplicate Prevention**: Unique constraints prevent students from submitting the same exam multiple times
- **IP Tracking**: All submissions include IP addresses for audit purposes

### 前端架构 (V1.1 专业化升级)
- **统一错误处理系统**: ErrorBoundary + useErrorHandler + 错误分类和上报
- **安全认证管理**: SecureAuthManager + 登录限制 + 自动刷新token
- **统一路由系统**: useRouter Hook 替换 window.location 实现客户端路由
- **Loading状态管理**: 全局Loading管理器 + Skeleton组件 + 进度指示器
- **本地存储系统**: UnifiedStorage + 加密/压缩 + TTL + 事件监听
- **Toast通知系统**: 统一的用户反馈机制，替换原生alert
- **状态枚举统一化**: 前后端状态值完全同步，TypeScript类型安全保障
- **现代UI/UX**: Cream-white色彩系统 + shadcn/ui组件库 + 微交互动画
- **响应式设计**: Mobile-first设计 + 触控友好界面
- **无障碍支持**: 屏幕阅读器支持 + 键盘导航

### 部署和运维
- **Docker Deployment**: Complete containerization with PostgreSQL and Redis
- **健康监控**: 系统健康检查端点和日志记录
- **开发工具**: TypeScript严格模式 + ESLint + 构建优化

## Development Commands

### Frontend (Next.js)
```bash
cd frontend
npm run dev          # Start development server with Turbopack
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Backend (已实现)
```bash
cd backend
npm run dev          # Start development server
npm run build        # Build TypeScript
npm run start        # Start production server
npm run db:generate  # Generate Prisma client
npm run db:push      # Push database schema
npm run db:studio    # Open Prisma Studio
```

### Docker 部署（完整版）
```bash
# 一键部署（推荐）
./deploy.sh                    # 标准部署
./deploy.sh --build           # 强制重新构建镜像
./deploy.sh --clean --build   # 清理旧数据并重新构建
./deploy.sh --logs            # 部署后查看日志

# 手动部署
docker-compose -p psychology-test-platform build
docker-compose -p psychology-test-platform up -d

# 服务管理
docker-compose -p psychology-test-platform ps       # 查看状态
docker-compose -p psychology-test-platform logs -f  # 查看日志
docker-compose -p psychology-test-platform down     # 停止服务
docker-compose -p psychology-test-platform restart  # 重启服务

# 服务访问地址
# 前端: http://localhost:3000
# 后端API: http://localhost:3001/api  
# 健康检查: http://localhost:3001/health
# PostgreSQL: localhost:5432
# Redis: localhost:6379
```

## Database Schema

Core entities and relationships:
- `teachers` → `papers` (1:many) - Teachers create reusable questionnaire templates
- `papers` → `questions` (1:many) - Papers contain questions with conditional logic
- `papers` → `exams` (1:many) - Published exams based on paper templates
- `exams` → `exam_results` (1:many) - Student submissions

**Critical Field**: `exams.question_ids_snapshot` (JSONB) - Contains frozen list of question IDs when exam is published

## API Structure

Base URL: `/api`

**Authentication Required**:
- `/api/teacher/*` - All teacher endpoints require JWT token
- `/api/auth/login` - Teacher login

**Public Endpoints**:
- `/api/public/exams/:uuid` - Get exam questions
- `/api/public/exams/:uuid/verify` - Verify exam password
- `/api/public/exams/:uuid/submit` - Submit answers

**Response Format**:
```json
{
  "success": true|false,
  "data": {},
  "error": null|string
}
```

## Conditional Logic Implementation (V1.1专业版)

Questions support complex conditional display with AND/OR logic and circular dependency detection:

```typescript
interface SimpleCondition {
  question_id: string;
  selected_option: string;
}

interface ComplexCondition {
  operator: 'AND' | 'OR';
  conditions: SimpleCondition[];
}

type DisplayCondition = SimpleCondition | ComplexCondition;

interface Question {
  id: string;
  question_order: number;
  title: string;
  options: Record<string, string>;
  question_type: 'single_choice' | 'multiple_choice' | 'text';
  display_condition: DisplayCondition | null;
}

// Enhanced logic with complex conditions
function shouldShowQuestion(
  question: Question, 
  answers: Record<string, string>
): boolean {
  return evaluateDisplayCondition(question.display_condition, answers);
}

// Circular dependency detection using DFS
function detectCircularDependency(
  targetQuestionId: string, 
  condition: DisplayCondition | null, 
  questions: Question[]
): string[] {
  // DFS implementation for dependency detection
}
```

Features include real-time validation, batch operations, and dependency visualization.

## Important Constraints (V1.1专业版)

### 系统约束
- This is a psychological testing system, so there are no "correct answers" - questions measure psychological dimensions  
- System is designed for campus use, emphasizing simplicity and ease of use
- Student progress must be preserved using localStorage with auto-save functionality
- Exam content is immutable once published (via snapshot mechanism)
- Prevent duplicate submissions using database constraints  
- Complex conditional logic with circular dependency detection
- Redis caching with multi-tier TTL strategy for performance
- Questions table has new fields: `question_type`, `display_condition` (replaces unused `correct_answer`)

### 代码规范 (V1.1前端升级)
- **TypeScript严格模式**: 所有组件和函数都有完整类型定义
- **错误处理**: 使用统一的useErrorHandler，不使用try-catch直接处理用户错误
- **状态管理**: useCallback优化所有异步函数，修复useEffect依赖项警告
- **路由导航**: 使用useRouter Hook，禁止直接使用window.location
- **本地存储**: 使用UnifiedStorage系统，支持加密、TTL和事件监听
- **UI组件**: 统一使用shadcn/ui组件，遵循cream-white色彩系统
- **Loading状态**: 使用全局Loading管理器和PageSkeleton组件
- **Toast通知**: 使用toast系统替换alert()和console.log()用户提示

## Development Approach

**Current Status**: V1.1.1 状态同步版 - 前后端枚举完全统一 (95% 完成度，核心功能100%)
- Sprint 1: Basic architecture setup ✅ 完成
- Sprint 2: Paper/Question CRUD with conditional logic ✅ 完成
- Sprint 3: Exam publishing and student exam-taking ✅ 完成
- Sprint 4: Results viewing and basic statistics ✅ 完成
- **部署阶段**: Docker 容器化和文档 ✅ 完成
- **UI/UX升级**: 乳白色系设计和微交互 ✅ 完成
- **V1.1第1周**: 批量操作、复杂条件逻辑、循环依赖检测 ✅ 完成
- **V1.1第2周**: Redis缓存、智能分页、系统配置统一化 ✅ 完成
- **V1.1第3周**: 前端架构现代化重构 ✅ 完成
  - 统一错误处理系统 (ErrorBoundary + useErrorHandler)
  - 安全认证管理 (SecureAuthManager + 登录限制)
  - 统一路由系统 (useRouter Hook + 客户端路由)
  - Loading状态管理 (全局管理器 + Skeleton组件)
  - 本地存储系统 (UnifiedStorage + 加密/TTL/事件)
  - shadcn/ui组件库全面升级
  - useEffect依赖项优化和TypeScript严格模式
- **V1.1第4周**: 状态枚举同步和生命周期完善 ✅ 完成
  - 前后端状态枚举统一化 (DRAFT, PUBLISHED, EXPIRED, SUCCESS, ARCHIVED)
  - 考试生命周期管理完整实现
  - 智能删除策略和回收站功能
  - TypeScript类型安全保障
  - 🟡 仅5个前端API调用需要连接真实后端

**后续迭代计划**:
- V1.1.1: 状态同步版 ✅ 已完成 (当前版本)
  - 前后端状态枚举完全统一，考试生命周期管理完善
- V1.1.2: API连接修复版（5分钟工作量）- 即将完成
  - 修复前端5个临时API调用，连接真实后端接口
- V1.2: 安全与优化版（接口限流、数据验证、HTTPS）- 1-2周
- V2.0: 智能化版本（AI辅助、高级分析）- 4-6周  
- V2.5: 专业量表版本（标准心理量表、企业级功能）- 7-12周
- V3.0: 平台化版本（生态系统、科研支持）- 13-20周

**重要说明**: 系统核心功能100%完成，生产环境可用。仅需修复5个前端API调用即可达到完全100%状态！

## UI Design System

### Color Scheme (Cream-White Theme)
```css
/* Main Colors */
--bg-cream: #FDFBF7;        /* Main background */
--bg-cream-light: #FFFEF9;   /* Light background */
--bg-cream-dark: #FAF6F0;    /* Dark background */

/* Primary Colors */
--primary-blue: #4B9BFF;     /* Trust blue */
--primary-teal: #20B2AA;     /* Calm teal */
--accent-coral: #FF6B6B;     /* Warm coral */

/* Text Colors */
--text-primary: #2D3748;     /* Primary text */
--text-secondary: #718096;   /* Secondary text */
```

### Animation System
- **Page Entry**: Slide-in animations for page transitions
- **Card Hover**: Subtle lift effects with shadow changes
- **Button Interactions**: Scale feedback and color transitions
- **Input Focus**: Smooth border and background transitions
- **Loading States**: Skeleton animations and pulse effects

### Component Standards
- **Cards**: Soft shadows with cream backgrounds
- **Buttons**: Rounded corners with hover lift effects
- **Inputs**: Focus states with color transitions
- **Navigation**: Smooth animations with active states

## 前端架构模式 (V1.1)

### 关键文件结构
```
frontend/src/
├── components/
│   ├── ErrorBoundary.tsx       # React错误边界组件
│   └── loading/               # 统一Loading组件
│       ├── LoadingSpinner.tsx
│       ├── LoadingContainer.tsx
│       └── PageSkeleton.tsx
├── hooks/
│   ├── useErrorHandler.ts     # 统一错误处理Hook
│   ├── useRouter.ts          # 增强路由Hook
│   └── useLoading.ts         # Loading状态管理Hook
├── lib/
│   ├── secureAuth.ts         # 安全认证管理
│   ├── storage.ts            # 统一localStorage管理
│   └── toast.ts             # Toast通知系统
└── app/                      # Next.js 15 App Router页面
```

### 架构原则
- **统一性**: 所有UI组件使用shadcn/ui，保持设计一致性
- **类型安全**: 全面的TypeScript类型定义和严格模式
- **错误处理**: 统一的错误分类、处理和用户反馈机制
- **性能优化**: useCallback优化、智能Loading状态、本地存储缓存
- **安全性**: 安全的认证管理、数据加密存储、输入验证

### 核心Hooks和工具
1. **useErrorHandler**: 提供错误分类、Toast显示、日志记录
2. **useRouter**: Next.js路由增强，支持预加载和导航控制
3. **useLoading**: 全局Loading状态管理，支持进度显示
4. **SecureAuthManager**: 登录限制、Token管理、自动刷新
5. **UnifiedStorage**: 加密存储、TTL管理、事件驱动架构

## Examples Directory

The `examples/` directory contains UI prototypes and components that can be referenced for styling and layout patterns. These are not part of the main application but demonstrate the desired visual design approach using shadcn/ui components.