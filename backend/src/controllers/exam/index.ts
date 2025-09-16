/**
 * 考试控制器统一导出文件
 * 将拆分后的模块统一导出，保持向后兼容性
 */

// CRUD操作
export {
  createExam,
  getExamById,
  updateExam,
  deleteExam
} from './crud.controller';

// 查询操作
export {
  getTeacherExams,
  getArchivedExams,
  getExamQuestions
} from './query.controller';

// 结果管理
export {
  getExamResults,
  getExamResultDetail,
  getExamSubmissions
} from './results.controller';

// 导出功能
export {
  exportExamResults,
  batchExportExamResults
} from './export.controller';

// 生命周期管理
export {
  toggleExamPublish,
  finishExam,
  archiveExam,
  restoreExam,
  updateExamStatus
} from './lifecycle.controller';
