import { Router } from 'express';
import {
  createPaper,
  getTeacherPapers,
  getPaperById,
  updatePaper,
  deletePaper,
} from '../controllers/paperController';
import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestionsByPaper,
  batchCreateQuestions,
  batchUpdateQuestions,
  batchDeleteQuestions,
  batchImportQuestions,
  batchReorderQuestions,
  getPaperDependencyGraph,
  validateQuestionCondition,
  // 第二阶段：增强条件逻辑API
  getConditionTemplates,
  previewConditionLogic,
  batchSetConditionLogic,
  exportConditionLogicConfig,
  importConditionLogicConfig,
} from '../controllers/questionController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// 所有路由都需要认证
router.use(authenticateToken);

// 试卷管理路由
router.post('/', createPaper);                    // 创建试卷
router.get('/', getTeacherPapers);                // 获取教师的所有试卷
router.get('/:paperId', getPaperById);            // 获取单个试卷详情
router.put('/:paperId', updatePaper);             // 更新试卷
router.delete('/:paperId', deletePaper);          // 删除试卷

// 题目管理路由
router.post('/:paperId/questions', createQuestion);        // 创建题目
router.get('/:paperId/questions', getQuestionsByPaper);    // 获取试卷的所有题目
router.put('/questions/:questionId', updateQuestion);      // 更新题目
router.delete('/questions/:questionId', deleteQuestion);   // 删除题目

// 题目批量操作路由
router.post('/:paperId/questions/batch-create', batchCreateQuestions);    // 批量创建题目
router.put('/questions/batch-update', batchUpdateQuestions);              // 批量更新题目
router.delete('/questions/batch-delete', batchDeleteQuestions);           // 批量删除题目
router.post('/:paperId/questions/batch-import', batchImportQuestions);    // 批量导入题目
router.put('/:paperId/questions/batch-reorder', batchReorderQuestions);   // 批量调整排序

// 题目依赖关系和条件逻辑路由
router.get('/:paperId/questions/dependencies', getPaperDependencyGraph);  // 获取题目依赖关系图
router.post('/questions/:questionId/validate-conditions', validateQuestionCondition); // 验证条件逻辑

// 第二阶段：增强条件逻辑API路由
router.get('/condition-templates', getConditionTemplates);                             // 获取条件逻辑模板
router.post('/:paperId/condition-preview', previewConditionLogic);                     // 条件逻辑预览
router.put('/conditions/batch-set', batchSetConditionLogic);                           // 批量设置条件逻辑
router.get('/:paperId/conditions/export', exportConditionLogicConfig);                // 导出条件逻辑配置
router.post('/:paperId/conditions/import', importConditionLogicConfig);               // 导入条件逻辑配置

export default router;