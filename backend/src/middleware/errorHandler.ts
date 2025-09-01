import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types';
import { sendError } from '../utils/response';

// 全局错误处理中间件
export const errorHandler = (
  error: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('错误详情:', error);

  // 如果是自定义的AppError
  if (error instanceof AppError) {
    sendError(res, error.message, error.statusCode);
    return;
  }

  // Prisma错误处理
  if (error.name === 'PrismaClientKnownRequestError') {
    handlePrismaError(error as any, res);
    return;
  }

  // JWT错误处理
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    sendError(res, '认证令牌无效或已过期', 401);
    return;
  }

  // 默认服务器错误
  sendError(res, '服务器内部错误', 500);
};

// 处理Prisma数据库错误
const handlePrismaError = (error: any, res: Response): void => {
  switch (error.code) {
    case 'P2002':
      sendError(res, '数据已存在，违反唯一性约束', 409);
      break;
    case 'P2025':
      sendError(res, '未找到相关记录', 404);
      break;
    case 'P2003':
      sendError(res, '外键约束违反', 400);
      break;
    default:
      sendError(res, '数据库操作失败', 500);
  }
};