# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a psychological testing system for campus use (心理测试平台) that implements a questionnaire/survey system with conditional logic for psychological assessments. The system has two main user types:

1. **Teachers** - Create questionnaires, manage exams, and view results (authenticated)
2. **Students** - Take psychological tests via public links (no authentication required)

**Current Version**: V1.0.0 - 心理测试平台正式版本。项目完成度100%，核心功能完全实现。前端采用现代化架构：React 19 + Next.js 15 + TypeScript + Ant Design，后端基于Node.js + Express.js + Prisma ORM + PostgreSQL + Redis。系统具备完整的考试生命周期管理、复杂条件逻辑、批量操作、缓存优化等专业功能，支持Docker一键部署，达到生产级别标准。

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

### 前端架构特性
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

## 条件逻辑实现

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

## 重要系统约束

### 系统约束
- This is a psychological testing system, so there are no "correct answers" - questions measure psychological dimensions  
- System is designed for campus use, emphasizing simplicity and ease of use
- Student progress must be preserved using localStorage with auto-save functionality
- Exam content is immutable once published (via snapshot mechanism)
- Prevent duplicate submissions using database constraints  
- Complex conditional logic with circular dependency detection
- Redis caching with multi-tier TTL strategy for performance
- Questions table has new fields: `question_type`, `display_condition` (replaces unused `correct_answer`)

### 代码规范
- **TypeScript严格模式**: 所有组件和函数都有完整类型定义
- **错误处理**: 使用统一的useErrorHandler，不使用try-catch直接处理用户错误
- **状态管理**: useCallback优化所有异步函数，修复useEffect依赖项警告
- **路由导航**: 使用useRouter Hook，禁止直接使用window.location
- **本地存储**: 使用UnifiedStorage系统，支持加密、TTL和事件监听
- **UI组件**: 统一使用shadcn/ui组件，遵循cream-white色彩系统
- **Loading状态**: 使用全局Loading管理器和PageSkeleton组件
- **Toast通知**: 使用toast系统替换alert()和console.log()用户提示

## 版本信息

**当前版本**: V1.0.0 正式发布版 - 100%功能完成

### 已实现的核心功能 ✅
- **用户认证**: JWT认证系统，教师端登录管理
- **试卷管理**: 完整CRUD操作，支持复杂条件逻辑
- **题目管理**: 单选、多选、文本题型，批量操作
- **考试管理**: 5状态生命周期(DRAFT/PUBLISHED/SUCCESS/EXPIRED/ARCHIVED)
- **学生答题**: 公共链接答题，防重复提交，进度保存
- **数据分析**: 统计图表，结果导出，参与者管理
- **性能优化**: Redis缓存，智能分页，响应式设计
- **部署支持**: PostgreSQL + Redis + Docker一键部署

### 技术亮点 🚀
- **前端**: React 19 + Next.js 15 + TypeScript + Ant Design
- **后端**: Node.js + Express.js + Prisma ORM + PostgreSQL
- **缓存**: Redis多层缓存策略 (SHORT/MEDIUM/LONG/VERY_LONG TTL)
- **数据库**: PostgreSQL 15 + 完整索引优化
- **安全**: JWT认证 + bcrypt加密 + IP跟踪

### 后续版本计划 📋
- **V1.1.0**: 安全与性能优化(接口限流、HTTPS、监控)
- **V1.2.0**: 移动端优化(PWA支持、离线功能)
- **V2.0.0**: 智能分析版(AI辅助、高级统计图表)
- **V2.5.0**: 专业量表版(标准心理量表、企业级功能)

**系统状态**: 完全可用于生产环境，所有核心功能已实现并经过充分测试！

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

## 前端架构 (V1.0)

### 核心技术栈
- **React 19 + Next.js 15**: 现代化前端框架
- **TypeScript**: 严格类型检查，提高代码质量
- **Ant Design 5.26.7**: UI组件库，包含React 19兼容补丁
- **Axios**: HTTP客户端，统一API调用
- **React Router DOM**: 前端路由管理

### 关键文件结构
```
frontend/src/
├── components/              # 共用组件
│   ├── ExamStatusFilter.tsx # 考试状态筛选
│   ├── Layout.tsx          # 页面布局
│   ├── QuestionModal.tsx   # 题目编辑弹窗
│   └── StudentListModal.tsx # 学生列表弹窗
├── pages/                  # 页面组件
│   ├── Login.tsx          # 登录页面
│   ├── Dashboard.tsx      # 仪表盘
│   ├── PaperList.tsx      # 试卷列表
│   ├── PaperDetail.tsx    # 试卷详情
│   ├── ExamList.tsx       # 考试列表
│   ├── ExamCreate.tsx     # 创建考试
│   ├── ExamArchive.tsx    # 考试回收站
│   ├── Analytics.tsx      # 数据分析
│   └── StudentExam.tsx    # 学生答题
├── services/              # 服务层
│   └── api.ts            # API接口封装
├── types/                 # TypeScript类型
│   └── index.ts          # 全局类型定义
├── constants/             # 常量定义
│   └── examStatus.ts     # 考试状态枚举
└── utils/                 # 工具函数
    └── auth.ts           # 认证工具
```

### 设计特色
- **响应式设计**: 支持桌面和移动端
- **状态同步**: 前后端状态枚举完全一致
- **用户体验**: Loading状态、错误处理、操作反馈
- **类型安全**: 全面TypeScript类型定义

## Examples Directory

The `examples/` directory contains UI prototypes and components that can be referenced for styling and layout patterns. These are not part of the main application but demonstrate the desired visual design approach using shadcn/ui components.