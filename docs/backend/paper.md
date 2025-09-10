# 试卷管理模块

## 涉及文件
- `/backend/src/controllers/paperController.ts` - 试卷控制器

## 数据库
- **papers表**: id, teacherId, title, description, scaleType, showScores, scaleConfig, createdAt, updatedAt
- **scales表**: id, paperId, scaleName, scaleOrder (量表维度)
- **questions表**: 关联的题目数据

## 主要接口（与路由实现同步）
- `POST /api/teacher/papers` → 创建 `{ id, title, description, created_at }`
- `GET /api/teacher/papers` → 列表 `Paper[]`（含 `_count.questions/_count.exams`）
- `GET /api/teacher/papers/:paper_id` → 详情（可联查题目）
- `PUT /api/teacher/papers/:paper_id` → 更新
- `DELETE /api/teacher/papers/:paper_id` → 删除（含“有关联考试不可删”的约束）
- 题目/批量/条件/计分/音频等请见《question.md》《audio.md》

## 核心功能
- 试卷CRUD操作（标题、描述）
- 题目关联和统计计数
- 权限验证（只能操作自己的试卷）
- 删除限制检查（有关联考试不可删）
- 量表分组支持（grouped/flat类型）

## 注意事项
- 删除试卷会级联删除所有题目
- 响应格式使用snake_case字段
- 包含_count统计避免N+1查询
- 支持量表维度分组（scaleType配置）
