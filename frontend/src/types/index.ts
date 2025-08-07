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
}

export interface CreatePaperForm {
  title: string;
  description?: string;
}

// 题目相关类型
export interface Question {
  id: string;
  question_order: number;
  title: string;
  options: Record<string, string>;
  question_type: 'single_choice' | 'multiple_choice' | 'text';
  display_condition?: DisplayCondition;
  created_at: string;
  updated_at: string;
}

export interface SimpleCondition {
  question_id: string;
  selected_option: string;
}

export interface ComplexCondition {
  operator: 'AND' | 'OR';
  conditions: SimpleCondition[];
}

export type DisplayCondition = SimpleCondition | ComplexCondition | null;

export interface CreateQuestionForm {
  title: string;
  question_type: 'single_choice' | 'multiple_choice' | 'text';
  options: Record<string, string>;
  question_order?: number;
  display_condition?: DisplayCondition;
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