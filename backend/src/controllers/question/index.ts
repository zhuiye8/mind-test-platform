// 题目管理控制器模块化入口
// 将原 questionController.ts (2305行) 拆分为多个专业化模块

// CRUD 基础操作
export {
  createQuestion,
  updateQuestion,
  deleteQuestion
} from './crud.controller';

// 批量操作
export {
  batchCreateQuestions,
  batchUpdateQuestions,
  batchDeleteQuestions,
  batchImportQuestions,
  batchReorderQuestions
} from './batch.controller';

// 分析功能
export {
  getPaperDependencyGraph,
  validateQuestionCondition,
  getConditionTemplates,
  previewConditionLogic,
  batchSetConditionLogic,
  exportConditionLogicConfig,
  importConditionLogicConfig
} from './analysis.controller';

// 音频相关功能  
export {
  getQuestionsByPaper,
  batchGenerateAudio,
  getPaperAudioStatus
} from './audio.controller';

// 计分管理功能
export {
  batchSetScoring,
  previewBatchScoring
} from './scoring.controller';