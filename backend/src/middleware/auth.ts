import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt';
import { sendError } from '../utils/response';
import { JwtPayload } from '../types';

// 扩展Request接口以包含teacher信息
declare global {
  namespace Express {
    interface Request {
      teacher?: JwtPayload;
    }
  }
}

// JWT认证中间件
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = extractTokenFromHeader(req.headers.authorization);

  if (!token) {
    sendError(res, '未提供认证令牌', 401);
    return;
  }

  try {
    const decoded = verifyToken(token);
    req.teacher = decoded;
    next();
  } catch (error) {
    sendError(res, '无效的认证令牌', 401);
    return;
  }
};