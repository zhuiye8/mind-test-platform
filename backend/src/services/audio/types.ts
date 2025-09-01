/**

 * 音频服务类型定义
 */

export interface Question {
  id: string;
  title: string;
  options: any;
  question_type: string;
  questionType: string; // Prisma field name compatibility
}

export interface VoiceSettings {
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface AudioGenerationResult {
  success: boolean;
  audioId?: string;
  filePath?: string;
  fileUrl?: string;
  duration?: number;
  error?: string;
}

export interface BatchAudioResult {
  success: number;
  failed: number;
  errors: string[];
  totalTime: number;
  batchId?: string;
}

export interface AudioStatusSummary {
  total: number;
  ready: number;
  generating: number;
  error: number;
  none: number;
  needUpdate: number;
  completionRate: number;
}

export interface QuestionAudioStatus {
  id: string;
  title: string;
  questionOrder: number;
  audioStatus: string;
  audioUrl: string | null;
  audioAccessible: boolean;
  duration: number | null;
  needsUpdate: boolean;
}

export interface PaperAudioStatus {
  paperId: string;
  questions: QuestionAudioStatus[];
  summary: AudioStatusSummary;
}

export interface CleanupResult {
  cleaned: number;
  errors: string[];
}