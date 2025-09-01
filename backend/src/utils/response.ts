import { Response } from 'express';
import { ApiResponse } from '../types';
import { prepareResponseData } from './fieldConverter';

// 成功响应（增强版）
export const sendSuccess = <T>(res: Response, data: T, statusCode: number = 200): Response => {
  const response: ApiResponse<T> = {
    success: true,
    data: prepareResponseData(data), // 应用字段转换
    error: null,
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(response);
};

// 错误响应（增强版）
export const sendError = (res: Response, error: string, statusCode: number = 400): Response => {
  const response: ApiResponse = {
    success: false,
    data: null,
    error,
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(response);
};

// 标准化错误码
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ERROR: 'DUPLICATE_ERROR',
  AI_SESSION_ERROR: 'AI_SESSION_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// 带错误码的错误响应
export const sendErrorWithCode = (
  res: Response, 
  message: string, 
  errorCode: keyof typeof ErrorCodes,
  statusCode: number = 400
): Response => {
  const response = {
    success: false,
    data: null,
    error: {
      code: errorCode,
      message,
    },
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(response);
};