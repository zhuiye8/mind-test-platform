import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

// 管理员权限验证中间件
export const requireAdminRole = (req: Request, res: Response, next: NextFunction): void => {
  const teacher = req.teacher;
  
  if (!teacher) {
    sendError(res, '认证信息无效', 401);
    return;
  }

  // 检查是否为管理员角色
  if (teacher.role !== 'ADMIN') {
    sendError(res, '权限不足，需要管理员权限', 403);
    return;
  }

  next();
};

// 检查操作目标不能是管理员账户（防止删除管理员）
export const preventAdminDeletion = (_req: Request, _res: Response, next: NextFunction): void => {
  // 这个中间件将在controller中检查目标教师角色，而不是在这里
  next();
};