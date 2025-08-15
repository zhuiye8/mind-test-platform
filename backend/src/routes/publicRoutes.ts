import { Router } from 'express';
import {
  getPublicExam,
  verifyExamPassword,
  checkDuplicateSubmission,
  submitExamAnswers,
  createAISession,
  retryAISession,
} from '../controllers/publicController';

const router = Router();

// 公开考试接口（无需认证）
router.get('/exams/:publicUuid', getPublicExam);                    // 获取考试信息
router.post('/exams/:publicUuid/verify', verifyExamPassword);       // 验证考试密码
router.post('/exams/:publicUuid/check-duplicate', checkDuplicateSubmission); // 检查重复提交
router.post('/exams/:publicUuid/create-ai-session', createAISession); // 创建AI分析会话
router.post('/exams/:publicUuid/retry-ai-session', retryAISession); // 重试AI分析会话
router.post('/exams/:publicUuid/submit', submitExamAnswers);        // 提交考试答案

export default router;