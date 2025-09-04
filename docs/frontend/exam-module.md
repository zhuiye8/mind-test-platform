# 考试管理模块

## 涉及文件
- `/frontend/src/pages/ExamList.tsx` - 考试列表页面
- `/frontend/src/pages/ExamDetail.tsx` - 考试详情页面
- `/frontend/src/pages/ExamCreate.tsx` - 考试创建页面
- `/frontend/src/pages/ExamArchive.tsx` - 考试归档页面
- `/frontend/src/components/ExamList/` - 看板组件模块(10个文件)
- `/frontend/src/components/ParticipantListModal.tsx` - 参与者列表
- `/frontend/src/components/ExamStatusFilter.tsx` - 状态筛选器

## API数据流
- `GET /api/teacher/exams` → `{data: Exam[], pagination}` (支持状态筛选)
- `POST /api/teacher/exams` → 考试创建结果
- `GET /api/teacher/exams/:id` → 考试详情
- `GET /api/teacher/exams/:id/results` → `{data: ExamResult[], pagination}`
- `PUT /api/teacher/exams/:id/publish` → 发布结果

## 组件架构
### ExamList看板模块(10个组件)
- `KanbanLayout/KanbanLane` - 看板布局和泳道
- `ExamCard/CompactExamCard` - 考试卡片(普通/紧凑)
- `ExamCardHeader/ExamCardActions` - 卡片头部和操作
- `ExamOperations/examOperationsCore` - 操作逻辑
- `ExamStatsCards` - 统计卡片

### 其他页面
- ExamDetail - 详情页(子组件化)
- ExamCreate - 创建/编辑表单
- ExamArchive - 归档管理

## 核心功能
- 5状态看板管理(DRAFT→PUBLISHED→SUCCESS/EXPIRED→ARCHIVED)
- 考试生命周期完整操作
- 参与者结果查看和AI报告生成
- 公开链接复制和分享
- 考试归档和恢复

## 注意事项
- 状态转换规则严格验证
- URL状态持久化和智能返回定位
- 支持批量操作和归档管理
- 响应式看板设计适配移动端