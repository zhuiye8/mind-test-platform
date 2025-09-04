# 试卷管理模块

## 涉及文件
- `/frontend/src/pages/PaperList.tsx` - 试卷列表页面
- `/frontend/src/pages/PaperDetail.tsx` - 试卷详情页面(导出层)
- `/frontend/src/components/PaperDetail/` - 重构后组件模块(6个文件)
- `/frontend/src/components/QuestionModal.tsx` - 题目编辑模态框

## API数据流
- `GET /api/teacher/papers` → `Paper[]` (包含question_count, exam_count)
- `POST /api/teacher/papers` → 试卷创建结果
- `GET /api/teacher/papers/:id` → 试卷详情+题目列表
- `POST /api/teacher/papers/:paperId/questions` → 题目创建

## 组件架构
### PaperList页面
- 试卷表格展示和搜索筛选
- 创建/编辑模态框
- 统计卡片网格

### PaperDetail重构模块
- `index.tsx` - 主组件(~200行，原733行拆分)
- `PaperHeader.tsx` - 头部组件
- `PaperStats.tsx` - 统计组件  
- `QuestionList.tsx` - 题目列表
- `usePaperDetail.ts` - 业务逻辑Hook
- `types.ts` - 类型定义

## 核心功能
- 试卷CRUD操作和列表管理
- 题目列表管理(排序、筛选、批量操作)
- 题目创建/编辑(支持条件逻辑)
- 音频文件批量生成
- 试卷删除限制检查

## 注意事项
- PaperDetail已模块化重构避免单文件过大
- 删除限制：有关联考试的试卷不可删
- 支持条件逻辑题目显示
- 响应式设计和现代动画效果