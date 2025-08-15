// 通用API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// 条件逻辑类型
export interface DisplayCondition {
  question_id: string;
  selected_option: string;
}

// 题目类型
export interface QuestionOptions {
  [key: string]: string; // "A": "选项内容", "B": "选项内容"
}

export type QuestionType = 'single_choice' | 'multiple_choice' | 'text';

// 考试答案类型
export interface ExamAnswers {
  [questionId: string]: string; // questionId -> 选择的选项
}

// JWT载荷类型
export interface JwtPayload {
  teacherId: string;
  id: string;
  iat?: number;
  exp?: number;
}

// 创建题目的请求类型
export interface CreateQuestionRequest {
  question_order: number;
  title: string;
  options: QuestionOptions;
  question_type: QuestionType;
  display_condition?: DisplayCondition | null;
}

// 创建试卷的请求类型
export interface CreatePaperRequest {
  title: string;
  description?: string;
}

// 创建考试的请求类型
export interface CreateExamRequest {
  paper_id: string;
  title: string;
  duration_minutes: number;
  start_time?: string;
  end_time?: string;
  password?: string;
  shuffle_questions?: boolean;
}

// 提交考试答案的请求类型
export interface SubmitExamRequest {
  student_id: string;
  student_name: string;
  answers: ExamAnswers;
  started_at?: string; // 答题开始时间（ISO格式字符串）
  // AI功能相关数据
  emotion_analysis_id?: string;
  timeline_data?: any;
  voice_interactions?: any;
  device_test_results?: any;
}

// 验证考试密码的请求类型
export interface VerifyExamPasswordRequest {
  password: string;
}

// 教师登录请求类型
export interface TeacherLoginRequest {
  teacher_id: string;
  password: string;
}

// 自定义错误类型
// 考试状态枚举 - 与Prisma保持一致
export enum ExamStatus {
  DRAFT = 'DRAFT',         // 草稿
  PUBLISHED = 'PUBLISHED', // 进行中
  EXPIRED = 'EXPIRED',     // 已停止
  SUCCESS = 'SUCCESS',     // 已结束
  ARCHIVED = 'ARCHIVED'    // 已归档
}

// 状态转换规则定义
export const EXAM_STATUS_TRANSITIONS: Record<ExamStatus, ExamStatus[]> = {
  [ExamStatus.DRAFT]: [ExamStatus.PUBLISHED],                     // 草稿 → 发布
  [ExamStatus.PUBLISHED]: [ExamStatus.EXPIRED, ExamStatus.SUCCESS], // 进行中 → 停止/结束
  [ExamStatus.EXPIRED]: [ExamStatus.DRAFT],                       // 停止 → 重新编辑
  [ExamStatus.SUCCESS]: [ExamStatus.ARCHIVED],                    // 结束 → 归档
  [ExamStatus.ARCHIVED]: [ExamStatus.SUCCESS],                    // 归档 → 恢复
};

// 状态转换请求类型
export interface ExamStatusTransitionRequest {
  from_status: ExamStatus;
  to_status: ExamStatus;
  reason?: string; // 可选的操作原因
}

// 考试提交统计信息
export interface ExamSubmissionStats {
  total_submissions: number;
  completed_submissions: number;
  unique_participants: number;
  unique_ips: number;
  latest_submission?: string; // ISO时间字符串
}

// 获取考试提交列表请求类型
export interface GetExamSubmissionsRequest {
  page?: number;
  limit?: number;
  search?: string; // 按学号或姓名搜索
  sort_field?: 'submitted_at' | 'participant_name' | 'participant_id';
  sort_order?: 'asc' | 'desc';
}

// 考试提交结果响应类型
export interface ExamSubmissionResult {
  id: string;
  participant_id: string;
  participant_name: string;
  answers: ExamAnswers;
  score: number;
  ip_address: string | null;
  started_at: string | null; // ISO时间字符串
  submitted_at: string; // ISO时间字符串
}

// 获取归档考试列表请求类型
export interface GetArchivedExamsRequest {
  page?: number;
  limit?: number;
  search?: string; // 按考试标题或试卷标题搜索
  sort_field?: 'updated_at' | 'created_at' | 'title';
  sort_order?: 'asc' | 'desc';
}

// 批量操作请求类型
export interface BatchOperationRequest {
  exam_ids: string[];
  operation: 'archive' | 'restore' | 'delete';
  force?: boolean; // 是否强制执行（忽略某些检查）
}

// 考试生命周期操作日志类型
export interface ExamLifecycleLog {
  exam_id: string;
  teacher_id: string;
  action: 'create' | 'publish' | 'finish' | 'expire' | 'archive' | 'restore' | 'delete';
  from_status?: ExamStatus;
  to_status?: ExamStatus;
  reason?: string;
  timestamp: string; // ISO时间字符串
  metadata?: Record<string, any>; // 额外的元数据
}

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}