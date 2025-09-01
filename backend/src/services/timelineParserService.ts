/**
 * Timeline Parser Service
 * 解析前端提交的时间线数据，生成结构化的答题记录和行为事件
 */

import { Prisma, QuestionActionType } from '@prisma/client';
import prisma from '../utils/database';

// 时间线事件接口
interface TimelineEvent {
  type: string;
  question_id: string;
  timestamp: string; // ISO8601格式
  payload?: {
    option_before?: string;
    option_after?: string;
    source?: 'click' | 'voice';
    from?: string;
    to?: string;
    [key: string]: any;
  };
}

// 解析后的题目响应数据
interface ParsedQuestionResponse {
  questionId: string;
  questionOrder: number;
  responseValue: string;
  responseScore?: number;
  questionDisplayedAt?: Date;
  responseSubmittedAt: Date;
  timeToAnswerSeconds?: number;
  selectedOptions?: Set<string>; // 用于多选题的选项集合
}

// 解析时间线数据的主要函数
export async function parseTimelineData(
  timelineData: TimelineEvent[],
  examResultId: string
): Promise<{
  questionResponses: ParsedQuestionResponse[];
  actionEvents: Prisma.QuestionActionEventCreateInput[];
}> {
  const questionResponseMap = new Map<string, ParsedQuestionResponse>();
  const actionEvents: Prisma.QuestionActionEventCreateInput[] = [];
  
  // 获取考试结果信息以获取题目顺序
  const examResult = await prisma.examResult.findUnique({
    where: { id: examResultId },
    include: {
      exam: {
        select: { questionIdsSnapshot: true }
      }
    }
  });
  
  if (!examResult || !examResult.exam) {
    throw new Error('考试结果不存在');
  }
  
  const questionIds = examResult.exam.questionIdsSnapshot as string[];
  const questionOrderMap = new Map<string, number>();
  questionIds.forEach((qId, index) => {
    questionOrderMap.set(qId, index + 1);
  });
  
  // 按时间戳排序事件
  const sortedEvents = timelineData.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  // 处理每个事件
  for (const event of sortedEvents) {
    const questionId = event.question_id;
    const timestamp = new Date(event.timestamp);
    const questionOrder = questionOrderMap.get(questionId) || 0;
    
    // 创建行为事件记录
    const actionEvent: Prisma.QuestionActionEventCreateInput = {
      examResult: { connect: { id: examResultId } },
      question: { connect: { id: questionId } },
      event_type: mapEventTypeToEnum(event.type),
      payload_json: event.payload || {},
      occurred_at: timestamp
    };
    
    actionEvents.push(actionEvent);
    
    // 处理题目响应数据
    switch (event.type) {
      case 'DISPLAY':
        // 题目首次显示
        if (!questionResponseMap.has(questionId)) {
          questionResponseMap.set(questionId, {
            questionId,
            questionOrder,
            responseValue: '', // 初始为空
            questionDisplayedAt: timestamp,
            responseSubmittedAt: timestamp // 临时设置，后续会被更新
          });
        } else {
          // 更新显示时间（如果之前没有设置）
          const response = questionResponseMap.get(questionId)!;
          if (!response.questionDisplayedAt) {
            response.questionDisplayedAt = timestamp;
          }
        }
        break;
        
      case 'SELECT':
        // 选择选项（多选题需要添加到集合）
        const selectOption = event.payload?.option_after;
        if (selectOption) {
          if (!questionResponseMap.has(questionId)) {
            questionResponseMap.set(questionId, {
              questionId,
              questionOrder,
              responseValue: selectOption,
              responseSubmittedAt: timestamp,
              selectedOptions: new Set([selectOption]) // 维护选项集合
            });
          } else {
            const response = questionResponseMap.get(questionId)!;
            // 确保selectedOptions集合存在
            if (!response.selectedOptions) {
              response.selectedOptions = new Set(response.responseValue ? response.responseValue.split(',') : []);
            }
            // 添加选项到集合
            response.selectedOptions.add(selectOption);
            // 转换为CSV字符串
            response.responseValue = Array.from(response.selectedOptions).join(',');
            response.responseSubmittedAt = timestamp;
            
            // 计算作答时间（如果有显示时间）
            if (response.questionDisplayedAt) {
              response.timeToAnswerSeconds = Math.floor(
                (timestamp.getTime() - response.questionDisplayedAt.getTime()) / 1000
              );
            }
          }
        }
        break;
        
      case 'DESELECT':
        // 取消选择（多选题从集合中移除）
        const deselectOption = event.payload?.option_before || event.payload?.option_after;
        if (deselectOption && questionResponseMap.has(questionId)) {
          const response = questionResponseMap.get(questionId)!;
          // 确保selectedOptions集合存在
          if (!response.selectedOptions) {
            response.selectedOptions = new Set(response.responseValue ? response.responseValue.split(',') : []);
          }
          // 从集合中移除选项
          response.selectedOptions.delete(deselectOption);
          // 转换为CSV字符串
          response.responseValue = Array.from(response.selectedOptions).join(',');
          response.responseSubmittedAt = timestamp;
        }
        break;
        
      case 'CHANGE':
        // 更改答案（单选题）
        const changeOption = event.payload?.option_after;
        if (changeOption) {
          if (!questionResponseMap.has(questionId)) {
            questionResponseMap.set(questionId, {
              questionId,
              questionOrder,
              responseValue: changeOption,
              responseSubmittedAt: timestamp
            });
          } else {
            const response = questionResponseMap.get(questionId)!;
            response.responseValue = changeOption;
            response.responseSubmittedAt = timestamp;
            
            // 计算作答时间（如果有显示时间）
            if (response.questionDisplayedAt) {
              response.timeToAnswerSeconds = Math.floor(
                (timestamp.getTime() - response.questionDisplayedAt.getTime()) / 1000
              );
            }
          }
        }
        break;
        
      case 'NAVIGATE':
        // 导航事件不直接影响答案，但记录行为
        break;
        
      case 'FOCUS':
      case 'BLUR':
        // 焦点事件不直接影响答案，但记录行为
        break;
    }
  }
  
  // 转换为数组
  const questionResponses = Array.from(questionResponseMap.values()).filter(
    response => response.responseValue !== '' // 过滤掉没有答案的题目
  );
  
  return {
    questionResponses,
    actionEvents
  };
}

