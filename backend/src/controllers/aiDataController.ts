/**
 * AI数据控制器
 * 处理AI服务数据存储相关业务逻辑
 */

import { Request, Response } from 'express';
import prisma from '../utils/database';

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

// 数据验证函数
const validateFinalizeRequest = (body: any) => {
  const required = ['session_id', 'candidate_id', 'started_at', 'ended_at', 'models', 'aggregates'];
  const missing = required.filter(field => !body[field]);
  
  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
  }
  
  if (!Array.isArray(body.models)) {
    return { valid: false, error: 'models must be an array' };
  }
  
  if (typeof body.aggregates !== 'object') {
    return { valid: false, error: 'aggregates must be an object' };
  }
  
  return { valid: true };
};

const validateCheckpointRequest = (body: any) => {
  const required = ['session_id', 'timestamp', 'snapshot'];
  const missing = required.filter(field => !body[field]);
  
  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
  }
  
  if (typeof body.snapshot !== 'object') {
    return { valid: false, error: 'snapshot must be an object' };
  }
  
  return { valid: true };
};

/**
 * 完成AI会话数据存储（来自AI服务的finalize调用）
 */
export const finalizeAISession = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.session_id;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    
    if (!idempotencyKey) {
      sendResponse(res, ERROR_CODES.PARAM_ERROR, 'Idempotency-Key header is required');
      return;
    }
    
    const validation = validateFinalizeRequest(req.body);
    if (!validation.valid) {
      sendResponse(res, ERROR_CODES.PARAM_ERROR, validation.error || 'Validation failed');
      return;
    }
    
    const data = req.body;
    
    // 检查幂等性
    const existingIdempotency = await prisma.aiFinalizeIdemp.findUnique({
      where: {
        aiSessionId_idempotency_key: {
          aiSessionId: sessionId,
          idempotency_key: idempotencyKey
        }
      }
    });
    
    if (existingIdempotency) {
      sendResponse(res, 0, 'ok', { ack: true, session_id: sessionId });
      return;
    }
    
    // 事务处理AI数据存储
    await prisma.$transaction(async (tx: any) => {
      // 1. 更新或创建AI会话
      await tx.aiSession.upsert({
        where: { id: sessionId },
        update: {
          ended_at: new Date(data.ended_at),
          status: 'ENDED',
          ai_version: data.ai_version
        },
        create: {
          id: sessionId,
          examId: data.exam_id,
          examResultId: data.exam_result_id,
          started_at: new Date(data.started_at),
          ended_at: new Date(data.ended_at),
          status: 'ENDED',
          ai_version: data.ai_version
        }
      });
      
      // 2. 创建聚合数据
      const aggregateData = [];
      for (const [model, aggregates] of Object.entries(data.aggregates)) {
        for (const [key, value] of Object.entries(aggregates as Record<string, unknown>)) {
          aggregateData.push({
            aiSessionId: sessionId,
            model: model.toUpperCase() as any,
            key,
            value_json: JSON.parse(JSON.stringify(value))
          });
        }
      }
      
      if (aggregateData.length > 0) {
        await tx.aiAggregate.createMany({
          data: aggregateData,
          skipDuplicates: true
        });
      }
      
      // 3. 创建异常记录
      if (data.anomalies_timeline && data.anomalies_timeline.length > 0) {
        const anomalyData = data.anomalies_timeline.map((anomaly: any) => {
          const sevRaw = (anomaly.severity || 'LOW').toString().toUpperCase();
          const sev: 'LOW'|'MEDIUM'|'HIGH' = (sevRaw === 'LOW' || sevRaw === 'MEDIUM' || sevRaw === 'HIGH') ? sevRaw : 'LOW';
          return {
            aiSessionId: sessionId,
            code: anomaly.code,
            severity: sev as any,
            from_ts: new Date(anomaly.from),
            to_ts: new Date(anomaly.to),
            evidence_json: anomaly.evidence || {}
          };
        });
        
        await tx.aiAnomaly.createMany({
          data: anomalyData,
          skipDuplicates: true
        });
      }
      
      // 4. 从序列数据创建检查点
      if (data.series && data.series.length > 0) {
        const checkpointData = [];
        for (const seriesItem of data.series) {
          for (const point of seriesItem.points) {
            checkpointData.push({
              aiSessionId: sessionId,
              timestamp: new Date(point.timestamp),
              snapshot_json: {
                model: seriesItem.model,
                ...point.metrics
              }
            });
          }
        }
        
        if (checkpointData.length > 0) {
          await tx.aiCheckpoint.createMany({
            data: checkpointData,
            skipDuplicates: true
          });
          console.log(`[AI Finalize] Session ${sessionId}: series=${data.series?.length || 0}, checkpoints=${checkpointData.length}`);
        }
      }
      
      // 5. 创建附件记录
      if (data.attachments && data.attachments.length > 0) {
        const attachmentData = data.attachments.map((attachment: any) => ({
          aiSessionId: sessionId,
          type: attachment.type.toUpperCase() as any,
          path: attachment.path,
          sha256: attachment.sha256,
          size: attachment.size
        }));
        
        await tx.aiAttachment.createMany({
          data: attachmentData,
          skipDuplicates: true
        });
      }
      
      // 6. 记录幂等性
      await tx.aiFinalizeIdemp.create({
        data: {
          aiSessionId: sessionId,
          idempotency_key: idempotencyKey
        }
      });
    });
    
    sendResponse(res, 0, 'ok', { ack: true, session_id: sessionId });
    
  } catch (error) {
    console.error('Finalize error:', error);
    // 使用 Prisma 错误码判断唯一性冲突
    if ((error as any)?.code === 'P2002') {
      sendResponse(res, ERROR_CODES.DUPLICATE_REQUEST, '重复提交');
      return;
    }
    
    sendResponse(res, ERROR_CODES.STORAGE_ERROR, '后端存储不可用');
  }
};

