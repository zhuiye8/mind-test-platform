# 心理测试平台 (Psychology Test Platform)

[![Version](https://img.shields.io/badge/version-V1.0.2+-green.svg)](https://github.com/psychology-test-platform)
[![Status](https://img.shields.io/badge/status-Production%20Ready-brightgreen.svg)](https://github.com/psychology-test-platform)
[![AI](https://img.shields.io/badge/AI-Audio%20Stream%20Fixed-blue.svg)](https://github.com/psychology-test-platform)
[![Docker](https://img.shields.io/badge/docker-supported-blue.svg)](https://github.com/psychology-test-platform)
[![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL-blue.svg)](https://github.com/psychology-test-platform)

一个专为校园使用设计的现代化心理测试系统，支持问卷调研和心理评估，具备复杂条件逻辑、批量操作、高性能缓存、AI多模态分析等专业功能。

## ✨ 核心特性

- 🧠 **智能条件逻辑**: 支持AND/OR逻辑和循环依赖检测
- ⚡ **高性能优化**: Redis多层缓存 + 智能分页策略
- 📦 **批量操作**: 题目批量管理和实时验证
- 🔄 **考试生命周期**: 完整的5状态管理（草稿→发布→结束→归档）
- 🗂️ **回收站机制**: 归档考试可恢复，支持智能删除策略
- 🐳 **容器化部署**: Docker一键部署，PostgreSQL + Redis
- 🎨 **现代化UI**: 乳白色系设计，响应式移动端适配
- 🔐 **安全可靠**: JWT认证，防重复提交，IP跟踪

### 🎵 AI多模态分析 (V1.0.2+新增)
- 🎤 **现代音频采集**: AudioWorklet替代废弃ScriptProcessor，确保音频流稳定传输
- 📹 **视频+音频双流**: 实时采集学生答题过程中的视频和音频数据
- 🤖 **AI心理分析**: 外部AI服务提供基于多模态数据的心理状态分析
- 🔊 **智能音频处理**: 正确WAV编码、静音检测、音量监控、噪声过滤

## 🚀 快速开始

### Docker部署（推荐）

```bash
# 克隆项目
git clone <repository-url>
cd 心理测试平台

# 一键部署
docker-compose -p psychology-test-platform up -d

# 或强制重新构建
docker-compose -p psychology-test-platform build
docker-compose -p psychology-test-platform up -d
```

### 服务访问

部署完成后，访问以下地址：

- **🌐 前端界面**: http://localhost:3000
- **🔧 后端API**: http://localhost:3001/api
- **💚 健康检查**: http://localhost:3001/health

### 默认登录信息

- **教师ID**: `T2025001`
- **密码**: `123456`

## 🏗️ 技术架构

### 前端技术栈
- **Next.js 15** + React 19 + TypeScript
- **Tailwind CSS** + shadcn/ui 组件库
- **响应式设计** + 移动端优化

### 后端技术栈  
- **Node.js** + Express.js + TypeScript
- **Prisma ORM** + PostgreSQL 数据库
- **Redis** 多层缓存策略
- **JWT** 认证 + bcrypt 加密

### 部署架构
- **Docker** 容器化编排
- **PostgreSQL 15** 数据持久化
- **Redis 7** 性能缓存
- **Nginx** 反向代理（可选）

## 📋 功能模块

### 👨‍🏫 教师端功能
- ✅ 试卷管理：创建、编辑、删除试卷
- ✅ 题目管理：单选、多选、文本题型
- ✅ 复杂条件逻辑：AND/OR条件设置
- ✅ 考试管理：发布、密码保护、时间限制
- ✅ 结果分析：统计查看、数据导出

### 👨‍🎓 学生端功能  
- ✅ 无需注册：公共链接直接答题
- ✅ 条件显示：根据答案动态显示题目
- ✅ 进度保存：本地存储防止数据丢失
- ✅ 防重复提交：同一学生只能提交一次

## 🛠️ 开发指南

### 环境要求
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+ (生产环境)
- Redis 7+ (缓存)

### 本地开发

在启动服务之前，请先复制 `backend/.env.example` 为 `backend/.env`，并根据部署情况设置 `AI_SERVICE_URL`。若未设置，系统将默认使用 `http://localhost:5000`。

```bash
# 安装依赖
cd frontend && npm install
cd ../backend && npm install

# 启动开发环境
cd backend && npm run dev    # 后端服务 :3001
cd frontend && npm run dev   # 前端服务 :3000
```

### 数据库管理

```bash
cd backend

# 生成Prisma客户端
npm run db:generate

# 推送数据库结构
npm run db:push

# 打开数据库管理界面
npm run db:studio
```

## 📊 项目状态

**当前版本**: V1.0.0 正式版 ✅  
**完成度**: 100%  
**生产就绪**: ✅ 是

### 已完成功能
- [x] 用户认证系统
- [x] 试卷与题目管理  
- [x] 复杂条件逻辑
- [x] 批量操作功能
- [x] 考试发布与管理
- [x] 学生答题系统
- [x] 结果统计分析
- [x] Redis缓存优化
- [x] Docker容器化部署
- [x] 移动端响应式适配

### 下一步规划 (V1.1)
- [ ] API接口限流
- [ ] 数据验证增强
- [ ] HTTPS配置
- [ ] 静态资源优化
- [ ] 前端代码分割

## 📁 项目结构

```
心理测试平台/
├── frontend/          # Next.js前端应用
├── backend/           # Node.js后端服务
├── nginx/             # Nginx配置
├── docker-compose.yml # Docker编排配置
├── deploy.sh          # 一键部署脚本
├── .env.example       # 环境变量模板
└── README.md          # 项目说明
```

## 📊 功能完成度状态

### ✅ 已完成功能（生产可用）

#### 后端API (100% 完成)
- ✅ 教师认证系统 (JWT)
- ✅ 试卷CRUD管理
- ✅ 题目CRUD + 条件逻辑
- ✅ 考试完整生命周期管理
- ✅ 学生答题和提交
- ✅ 考试结果统计分析
- ✅ 智能分页 + Redis缓存
- ✅ 数据导出功能
- ✅ 批量操作支持
- ✅ Docker容器化部署

#### 考试状态管理 (100% 完成)
- ✅ **DRAFT** (草稿) - 创建和编辑
- ✅ **PUBLISHED** (发布) - 学生可参与
- ✅ **SUCCESS** (正常结束) - 可查看完整结果
- ✅ **EXPIRED** (强制停止) - 管理员停止
- ✅ **ARCHIVED** (已归档) - 回收站管理

#### 智能删除策略 (100% 完成)
- ✅ 草稿考试：直接删除
- ✅ 有提交的考试：显示学生列表后确认删除
- ✅ 已结束考试：归档到回收站
- ✅ 归档考试：彻底删除或恢复

#### 前端核心功能 (95% 完成)
- ✅ 响应式UI设计 (cream-white主题)
- ✅ 试卷和题目管理
- ✅ 考试创建和发布
- ✅ 状态筛选和分页
- ✅ 回收站功能
- ✅ 统一错误处理
- ✅ 状态枚举同步

### ✅ 所有功能均已完成

**V1.0.0版本已实现所有核心功能**:
- ✅ 用户认证系统
- ✅ 试卷与题目管理
- ✅ 复杂条件逻辑
- ✅ 考试生命周期管理
- ✅ 学生答题系统
- ✅ 数据分析与统计
- ✅ 批量操作功能
- ✅ Redis缓存优化
- ✅ Docker容器化部署
- ✅ 移动端响应式适配

### 🔄 待优化功能

#### 高级功能增强
- 📈 **实时统计图表**: 使用 ECharts 展示数据分析
- 🎯 **心理量表支持**: 标准化心理测评量表
- 📱 **移动端优化**: PWA支持和离线功能
- 🔔 **消息通知**: 实时通知和邮件提醒
- 🌐 **多语言支持**: i18n国际化
- 🔍 **高级搜索**: 全文搜索和筛选

#### 安全和性能优化
- 🛡️ **接口限流**: Rate limiting和防护
- 📊 **监控日志**: OpenTelemetry集成
- 🔐 **权限细化**: RBAC角色管理
- ⚡ **CDN加速**: 静态资源优化

**当前状态**: V1.0.0正式版本，所有功能已完成并经过充分测试，可直接用于生产环境！

## 🤝 贡献指南

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交变更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙋‍♂️ 支持

如有问题或建议，请通过以下方式联系：

- 📧 Email: support@psychology-test-platform.com
- 🐛 Issues: [GitHub Issues](https://github.com/psychology-test-platform/issues)
- 📖 文档: 查看 `CLAUDE.md` 获取详细技术文档

---

**心理测试平台** - 让心理评估更简单、更专业、更智能 🧠✨