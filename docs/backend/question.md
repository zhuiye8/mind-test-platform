# 题目管理模块

## 涉及文件
- `/backend/src/controllers/question/crud.controller.ts` - 题目CRUD操作
- `/backend/src/controllers/question/batch.controller.ts` - 批量操作控制器
- `/backend/src/controllers/question/analysis.controller.ts` - 条件逻辑分析
- `/backend/src/controllers/question/audio.controller.ts` - 音频生成控制器
- `/backend/src/controllers/question/index.ts` - 统一导出

## 数据库
- **questions表**: id, paperId, scaleId, questionOrder, title, options(JSON), questionType, displayCondition(JSON), scoreValue, isScored
- **question_audio表**: questionId, audioFile, duration, generatedAt
- **scales表**: 量表维度关联

## 主要接口（与路由实现同步）
- 题目 CRUD
  - `POST /api/teacher/papers/:paperId/questions`：创建题目
  - `GET /api/teacher/papers/:paperId/questions`：获取试卷下题目
  - `PUT /api/teacher/papers/questions/:questionId`：更新题目
  - `DELETE /api/teacher/papers/questions/:questionId`：删除题目
- 题目批量
  - `POST /api/teacher/papers/:paperId/questions/batch-create`：批量创建
  - `PUT /api/teacher/papers/questions/batch-update`：批量更新
  - `DELETE /api/teacher/papers/questions/batch-delete`：批量删除
  - `POST /api/teacher/papers/:paperId/questions/batch-import`：批量导入
  - `PUT /api/teacher/papers/:paperId/questions/batch-reorder`：批量排序
- 条件逻辑/依赖
  - `GET /api/teacher/papers/:paperId/questions/dependencies`：依赖关系图
  - `GET /api/teacher/papers/condition-templates`：条件模板
  - `POST /api/teacher/papers/:paperId/condition-preview`：预览条件逻辑
  - `PUT /api/teacher/papers/conditions/batch-set`：批量设置条件逻辑
  - `GET /api/teacher/papers/:paperId/conditions/export`：导出条件配置
  - `POST /api/teacher/papers/:paperId/conditions/import`：导入条件配置
- 计分管理
  - `POST /api/teacher/papers/:paperId/batch-scoring`：批量设置计分
  - `POST /api/teacher/papers/:paperId/batch-scoring/preview`：预览批量计分
- 音频相关（详见 audio 模块）
  - `POST /api/audio/papers/:paperId/batch-generate`，`GET /api/audio/papers/:paperId/status` 等

## 核心功能
- 题目CRUD操作（单个和批量）
- 条件逻辑设置和验证
- 题目排序和重新排序
- 音频文件批量生成（百度TTS）
- 依赖关系分析和可视化
- 导入导出功能

## 注意事项
- 支持条件逻辑displayCondition (JSON格式)
- options字段存储选项内容 (JSON格式)
  - **重要**：选项键名格式为单个大写字母(A/B/C/D/E)，已在fieldConverter中特殊处理，不会转换为snake_case
  - 选项值支持字符串格式`"A": "选项内容"`和对象格式`"A": {"text": "选项内容", "score": 1}`
- 模块化拆分避免单文件过大(原2305行)
- 音频生成集成百度TTS服务
- 字段转换：API响应经过fieldConverter处理，camelCase转换为snake_case
- 批量计分响应字段：`updated_questions`和`total_questions`（经过snake_case转换）

## 字段映射（数据库）
- questions：`id, paperId, scaleId, questionOrder, title, options(JSON), questionType, displayCondition(JSON), scoreValue, isScored`
- 依赖关系图/条件逻辑操作以 `paperId` 维度组织；排序/批处理均基于 `questionOrder`
