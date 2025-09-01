/**
 * AI服务鉴权中间件
 * 用于验证AI服务的访问权限
 */

import { Request, Response, NextFunction } from 'express';

const AI_SERVICE_TOKEN = process.env.AI_SERVICE_TOKEN || 'ai-service-token-dev';

export const authenticateAiService = (
  req: Request, 
  res: Response, 
  next: NextFunction
): void => {
  const token = req.headers['x-ai-service-token'] || req.headers['authorization']?.replace('Bearer ', '');
  
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
  
  if (token !== AI_SERVICE_TOKEN) {
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