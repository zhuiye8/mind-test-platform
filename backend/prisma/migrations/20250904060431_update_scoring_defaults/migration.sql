-- CreateEnum
CREATE TYPE "public"."ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'EXPIRED', 'SUCCESS', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'PENDING_FLUSH');

-- CreateEnum
CREATE TYPE "public"."AiModel" AS ENUM ('FACE', 'ATTENTION', 'PPG', 'AUDIO', 'POSE', 'IDENTITY');

-- CreateEnum
CREATE TYPE "public"."Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "public"."AttachmentType" AS ENUM ('THUMBNAIL', 'KEYFRAME', 'METRIC_DUMP', 'MEDIA_CLIP');

-- CreateEnum
CREATE TYPE "public"."QuestionActionType" AS ENUM ('DISPLAY', 'SELECT', 'DESELECT', 'CHANGE', 'NAVIGATE', 'FOCUS', 'BLUR');

-- CreateTable
CREATE TABLE "public"."teachers" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."papers" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scale_type" TEXT NOT NULL DEFAULT 'flat',
    "show_scores" BOOLEAN NOT NULL DEFAULT false,
    "scale_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scales" (
    "id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "scale_name" TEXT NOT NULL,
    "scale_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."questions" (
    "id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "scale_id" TEXT,
    "question_order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "question_type" TEXT NOT NULL DEFAULT 'single_choice',
    "display_condition" JSONB,
    "score_value" INTEGER,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "is_scored" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."exams" (
    "id" TEXT NOT NULL,
    "paper_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "public_uuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question_ids_snapshot" JSONB NOT NULL,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "duration_minutes" INTEGER NOT NULL,
    "allow_multiple_submissions" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."question_responses" (
    "id" TEXT NOT NULL,
    "exam_result_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "question_order" INTEGER NOT NULL,
    "response_value" TEXT NOT NULL,
    "response_score" INTEGER,
    "question_displayed_at" TIMESTAMP(3),
    "response_submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "time_to_answer_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."exam_results" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "participant_name" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "total_questions" INTEGER,
    "answered_questions" INTEGER,
    "total_time_seconds" INTEGER,
    "scale_scores" JSONB,
    "ip_address" TEXT,
    "started_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ai_session_id" TEXT,

    CONSTRAINT "exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."emotion_analysis" (
    "id" TEXT NOT NULL,
    "exam_result_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "total_duration" INTEGER,
    "frames_sent" INTEGER,
    "data_points" JSONB,
    "summary" JSONB,
    "api_provider" TEXT,
    "api_version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emotion_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_reports" (
    "id" TEXT NOT NULL,
    "exam_result_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB,
    "download_url" TEXT,
    "filename" TEXT,
    "file_format" TEXT,
    "file_size" INTEGER,
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "ai_provider" TEXT,
    "ai_model" TEXT,
    "generation_time" INTEGER,
    "expires_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."question_audio" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "duration" DOUBLE PRECISION,
    "format" TEXT NOT NULL DEFAULT 'mp3',
    "voice_settings" JSONB,
    "content_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "tts_task_id" TEXT,
    "tts_provider" TEXT DEFAULT 'baidu',
    "tts_task_status" TEXT,
    "tts_task_created_at" TIMESTAMP(3),
    "tts_speech_url" TEXT,
    "tts_attempts" INTEGER NOT NULL DEFAULT 0,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_audio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."exam_interaction_data" (
    "id" TEXT NOT NULL,
    "exam_result_id" TEXT NOT NULL,
    "timeline_data" JSONB,
    "voice_interactions" JSONB,
    "device_test_results" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_interaction_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_sessions" (
    "id" TEXT NOT NULL,
    "examId" TEXT,
    "examResultId" TEXT,
    "station_id" TEXT,
    "room_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "status" "public"."SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "ai_version" TEXT,
    "retention_ttl_sec" INTEGER NOT NULL DEFAULT 86400,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_aggregates" (
    "id" TEXT NOT NULL,
    "aiSessionId" TEXT NOT NULL,
    "model" "public"."AiModel" NOT NULL,
    "key" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_anomalies" (
    "id" TEXT NOT NULL,
    "aiSessionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "public"."Severity" NOT NULL,
    "from_ts" TIMESTAMP(3) NOT NULL,
    "to_ts" TIMESTAMP(3) NOT NULL,
    "evidence_json" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_checkpoints" (
    "id" TEXT NOT NULL,
    "aiSessionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_attachments" (
    "id" TEXT NOT NULL,
    "aiSessionId" TEXT NOT NULL,
    "type" "public"."AttachmentType" NOT NULL,
    "path" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_finalize_idemp" (
    "id" TEXT NOT NULL,
    "aiSessionId" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_finalize_idemp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."question_action_events" (
    "id" TEXT NOT NULL,
    "examResultId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "event_type" "public"."QuestionActionType" NOT NULL,
    "payload_json" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_action_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teachers_teacher_id_key" ON "public"."teachers"("teacher_id");

-- CreateIndex
CREATE INDEX "papers_teacher_id_created_at_idx" ON "public"."papers"("teacher_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "papers_teacher_id_title_idx" ON "public"."papers"("teacher_id", "title");

-- CreateIndex
CREATE INDEX "scales_paper_id_scale_order_idx" ON "public"."scales"("paper_id", "scale_order");

-- CreateIndex
CREATE INDEX "questions_paper_id_question_order_idx" ON "public"."questions"("paper_id", "question_order");

-- CreateIndex
CREATE INDEX "questions_paper_id_created_at_idx" ON "public"."questions"("paper_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "questions_scale_id_question_order_idx" ON "public"."questions"("scale_id", "question_order");

-- CreateIndex
CREATE UNIQUE INDEX "exams_public_uuid_key" ON "public"."exams"("public_uuid");

-- CreateIndex
CREATE INDEX "exams_teacher_id_status_created_at_idx" ON "public"."exams"("teacher_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "exams_teacher_id_title_idx" ON "public"."exams"("teacher_id", "title");

-- CreateIndex
CREATE INDEX "exams_status_start_time_end_time_idx" ON "public"."exams"("status", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "exams_status_updated_at_idx" ON "public"."exams"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "exams_teacher_id_status_idx" ON "public"."exams"("teacher_id", "status");

-- CreateIndex
CREATE INDEX "exams_public_uuid_idx" ON "public"."exams"("public_uuid");

-- CreateIndex
CREATE INDEX "question_responses_exam_result_id_question_order_idx" ON "public"."question_responses"("exam_result_id", "question_order");

-- CreateIndex
CREATE INDEX "question_responses_question_displayed_at_response_submitted_idx" ON "public"."question_responses"("question_displayed_at", "response_submitted_at");

-- CreateIndex
CREATE INDEX "question_responses_question_id_time_to_answer_seconds_idx" ON "public"."question_responses"("question_id", "time_to_answer_seconds");

-- CreateIndex
CREATE UNIQUE INDEX "question_responses_exam_result_id_question_id_key" ON "public"."question_responses"("exam_result_id", "question_id");

-- CreateIndex
CREATE INDEX "exam_results_exam_id_submitted_at_idx" ON "public"."exam_results"("exam_id", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "exam_results_exam_id_score_idx" ON "public"."exam_results"("exam_id", "score" DESC);

-- CreateIndex
CREATE INDEX "exam_results_exam_id_participant_name_idx" ON "public"."exam_results"("exam_id", "participant_name");

-- CreateIndex
CREATE INDEX "exam_results_submitted_at_idx" ON "public"."exam_results"("submitted_at" DESC);

-- CreateIndex
CREATE INDEX "exam_results_total_time_seconds_idx" ON "public"."exam_results"("total_time_seconds");

-- CreateIndex
CREATE INDEX "exam_results_ai_session_id_idx" ON "public"."exam_results"("ai_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_exam_id_participant_id_key" ON "public"."exam_results"("exam_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "emotion_analysis_exam_result_id_key" ON "public"."emotion_analysis"("exam_result_id");

-- CreateIndex
CREATE UNIQUE INDEX "emotion_analysis_session_id_key" ON "public"."emotion_analysis"("session_id");

-- CreateIndex
CREATE INDEX "emotion_analysis_session_id_idx" ON "public"."emotion_analysis"("session_id");

-- CreateIndex
CREATE INDEX "emotion_analysis_start_time_end_time_idx" ON "public"."emotion_analysis"("start_time", "end_time");

-- CreateIndex
CREATE INDEX "emotion_analysis_status_idx" ON "public"."emotion_analysis"("status");

-- CreateIndex
CREATE INDEX "ai_reports_exam_result_id_created_at_idx" ON "public"."ai_reports"("exam_result_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_reports_status_idx" ON "public"."ai_reports"("status");

-- CreateIndex
CREATE INDEX "ai_reports_report_type_idx" ON "public"."ai_reports"("report_type");

-- CreateIndex
CREATE INDEX "ai_reports_expires_at_idx" ON "public"."ai_reports"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "question_audio_question_id_key" ON "public"."question_audio"("question_id");

-- CreateIndex
CREATE INDEX "question_audio_question_id_idx" ON "public"."question_audio"("question_id");

-- CreateIndex
CREATE INDEX "question_audio_status_idx" ON "public"."question_audio"("status");

-- CreateIndex
CREATE INDEX "question_audio_content_hash_idx" ON "public"."question_audio"("content_hash");

-- CreateIndex
CREATE INDEX "question_audio_generated_at_idx" ON "public"."question_audio"("generated_at");

-- CreateIndex
CREATE INDEX "question_audio_tts_task_id_idx" ON "public"."question_audio"("tts_task_id");

-- CreateIndex
CREATE INDEX "question_audio_tts_task_status_tts_task_created_at_idx" ON "public"."question_audio"("tts_task_status", "tts_task_created_at");

-- CreateIndex
CREATE INDEX "question_audio_tts_provider_status_idx" ON "public"."question_audio"("tts_provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_interaction_data_exam_result_id_key" ON "public"."exam_interaction_data"("exam_result_id");

-- CreateIndex
CREATE INDEX "exam_interaction_data_exam_result_id_idx" ON "public"."exam_interaction_data"("exam_result_id");

-- CreateIndex
CREATE INDEX "ai_sessions_examId_started_at_idx" ON "public"."ai_sessions"("examId", "started_at");

-- CreateIndex
CREATE INDEX "ai_sessions_examResultId_started_at_idx" ON "public"."ai_sessions"("examResultId", "started_at");

-- CreateIndex
CREATE INDEX "ai_aggregates_aiSessionId_model_key_idx" ON "public"."ai_aggregates"("aiSessionId", "model", "key");

-- CreateIndex
CREATE INDEX "ai_anomalies_aiSessionId_code_from_ts_idx" ON "public"."ai_anomalies"("aiSessionId", "code", "from_ts");

-- CreateIndex
CREATE UNIQUE INDEX "ai_checkpoints_aiSessionId_timestamp_key" ON "public"."ai_checkpoints"("aiSessionId", "timestamp");

-- CreateIndex
CREATE INDEX "ai_attachments_aiSessionId_type_idx" ON "public"."ai_attachments"("aiSessionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ai_attachments_sha256_key" ON "public"."ai_attachments"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ai_finalize_idemp_aiSessionId_idempotency_key_key" ON "public"."ai_finalize_idemp"("aiSessionId", "idempotency_key");

-- CreateIndex
CREATE INDEX "question_action_events_examResultId_occurred_at_idx" ON "public"."question_action_events"("examResultId", "occurred_at");

-- CreateIndex
CREATE INDEX "question_action_events_examResultId_questionId_occurred_at_idx" ON "public"."question_action_events"("examResultId", "questionId", "occurred_at");

-- AddForeignKey
ALTER TABLE "public"."papers" ADD CONSTRAINT "papers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scales" ADD CONSTRAINT "scales_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."questions" ADD CONSTRAINT "questions_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."questions" ADD CONSTRAINT "questions_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "public"."scales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exams" ADD CONSTRAINT "exams_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exams" ADD CONSTRAINT "exams_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_responses" ADD CONSTRAINT "question_responses_exam_result_id_fkey" FOREIGN KEY ("exam_result_id") REFERENCES "public"."exam_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_responses" ADD CONSTRAINT "question_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exam_results" ADD CONSTRAINT "exam_results_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."emotion_analysis" ADD CONSTRAINT "emotion_analysis_exam_result_id_fkey" FOREIGN KEY ("exam_result_id") REFERENCES "public"."exam_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_reports" ADD CONSTRAINT "ai_reports_exam_result_id_fkey" FOREIGN KEY ("exam_result_id") REFERENCES "public"."exam_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_audio" ADD CONSTRAINT "question_audio_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exam_interaction_data" ADD CONSTRAINT "exam_interaction_data_exam_result_id_fkey" FOREIGN KEY ("exam_result_id") REFERENCES "public"."exam_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_sessions" ADD CONSTRAINT "ai_sessions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "public"."exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_sessions" ADD CONSTRAINT "ai_sessions_examResultId_fkey" FOREIGN KEY ("examResultId") REFERENCES "public"."exam_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_aggregates" ADD CONSTRAINT "ai_aggregates_aiSessionId_fkey" FOREIGN KEY ("aiSessionId") REFERENCES "public"."ai_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_anomalies" ADD CONSTRAINT "ai_anomalies_aiSessionId_fkey" FOREIGN KEY ("aiSessionId") REFERENCES "public"."ai_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_checkpoints" ADD CONSTRAINT "ai_checkpoints_aiSessionId_fkey" FOREIGN KEY ("aiSessionId") REFERENCES "public"."ai_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_attachments" ADD CONSTRAINT "ai_attachments_aiSessionId_fkey" FOREIGN KEY ("aiSessionId") REFERENCES "public"."ai_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_finalize_idemp" ADD CONSTRAINT "ai_finalize_idemp_aiSessionId_fkey" FOREIGN KEY ("aiSessionId") REFERENCES "public"."ai_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_action_events" ADD CONSTRAINT "question_action_events_examResultId_fkey" FOREIGN KEY ("examResultId") REFERENCES "public"."exam_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."question_action_events" ADD CONSTRAINT "question_action_events_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
