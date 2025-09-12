/**
 * AI数据控制器
 * 处理AI服务数据存储相关业务逻辑 - 支持JSON文件存储
 */

import { Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { promisify } from 'util';
import prisma from '../utils/database';

const gunzip = promisify(zlib.gunzip);

// AI服务标准错误码
const ERROR_CODES = {
  PARAM_ERROR: 1001,
  AUTH_ERROR: 1002,
  SESSION_NOT_FOUND: 2001,
  STORAGE_ERROR: 3001,
  DUPLICATE_REQUEST: 3002,
} as const;

// 标准响应格式
const sendResponse = (res: Response, code: number, message: string, data?: any) => {
  const response = {
    code,
    message,
    data: data || null,
    request_id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
    timestamp: new Date().toISOString(),
  };
  
  const statusCode = code === 0 ? 200 : code < 2000 ? 400 : code < 3000 ? 404 : 500;
  res.status(statusCode).json(response);
};

/**
 * 完成AI会话数据存储（支持压缩JSON文件）
 */
export const finalizeAISession = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.session_id;
    const examResultId = req.headers['x-exam-result-id'] as string;
    const contentMD5 = req.headers['content-md5'] as string;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const contentType = req.headers['content-type'] as string;
    
    console.log(`[AI数据] 接收finalize请求: sessionId=${sessionId}, examResultId=${examResultId}, contentType=${contentType}`);
    
    // 1. 验证必要参数
    if (!idempotencyKey) {
      sendResponse(res, ERROR_CODES.PARAM_ERROR, '缺少Idempotency-Key头');
      return;
    }
    
    if (!examResultId) {
      sendResponse(res, ERROR_CODES.PARAM_ERROR, '缺少X-Exam-Result-ID头');
      return;
    }
    
    // 2. 检查幂等性
    const existingIdempotency = await prisma.aiFinalizeIdemp.findUnique({
      where: {
        aiSessionId_idempotency_key: {
          aiSessionId: sessionId,
          idempotency_key: idempotencyKey
        }
      }
    });
    
    if (existingIdempotency) {
      console.log(`[AI数据] 幂等重复请求: ${sessionId}`);
      sendResponse(res, 0, 'ok', { 
        ack: true, 
        session_id: sessionId,
        md5_verified: true
      });
      return;
    }
    
    let jsonData: any;
    
    // 3. 解析数据（支持压缩格式）
    if (contentType === 'application/gzip') {
      // 压缩数据处理
      const compressedData = req.body;
      
      // 验证MD5
      if (contentMD5) {
        const calculatedMD5 = crypto
          .createHash('md5')
          .update(compressedData)
          .digest('hex');
        
        if (calculatedMD5 !== contentMD5) {
          console.error(`[AI数据] MD5校验失败: ${sessionId}, 期望=${contentMD5}, 实际=${calculatedMD5}`);
          sendResponse(res, ERROR_CODES.PARAM_ERROR, 'MD5校验失败');
          return;
        }
      }
      
      try {
        const decompressed = await gunzip(compressedData);
        jsonData = JSON.parse(decompressed.toString('utf-8'));
        console.log(`[AI数据] 解压成功: ${sessionId}, 原始大小=${compressedData.length}, 解压后=${decompressed.length}`);
      } catch (e) {
        console.error(`[AI数据] 解压失败: ${sessionId}`, e);
        sendResponse(res, ERROR_CODES.PARAM_ERROR, '数据解压失败');
        return;
      }
    } else {
      // 原始JSON数据
      jsonData = req.body;
    }
    
    // 4. 保存到文件系统
    const storageDir = path.join(process.cwd(), 'storage', 'ai-sessions');
    await fs.mkdir(storageDir, { recursive: true });
    
    const filePath = path.join(storageDir, `${examResultId}.json`);
    const dataToStore = jsonData.data || jsonData;
    
    await fs.writeFile(filePath, JSON.stringify(dataToStore, null, 2), 'utf-8');
    
    const stats = await fs.stat(filePath);
    console.log(`[AI数据] 文件保存成功: ${filePath}, 大小=${stats.size} bytes`);
    
    // 5. 更新数据库会话记录（仅元数据）
    await prisma.$transaction(async (tx) => {
      // 更新会话状态
      await tx.aiSession.upsert({
        where: { id: sessionId },
        update: {
          status: 'ENDED',
          ended_at: new Date(jsonData.ended_at || Date.now()),
        },
        create: {
          id: sessionId,
          examId: jsonData.exam_id,
          examResultId: examResultId,
          participant_id: '', // 占位符
          started_at: new Date(jsonData.started_at || Date.now()),
          ended_at: new Date(jsonData.ended_at || Date.now()),
          status: 'ENDED',
        }
      });
      
      // 记录幂等性
      await tx.aiFinalizeIdemp.create({
        data: {
          aiSessionId: sessionId,
          idempotency_key: idempotencyKey
        }
      });
    });
    
    // 6. 清理废弃的checkpoint数据（如果有）
    try {
      const deletedCount = await prisma.aiCheckpoint.deleteMany({
        where: { aiSessionId: sessionId }
      });
      if (deletedCount.count > 0) {
        console.log(`[AI数据] 清理废弃checkpoint数据: ${sessionId}, 删除${deletedCount.count}条`);
      }
    } catch (e) {
      console.warn(`[AI数据] 清理checkpoint失败: ${sessionId}`, e);
    }
    
    // 7. 返回确认，触发AI端删除缓存
    sendResponse(res, 0, 'ok', {
      ack: true,
      session_id: sessionId,
      md5_verified: true,
      stored_path: filePath,
      file_size: stats.size
    });
    
  } catch (error) {
    console.error(`[AI数据] Finalize处理失败: ${req.params.session_id}`, error);
    sendResponse(res, ERROR_CODES.STORAGE_ERROR, '数据存储失败');
  }
};

/**
 * 获取AI会话信息
 */
export const getAISession = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.session_id;
    
    const session = await prisma.aiSession.findUnique({
      where: { id: sessionId }
    });
    
    if (!session) {
      sendResponse(res, ERROR_CODES.SESSION_NOT_FOUND, '会话不存在');
      return;
    }
    
    sendResponse(res, 0, 'ok', {
      session_id: sessionId,
      status: session.status,
      started_at: session.started_at?.toISOString(),
      ended_at: session.ended_at?.toISOString(),
    });
    
  } catch (error) {
    console.error(`[AI数据] 获取会话失败: ${req.params.session_id}`, error);
    sendResponse(res, ERROR_CODES.STORAGE_ERROR, '获取会话信息失败');
  }
};

/**
 * 废弃的checkpoint保存函数 - 仅用于兼容性
 */
export const saveAICheckpoint = async (req: Request, res: Response): Promise<void> => {
  console.warn(`[AI数据] 收到废弃的checkpoint请求: ${req.params.session_id}, 已忽略`);
  sendResponse(res, 0, 'ok', { 
    ack: true, 
    message: 'checkpoint已废弃，使用JSON文件存储' 
  });
};