# 教师端 API 快速索引（简版）

便于维护与排错的接口总览。按模块分组，列出路径、动作与核心字段。详细入参/出参见对应模块文档。

## 认证 auth
- POST `/api/auth/login` → 登录（返回 token, teacher 信息）
- GET `/api/auth/verify` → 校验登录态

## 试卷 papers
- GET `/api/teacher/papers` → 列表（含 `_count.questions/_count.exams`）
- GET `/api/teacher/papers/:paper_id` → 详情
- POST `/api/teacher/papers` → 创建
- PUT `/api/teacher/papers/:paper_id` → 更新
- DELETE `/api/teacher/papers/:paper_id` → 删除（有关联考试不可删）

题目（隶属 papers）
- POST `/api/teacher/papers/:paper_id/questions` → 创建题目
- GET `/api/teacher/papers/:paper_id/questions` → 题目列表
- PUT `/api/teacher/papers/questions/:question_id` → 更新题目
- DELETE `/api/teacher/papers/questions/:question_id` → 删除题目
- POST `/api/teacher/papers/:paper_id/questions/batch-create` → 批量创建
- PUT `/api/teacher/papers/questions/batch-update` → 批量更新
- DELETE `/api/teacher/papers/questions/batch-delete` → 批量删除
- POST `/api/teacher/papers/:paper_id/questions/batch-import` → 批量导入
- PUT `/api/teacher/papers/:paper_id/questions/batch-reorder` → 批量排序

条件逻辑/依赖/计分
- GET `/api/teacher/papers/:paper_id/questions/dependencies` → 依赖关系图
- GET `/api/teacher/papers/condition-templates` → 条件模板
- POST `/api/teacher/papers/:paper_id/condition-preview` → 条件预览
- PUT `/api/teacher/papers/conditions/batch-set` → 批量设置条件
- GET `/api/teacher/papers/:paper_id/conditions/export` → 导出配置
- POST `/api/teacher/papers/:paper_id/conditions/import` → 导入配置
- POST `/api/teacher/papers/:paper_id/batch-scoring` → 批量计分
- POST `/api/teacher/papers/:paper_id/batch-scoring/preview` → 计分预览

## 考试 exams
- POST `/api/teacher/exams` → 创建
- GET `/api/teacher/exams` → 列表（支持 `status` 筛选）
- GET `/api/teacher/exams/archived` → 归档列表
- GET `/api/teacher/exams/:exam_id` → 详情
- PUT `/api/teacher/exams/:exam_id` → 更新
- DELETE `/api/teacher/exams/:exam_id` → 删除
- POST `/api/teacher/exams/:exam_id/toggle-publish` → 发布/下线（公开链接）
- PUT `/api/teacher/exams/:exam_id/finish` → 结束考试
- PUT `/api/teacher/exams/:exam_id/archive` → 归档
- PUT `/api/teacher/exams/:exam_id/restore` → 恢复
- GET `/api/teacher/exams/:exam_id/submissions` → 提交列表
- GET `/api/teacher/exams/:exam_id/questions` → 考试题目详情
- GET `/api/teacher/exams/:exam_id/results` → 结果列表
- GET `/api/teacher/exams/:exam_id/results/:result_id` → 结果详情
- GET `/api/teacher/exams/:exam_id/results/export` → 导出
- POST `/api/teacher/exams/batch-export` → 批量导出

## 分析 analytics
- GET `/api/teacher/analytics` → 综合分析（timeRange: 7d/30d/90d/1y）
- GET `/api/teacher/analytics/dashboard` → 仪表盘统计

## 教师·AI 分析 teacher/ai
- POST `/api/teacher/ai/exam-results/:exam_result_id/generate-report` → 生成AI分析报告（支持缓存/强制重建）
- POST `/api/teacher/ai/exam-results/:exam_result_id/regenerate-report` → 强制重新生成报告（清理旧报告）
- GET  `/api/teacher/ai/exam-results/:exam_result_id/report-status` → 报告状态（latestReport 含 downloadUrl/filename/progress 等）
- GET  `/api/teacher/ai/exam-results/:exam_result_id/emotion-preview` → 情绪数据预览（聚合/原始片段）
- POST `/api/teacher/ai/exam-results/:exam_result_id/end-session` → 手动结束AI会话
- GET  `/api/teacher/ai/service/health` → AI服务健康

## AI 报告 reports
- POST `/api/reports/generate/:exam_result_id` → 生成AI报告（下载内容，文本）
- GET  `/api/reports/check/:exam_result_id` → 检查考试结果存在与权限
- GET  `/api/reports/status/:exam_result_id` → 报告状态（是否已生成/可下载）

## 音频 audio（教师 + 公开）
公开：
- HEAD/GET `/api/audio/questions/:question_id/:filename` → 访问音频

教师：
- POST `/api/audio/questions/:question_id/generate` → 生成音频
- POST `/api/audio/questions/:question_id/generate-single` → 生成音频（新）
- DELETE `/api/audio/questions/:question_id` → 删除音频
- GET `/api/audio/questions/:question_id/info` → 音频信息
- GET `/api/audio/questions/:question_id/check-update` → 检查更新
- POST `/api/audio/papers/:paper_id/batch-generate` → 批量生成
- GET `/api/audio/papers/:paper_id/status` → 音频状态
- POST `/api/audio/cleanup` → 清理孤立音频

## AI 服务配置（公开）
- GET `/api/ai-service/config` → AI可用性/配置

注：更详尽的入参/出参结构与数据库字段映射，参见对应模块文档：`docs/backend/{paper,question,exam,analytics,audio}.md`。
