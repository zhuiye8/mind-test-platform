import { Router } from 'express';
import {
  createExam,
  getTeacherExams,
  getExamById,
  getExamResults,
  updateExam,
  deleteExam,
  toggleExamPublish,
  exportExamResults,
  getExamResultDetail,
  batchExportExamResults,
  // 考试生命周期管理方法
  finishExam,
  archiveExam,
  restoreExam,
  getArchivedExams,
  getExamSubmissions,
  getExamQuestions,
} from '../controllers/examController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 考试管理路由
router.post('/', createExam);                               // 创建考试
router.get('/', getTeacherExams);                           // 获取教师的所有考试（支持状态筛选）
router.get('/archived', getArchivedExams);                  // 获取归档考试列表（回收站）- 新增
router.get('/:examId', getExamById);                        // 获取考试详情
router.put('/:examId', updateExam);                         // 更新考试
router.delete('/:examId', deleteExam);                      // 智能删除考试 - 增强
router.post('/:examId/toggle-publish', toggleExamPublish);  // 切换发布状态

// 考试生命周期管理路由 - 新增
router.put('/:examId/finish', finishExam);                  // 结束考试 (published → success)
router.put('/:examId/archive', archiveExam);                // 归档考试 (success → archived)
router.put('/:examId/restore', restoreExam);                // 恢复考试 (archived → success)
router.get('/:examId/submissions', getExamSubmissions);     // 获取考试提交学生列表

// 考试结果管理路由
router.get('/:examId/results', getExamResults);             // 获取考试结果
router.get('/:examId/results/export', exportExamResults);   // 导出考试结果
router.get('/:examId/results/:resultId', getExamResultDetail); // 获取单个结果详情
router.post('/batch-export', batchExportExamResults);        // 批量导出考试结果

// 考试题目管理路由
router.get('/:examId/questions', getExamQuestions);          // 获取考试题目详情（用于答案展示）

export default router;