/**
 * 保存AI检查点数据
 */
export const saveAICheckpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.session_id;
    
    const validation = validateCheckpointRequest(req.body);
    if (!validation.valid) {
      sendResponse(res, ERROR_CODES.PARAM_ERROR, validation.error || 'Validation failed');
      return;
    }
    
    const data = req.body;
    
    // 检查会话是否存在
    const session = await prisma.aiSession.findUnique({
      where: { id: sessionId }
    });
    
    if (!session) {
      sendResponse(res, ERROR_CODES.SESSION_NOT_FOUND, '会话不存在 / 状态非法');
      return;
    }
    
    // 更新或创建检查点
    await prisma.aiCheckpoint.upsert({
      where: {
        aiSessionId_timestamp: {
          aiSessionId: sessionId,
          timestamp: new Date(data.timestamp)
        }
      },
      update: {
        snapshot_json: data.snapshot
      },
      create: {
        aiSessionId: sessionId,
        timestamp: new Date(data.timestamp),
        snapshot_json: data.snapshot
      }
    });
    
    console.log(`[AI Checkpoint] Session ${sessionId}: checkpoint saved at ${data.timestamp}`);
    sendResponse(res, 0, 'ok', { accepted: true });
    
  } catch (error) {
    console.error('Checkpoint error:', error);
    sendResponse(res, ERROR_CODES.STORAGE_ERROR, '后端存储不可用');
  }
};

/**
 * 获取AI会话详情（调试用）
 */
export const getAISession = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.session_id;
    
    const session = await prisma.aiSession.findUnique({
      where: { id: sessionId },
      include: {
        aggregates: true,
        anomalies: true,
        checkpoints: {
          orderBy: { timestamp: 'asc' },
          take: 100
        },
        attachments: true
      }
    });
    
    if (!session) {
      sendResponse(res, ERROR_CODES.SESSION_NOT_FOUND, '会话不存在');
      return;
    }
    
    sendResponse(res, 0, 'ok', session);
    
  } catch (error) {
    console.error('Get session error:', error);
    sendResponse(res, ERROR_CODES.STORAGE_ERROR, '后端存储不可用');
  }
};
