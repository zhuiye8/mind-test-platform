import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireAdminRole } from '../middleware/adminAuth';
import {
  getTeacherList,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  resetTeacherPassword,
  getTeacherStats,
} from '../controllers/teacherManagement.controller';

const router = Router();

// 所有教师管理路由都需要管理员权限
router.use(authenticateToken);
router.use(requireAdminRole);

// GET /api/teacher/management/stats - 获取教师统计信息
router.get('/stats', getTeacherStats);

// GET /api/teacher/management/list - 获取教师列表
router.get('/list', getTeacherList);

// POST /api/teacher/management/create - 创建教师账户
router.post('/create', createTeacher);

// PUT /api/teacher/management/:teacherId - 更新教师信息
router.put('/:teacherId', updateTeacher);

// DELETE /api/teacher/management/:teacherId - 删除教师账户
router.delete('/:teacherId', deleteTeacher);

// POST /api/teacher/management/:teacherId/reset-password - 重置教师密码
router.post('/:teacherId/reset-password', resetTeacherPassword);

export default router;