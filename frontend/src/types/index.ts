// 基础类型定义
import type { ExamStatusType } from '../constants/examStatus';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// 教师相关类型
export interface Teacher {
  id: string;
  name: string;
  teacher_id: string;
  created_at: string;
  updated_at: string;
}

export interface LoginForm {
  teacher_id: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  teacher: Teacher;
}

// 试卷相关类型
export interface Paper {
  id: string;
  title: string;
  description?: string;
  question_count: number;
  exam_count: number;
  created_at: string;
  updated_at: string;
  // 新增量表字段
  scale_type?: 'grouped' | 'flat';
  show_scores?: boolean;
  scale_config?: {
    totalQuestions?: number;
    scoredQuestions?: number;
    fillerQuestions?: number;
    scoringType?: string;
    scoreRange?: { min: number; max: number };
    description?: string;
  };
}

export interface CreatePaperForm {
  title: string;
  description?: string;
}

// 量表维度类型
export interface Scale {
  id: string;
  paper_id: string;
  scale_name: string;
  scale_order: number;
  created_at: string;
  updated_at: string;
}

// 选项类型定义 - 支持分数和文本两种格式
export interface QuestionOption {
  text?: string;     // 选项文本（新格式）
  label?: string;    // 选项文本（兼容导入格式）
  score?: number;    // 选项分数
  value?: number;    // 兼容导入格式的分数
}

// 题目相关类型
export interface Question {
  id: string;
  question_order: number;
  title: string;
  options: Record<string, string | QuestionOption>; // 支持字符串和对象两种格式
  question_type: 'single_choice' | 'multiple_choice' | 'text';
  is_required?: boolean; // 是否必填，默认为true
  created_at: string;
  updated_at: string;
  // 新增量表字段
  scale_id?: string;
  score_value?: number;
  is_scored?: boolean;
  display_condition?: any;
  // V1.0.1 新增语音字段
  audio_status?: string;
  audio_url?: string | null;
  audio_duration?: number | null;
  audio_needs_update?: boolean;
  audio_error?: string | null;
  audio_generated_at?: string | null;
}

// 语音生成建议类型
export interface AudioSuggestion {
  shouldGenerateAudio?: boolean;
  shouldUpdateAudio?: boolean;
  message: string;
}

// 包含语音建议的题目响应类型
export interface QuestionWithAudioSuggestion extends Question {
  audioSuggestion?: AudioSuggestion;
}


export interface CreateQuestionForm {
  title: string;
  question_type: 'single_choice' | 'multiple_choice' | 'text';
  options: Record<string, string | QuestionOption>;
  question_order?: number;
  is_required?: boolean; // 是否必填，默认为true
  is_scored?: boolean; // 是否计分
}

// 考试相关类型
export interface Exam {
  id: string;
  public_uuid: string;
  title: string;
  paper_title: string;
  duration_minutes: number;
  question_count: number;
  participant_count: number;
  start_time: string | null;
  end_time: string | null;
  has_password: boolean;
  shuffle_questions: boolean;
  status: ExamStatusType;
  public_url: string;
  created_at: string;
  updated_at: string;
  
  // 为了向后兼容，保留驼峰字段名
  paperId?: string;
  teacherId?: string;
  publicUuid?: string;
  questionIdsSnapshot?: string[] | string;
  shuffleQuestions?: boolean;
  password?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number;
  createdAt?: string;
  updatedAt?: string;
  paper?: {
    title: string;
  };
  _count?: {
    results: number;
  };
  result_count?: number;
}

export interface CreateExamForm {
  paper_id: string;
  title: string;
  duration_minutes: number;
  start_time?: string;
  end_time?: string;
  password?: string;
  shuffle_questions: boolean;
}

// 题目作答记录类型
export interface QuestionResponse {
  id: string;
  exam_result_id: string;
  question_id: string;
  question_order: number;
  response_value: string;
  response_score?: number;
  question_displayed_at?: string;
  response_submitted_at: string;
  time_to_answer_seconds?: number;
  created_at: string;
}

// 考试结果相关类型
export interface ExamResult {
  id: string;
  participant_id: string;
  participant_name: string;
  answers: Record<string, string>;
  ip_address: string;
  started_at: string | null;
  submitted_at: string;
  score?: number;
  
  // 新增量表统计字段
  total_questions?: number;
  answered_questions?: number;
  total_time_seconds?: number;
  scale_scores?: Record<string, number>; // 各维度得分
  
  // 向后兼容字段
  student_id?: string;
  student_name?: string;
}

// 分析数据类型
export interface AnalyticsData {
  overall_stats: {
    total_exams: number;
    total_participants: number;
    total_papers: number;
    avg_completion_rate: number;
    most_popular_exam?: {
      title: string;
      participant_count: number;
    };
  };
  monthly_trends: Array<{
    month: string;
    exams_created: number;
    participants: number;
    completion_rate: number;
  }>;
  exam_performance: Array<{
    exam_id: string;
    exam_title: string;
    paper_title: string;
    participant_count: number;
    completion_rate: number;
    avg_score: number;
    avg_duration: number;
    created_at: string;
  }>;
}

// V1.0.1 语音文件管理相关类型
export interface AudioFileInfo {
  id: string;
  status: 'none' | 'pending' | 'generating' | 'ready' | 'error';
  fileUrl?: string | null;
  duration?: number | null;
  contentHash?: string;
  generatedAt?: string | null;
  error?: string | null;
}

export interface PaperAudioStatus {
  paperId: string;
  paperTitle: string;
  totalQuestions: number;
  statusCount: {
    none: number;
    pending: number;
    generating: number;
    ready: number;
    error: number;
    needUpdate: number;
  };
  completionRate: number;
  totalDuration: number;
  averageDuration: number;
  lastGenerated?: string | null;
}

export interface BatchAudioGenerateRequest {
  voiceSettings?: {
    voice?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
  };
  forceRegenerate?: boolean;
}

export interface BatchAudioGenerateResponse {
  message: string;
  totalQuestions: number;
  successCount: number;
  failedCount: number;
  errors: string[];
}

export interface VoiceMatchResult {
  success: boolean;
  data?: {
    matched: boolean;
    option?: string;
    confidence?: number;
    reason?: string;
  };
  error?: string;
}