// 映射事件类型到枚举
function mapEventTypeToEnum(eventType: string): QuestionActionType {
  switch (eventType.toUpperCase()) {
    case 'DISPLAY': return 'DISPLAY';
    case 'SELECT': return 'SELECT';
    case 'DESELECT': return 'DESELECT';
    case 'CHANGE': return 'CHANGE';
    case 'NAVIGATE': return 'NAVIGATE';
    case 'FOCUS': return 'FOCUS';
    case 'BLUR': return 'BLUR';
    default: return 'SELECT'; // 默认值
  }
}

// 批量创建或更新题目响应
export async function upsertQuestionResponses(
  examResultId: string,
  questionResponses: ParsedQuestionResponse[]
): Promise<void> {
  await prisma.$transaction(async (tx: any) => {
    for (const response of questionResponses) {
      await tx.questionResponse.upsert({
        where: {
          examResultId_questionId: {
            examResultId,
            questionId: response.questionId
          }
        },
        update: {
          responseValue: response.responseValue,
          responseScore: response.responseScore ?? null,
          questionDisplayedAt: response.questionDisplayedAt ?? null,
          responseSubmittedAt: response.responseSubmittedAt,
          timeToAnswerSeconds: response.timeToAnswerSeconds ?? null
        },
        create: {
          examResultId,
          questionId: response.questionId,
          questionOrder: response.questionOrder,
          responseValue: response.responseValue,
          responseScore: response.responseScore ?? null,
          questionDisplayedAt: response.questionDisplayedAt ?? null,
          responseSubmittedAt: response.responseSubmittedAt,
          timeToAnswerSeconds: response.timeToAnswerSeconds ?? null
        }
      });
    }
  });
}

// 批量创建行为事件
export async function createActionEvents(
  actionEvents: Prisma.QuestionActionEventCreateInput[]
): Promise<void> {
  if (actionEvents.length === 0) return;
  
  // 分批创建，避免单次创建过多记录
  const batchSize = 100;
  for (let i = 0; i < actionEvents.length; i += batchSize) {
    const batch = actionEvents.slice(i, i + batchSize);
    await prisma.questionActionEvent.createMany({
      data: batch.map(event => ({
        examResultId: (event.examResult as any).connect.id,
        questionId: (event.question as any).connect.id,
        event_type: event.event_type,
        payload_json: event.payload_json ?? Prisma.DbNull,
        occurred_at: event.occurred_at
      })),
      skipDuplicates: true
    });
  }
}

// 完整的时间线处理流程
export async function processTimelineData(
  examResultId: string,
  timelineData: TimelineEvent[]
): Promise<{
  processedResponses: number;
  processedEvents: number;
}> {
  const { questionResponses, actionEvents } = await parseTimelineData(timelineData, examResultId);
  
  // 并行执行两个操作
  await Promise.all([
    upsertQuestionResponses(examResultId, questionResponses),
    createActionEvents(actionEvents)
  ]);
  
  return {
    processedResponses: questionResponses.length,
    processedEvents: actionEvents.length
  };
}