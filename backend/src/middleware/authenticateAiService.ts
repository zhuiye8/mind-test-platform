/**
 * AI服务鉴权中间件
 * 用于验证AI服务的访问权限
 */

import { Request, Response, NextFunction } from 'express';

const AI_SERVICE_TOKEN = process.env.AI_SERVICE_TOKEN || 'ai-service-token-dev';
const DEV_ALLOWED_TOKENS = new Set<string>([AI_SERVICE_TOKEN, 'dev-ai-token']);

export const authenticateAiService = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const bearer = typeof req.headers['authorization'] === 'string' ? (req.headers['authorization'] as string).replace('Bearer ', '') : undefined;
  const xHeader = typeof req.headers['x-ai-service-token'] === 'string' ? (req.headers['x-ai-service-token'] as string) : undefined;
  const token = xHeader || bearer;

  if (!token) {
    res.status(401).json({
      code: 1002,
      message: 'AI Service Token required',
      data: null,
      request_id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (!DEV_ALLOWED_TOKENS.has(token)) {
    res.status(401).json({
      code: 1002,
      message: 'Invalid AI Service Token',
      data: null,
      request_id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      timestamp: new Date().toISOString()
    });
    return;
  }

  next();
};