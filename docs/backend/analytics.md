# 数据分析模块

## 涉及文件
- `/backend/src/controllers/analyticsController.ts` - 统计分析控制器

## 数据库
- **papers表**: 统计试卷总数
- **exams表**: 统计考试数量、状态分布
- **exam_results表**: 统计参与人数、平均分数
- **question_responses表**: 统计答题时长、完成率

## 主要接口
- `GET /api/teacher/analytics/dashboard?timeRange=30d` → `{overall_stats, monthly_trends, exam_performance[]}`

## 响应格式
```typescript
{
  overall_stats: {
    total_papers: number,
    total_exams: number, 
    total_participants: number,
    avg_completion_rate: number,
    most_popular_exam: {title, participant_count}
  },
  monthly_trends: Array<{month, exams_created, participants, completion_rate}>,
  exam_performance: Array<{exam_id, exam_title, paper_title, status, participant_count, avg_duration}>
}
```

## 核心功能
- 总体统计数据汇总
- 时间范围筛选（7d/30d/90d/1y）
- 月度趋势分析
- 考试表现详情
- 最受欢迎考试识别

## 注意事项
- 复杂SQL聚合查询优化
- 支持多维度数据统计
- 缓存机制提高响应速度