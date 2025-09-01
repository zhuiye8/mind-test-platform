/**
 * PaperDetail组件相关类型定义
 */
import type { Paper, Question, CreateQuestionForm, QuestionWithAudioSuggestion } from '../../types';

export interface PaperDetailProps {
  paperId: string;
}

export interface QuestionListProps {
  questions: Question[];
  onEdit: (question: Question) => void;
  onDelete: (id: string) => void;
  onDuplicate: (question: Question) => void;
  onAudioGenerate: (questionId: string) => void;
  loading?: boolean;
}

export interface ConditionLogicPanelProps {
  questions: Question[];
  onUpdate: (questionId: string, condition: any) => void;
}

export interface BatchImportModalProps {
  visible: boolean;
  paperId: string;
  onCancel: () => void;
  onSuccess: () => void;
}

export interface PaperHeaderProps {
  paper: Paper | null;
  onUpdate: (paper: Paper) => void;
  onBack: () => void;
}

export interface PaperStatsProps {
  questions: Question[];
  paper: Paper | null;
}

// Hook返回类型
export interface UsePaperDetailReturn {
  paper: Paper | null;
  questions: Question[];
  loading: boolean;
  modalVisible: boolean;
  editingQuestion: Question | null;
  refreshPaper: () => Promise<void>;
  refreshQuestions: () => Promise<void>;
  handleAddQuestion: () => void;
  handleEditQuestion: (question: Question) => void;
  handleDeleteQuestion: (id: string) => void;
  handleDuplicateQuestion: (question: Question) => void;
  handleModalSubmit: (data: CreateQuestionForm) => Promise<void>;
  handleModalCancel: () => void;
}