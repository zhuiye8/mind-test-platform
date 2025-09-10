# 回调契约（AI → Backend）

## 目标地址
- 基础路径：`http://localhost:3001`
- Finalize：`/api/ai-service/sessions/{session_id}/finalize`
- Checkpoint：`/api/ai-service/sessions/{session_id}/checkpoint`

## 头部
- `Authorization: Bearer dev-fixed-token-2024`
- `Idempotency-Key: <uuid>`（Finalize 必须，幂等）

## Finalize 请求体（关键字段）
```json
{
  "session_id": "uuid",
  "exam_id": "uuid",
  "candidate_id": "student_id",
  "exam_result_id": null,
  "started_at": "2025-09-04T08:20:00.000Z",
  "ended_at": "2025-09-04T08:27:00.000Z",
  "models": ["deepface", "emotion2vec", "ppg_detector", "enhanced_ppg"],
  "aggregates": { "attention": {"mean_score": 0.75}, "face": {}, "ppg": {}, "audio": {} },
  "series": [{"model": "ppg_detector", "points": [{"timestamp": "...Z", "metrics": {"hr_bpm": 72, "confidence": 0.85}}]}],
  "anomalies_timeline": [],
  "attachments": [],
  "compute_stats": {"processing_time_ms": 1250, "data_points_processed": 1800},
  "ai_version": "emotion-v1.0.0"
}
```

## Checkpoint 请求体（关键字段）
```json
{
  "session_id": "uuid",
  "exam_result_id": null,
  "timestamp": "2025-09-04T08:21:00.000Z",
  "snapshot": { "metrics": {"hr_bpm": 72}, "anomalies": [] }
}
```

## 重试与幂等
- Finalize/Checkpoint 失败将指数退避重试，最多 3 次
- Finalize 使用 `(session_id, Idempotency-Key)` 幂等

