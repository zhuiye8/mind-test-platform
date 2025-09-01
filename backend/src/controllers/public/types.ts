/**
 * 公开控制器类型定义
 */

export interface ExamAccessInfo {
  id: string;
  title: string;
  durationMinutes?: number | null;
  description?: string;
  startTime?: Date | null;
  endTime?: Date | null;
  shuffleQuestions: boolean;
  questionIds: string[];
  requiresPassword: boolean;
}

export interface AISessionResult {
  examResultId: string;
  aiSessionId: string;
  message?: string;
}

export interface SubmissionResult {
  success: boolean;
  examResultId: string;
  score?: number;
  submittedAt: Date;
  aiSessionId?: string;
}

export interface DuplicateCheckResult {
  canSubmit: boolean;
}