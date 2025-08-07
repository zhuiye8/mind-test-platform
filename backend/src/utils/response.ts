import { Response } from 'express';
import { ApiResponse } from '../types';

// 成功响应
export const sendSuccess = <T>(res: Response, data: T, statusCode: number = 200): Response => {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  return res.status(statusCode).json(response);
};

// 错误响应
export const sendError = (res: Response, error: string, statusCode: number = 400): Response => {
  const response: ApiResponse = {
    success: false,
    error,
  };
  return res.status(statusCode).json(response);
};