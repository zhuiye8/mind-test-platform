-- Add JSONB GIN indexes for performance optimization
-- Based on PostgreSQL best practices research

-- Indexes for AiAggregate.value_json
CREATE INDEX IF NOT EXISTS idx_ai_aggregates_value_json ON "ai_aggregates" USING GIN (value_json);
CREATE INDEX IF NOT EXISTS idx_ai_aggregates_value_json_key ON "ai_aggregates" USING BTREE ((value_json->>'key'));

-- Indexes for AiCheckpoint.snapshot_json  
CREATE INDEX IF NOT EXISTS idx_ai_checkpoints_snapshot_json ON "ai_checkpoints" USING GIN (snapshot_json);
CREATE INDEX IF NOT EXISTS idx_ai_checkpoints_snapshot_model ON "ai_checkpoints" USING BTREE ((snapshot_json->>'model'));

-- Indexes for AiAnomaly.evidence_json
CREATE INDEX IF NOT EXISTS idx_ai_anomalies_evidence_json ON "ai_anomalies" USING GIN (evidence_json);

-- Indexes for QuestionActionEvent.payload_json
CREATE INDEX IF NOT EXISTS idx_question_action_events_payload_json ON "question_action_events" USING GIN (payload_json);

-- Indexes for ExamInteractionData JSONB fields
CREATE INDEX IF NOT EXISTS idx_exam_interaction_data_timeline ON "exam_interaction_data" USING GIN (timeline_data);
CREATE INDEX IF NOT EXISTS idx_exam_interaction_data_voice ON "exam_interaction_data" USING GIN (voice_interactions);
CREATE INDEX IF NOT EXISTS idx_exam_interaction_data_device ON "exam_interaction_data" USING GIN (device_test_results);

-- Additional performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ai_sessions_status_started_at ON "ai_sessions" USING BTREE (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_action_events_event_type_occurred_at ON "question_action_events" USING BTREE (event_type, occurred_at DESC);