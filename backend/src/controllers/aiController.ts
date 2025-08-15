import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import prisma from '../utils/database';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

// 情绪分析WebSocket会话管理
interface EmotionSessionData {
  sessionId: string;
  examId: string;
  studentId: string;
  ws?: WebSocket;
  startTime: Date;
  frameCount: number;
  dataPoints: any[];
  audioOnly: boolean;
  audioLevel: number;
  lastActivity: Date;
  connectionId: string;
  resourceUsage: {
    memoryUsed: number;
    cpuTime: number;
    framesSent: number;
  };
}

const emotionSessions = new Map<string, EmotionSessionData>();

// 并发管理配置
const CONCURRENT_CONFIG = {
  maxConcurrentSessions: 50,
  maxSessionsPerExam: 20,
  sessionTimeoutMs: 30 * 60 * 1000, // 30分钟超时
  cleanupIntervalMs: 60 * 1000, // 1分钟清理间隔
  memoryLimitMB: 100, // 每个会话内存限制100MB
};

// 资源监控和清理
let cleanupInterval: NodeJS.Timeout;

// 并发控制函数
const getConcurrentSessionCount = (): number => {
  return emotionSessions.size;
};

const getSessionCountForExam = (examId: string): number => {
  let count = 0;
  for (const session of emotionSessions.values()) {
    if (session.examId === examId) {
      count++;
    }
  }
  return count;
};

const findExistingSession = (examId: string, studentId: string): EmotionSessionData | null => {
  for (const session of emotionSessions.values()) {
    if (session.examId === examId && session.studentId === studentId) {
      return session;
    }
  }
  return null;
};

const cleanupExpiredSessions = (): void => {
  const now = new Date();
  const sessionsToCleanup: string[] = [];

  for (const [sessionId, session] of emotionSessions.entries()) {
    // 检查超时
    const inactiveTime = now.getTime() - session.lastActivity.getTime();
    if (inactiveTime > CONCURRENT_CONFIG.sessionTimeoutMs) {
      sessionsToCleanup.push(sessionId);
      continue;
    }

    // 检查内存使用
    if (session.resourceUsage.memoryUsed > CONCURRENT_CONFIG.memoryLimitMB * 1024 * 1024) {
      console.warn(`⚠️ 会话 ${sessionId} 内存使用超限，强制清理`);
      sessionsToCleanup.push(sessionId);
    }
  }

  // 执行清理
  for (const sessionId of sessionsToCleanup) {
    const session = emotionSessions.get(sessionId);
    if (session) {
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          type: 'session_timeout',
          message: '会话已超时，连接将关闭'
        }));
        session.ws.close(1000, 'Session timeout');
      }
      emotionSessions.delete(sessionId);
      console.log(`🧹 清理过期会话: ${sessionId} (考试: ${session.examId}, 学生: ${session.studentId})`);
    }
  }

  if (sessionsToCleanup.length > 0) {
    console.log(`🧹 清理了 ${sessionsToCleanup.length} 个过期会话，当前活跃会话: ${emotionSessions.size}`);
  }
};

const startResourceMonitoring = (): void => {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    cleanupExpiredSessions();
  }, CONCURRENT_CONFIG.cleanupIntervalMs);

  console.log('✅ 启动资源监控，清理间隔:', CONCURRENT_CONFIG.cleanupIntervalMs / 1000, '秒');
};

const stopResourceMonitoring = (): void => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null as any;
    console.log('🛑 停止资源监控');
  }
};

// 创建情绪分析会话
export const createEmotionSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examId, studentId } = req.body;

    if (!examId || !studentId) {
      sendError(res, '考试ID和学生ID不能为空', 400);
      return;
    }

    // 检查考试是否存在
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, status: true, title: true }
    });

    if (!exam) {
      sendError(res, '考试不存在', 404);
      return;
    }

    // 生成会话ID
    const sessionId = `emotion_${Date.now()}_${uuidv4().substring(0, 8)}`;
    
    // 创建会话记录
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: EmotionSessionData = {
      sessionId,
      examId,
      studentId,
      startTime: new Date(),
      frameCount: 0,
      dataPoints: [],
      audioOnly: false,              // 默认视频模式
      audioLevel: 0,                 // 初始音频级别
      lastActivity: new Date(),      // 当前时间戳
      connectionId,                  // 唯一连接标识符
      resourceUsage: {               // 初始资源使用统计
        memoryUsed: 0,
        cpuTime: 0,
        framesSent: 0,
      },
    };

    emotionSessions.set(sessionId, session);

    // WebSocket URL（实际部署时应该是真实的情绪分析服务地址）
    const websocketUrl = `ws://localhost:3001/api/emotion/stream?sessionId=${sessionId}`;

    sendSuccess(res, {
      sessionId,
      websocketUrl,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1小时后过期
    }, 201);

    console.log(`✅ 创建情绪分析会话: ${sessionId} (考试: ${exam.title})`);
  } catch (error) {
    console.error('创建情绪分析会话失败:', error);
    sendError(res, '创建情绪分析会话失败', 500);
  }
};

// 结束情绪分析会话
export const endEmotionSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;

    const session = emotionSessions.get(sessionId);
    if (!session) {
      sendError(res, '会话不存在或已过期', 404);
      return;
    }

    // 计算会话统计
    const endTime = new Date();
    const totalDuration = endTime.getTime() - session.startTime.getTime();

    // 创建情绪分析记录
    const analysisId = `analysis_${Date.now()}_${uuidv4().substring(0, 8)}`;
    
    try {
      // 这里可以调用实际的情绪分析API来获取最终结果
      // 暂时使用模拟数据
      const emotionSummary = {
        averageEmotions: {
          happiness: Math.random() * 0.6 + 0.2,
          sadness: Math.random() * 0.3,
          anger: Math.random() * 0.2,
          fear: Math.random() * 0.3,
          surprise: Math.random() * 0.4,
          disgust: Math.random() * 0.1,
        },
        engagement: Math.random() * 0.4 + 0.6,
        stress: Math.random() * 0.5 + 0.2,
        stability: Math.random() * 0.3 + 0.7,
      };

      // 保存到数据库（注意：这里需要先有ExamResult才能创建EmotionAnalysis）
      // 实际实现中，这个记录会在学生提交考试时与EmotionAnalysis关联
      
      console.log(`📊 情绪分析会话结束: ${sessionId}`, {
        duration: totalDuration,
        frames: session.frameCount,
        dataPoints: session.dataPoints.length,
        summary: emotionSummary,
      });

      // 清理会话
      emotionSessions.delete(sessionId);

      sendSuccess(res, {
        analysisId,
        summary: emotionSummary,
        statistics: {
          totalDuration,
          framesSent: session.frameCount,
          dataPoints: session.dataPoints.length,
          startTime: session.startTime.toISOString(),
          endTime: endTime.toISOString(),
        }
      });

    } catch (dbError) {
      console.error('保存情绪分析数据失败:', dbError);
      // 即使数据库保存失败，也返回会话结束成功
      emotionSessions.delete(sessionId);
      sendSuccess(res, {
        analysisId,
        message: '会话已结束，但数据保存可能不完整',
      });
    }

  } catch (error) {
    console.error('结束情绪分析会话失败:', error);
    sendError(res, '结束情绪分析会话失败', 500);
  }
};

// 生成AI报告
export const generateReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      examResultId,
      studentAnswers,
      emotionAnalysisId,
      timelineData,
      reportType = 'basic',
      language = 'zh-CN'
    } = req.body;

    if (!examResultId || !studentAnswers) {
      sendError(res, '考试结果ID和学生答案不能为空', 400);
      return;
    }

    // 检查考试结果是否存在
    const examResult = await prisma.examResult.findUnique({
      where: { id: examResultId },
      include: {
        exam: {
          include: {
            paper: {
              include: {
                questions: true
              }
            }
          }
        }
      }
    });

    if (!examResult) {
      sendError(res, '考试结果不存在', 404);
      return;
    }

    // 创建AI报告记录
    const reportId = `report_${Date.now()}_${uuidv4().substring(0, 8)}`;
    
    await prisma.aIReport.create({
      data: {
        id: reportId,
        examResultId,
        reportType,
        language,
        status: 'generating',
        progress: 0,
        aiProvider: 'openai', // 或其他AI提供商
        aiModel: 'gpt-4',
      }
    });

    // 异步生成报告
    generateReportAsync(reportId, examResult, studentAnswers, emotionAnalysisId, timelineData, reportType);

    sendSuccess(res, {
      reportId,
      status: 'generating',
      estimatedTime: 30, // 预计30秒完成
      progress: 0,
    }, 201);

    console.log(`📝 开始生成AI报告: ${reportId} (类型: ${reportType})`);
  } catch (error) {
    console.error('生成AI报告失败:', error);
    sendError(res, '生成AI报告失败', 500);
  }
};

// 异步生成报告
async function generateReportAsync(
  reportId: string,
  examResult: any,
  studentAnswers: any,
  emotionAnalysisId?: string,
  timelineData?: any,
  _reportType: string = 'basic'
) {
  try {
    // 模拟报告生成过程
    const steps = [
      { progress: 20, message: '分析学生答案...' },
      { progress: 40, message: '处理情绪数据...' },
      { progress: 60, message: '生成分析报告...' },
      { progress: 80, message: '格式化报告内容...' },
      { progress: 100, message: '报告生成完成' },
    ];

    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟处理时间
      
      await prisma.aIReport.update({
        where: { id: reportId },
        data: { progress: step.progress }
      });
      
      console.log(`📊 报告生成进度: ${reportId} - ${step.progress}% (${step.message})`);
    }

    // 生成报告内容（这里是模拟内容，实际应该调用AI API）
    const reportContent = generateMockReportContent(examResult, studentAnswers, emotionAnalysisId, timelineData);
    
    // 生成下载链接（实际应该生成PDF文件并上传到存储服务）
    const downloadUrl = `/api/ai/report/${reportId}/download`;
    const filename = `心理测评报告_${examResult.participantName}_${new Date().toISOString().split('T')[0]}.pdf`;

    // 更新报告状态
    await prisma.aIReport.update({
      where: { id: reportId },
      data: {
        status: 'completed',
        progress: 100,
        content: reportContent,
        downloadUrl,
        filename,
        fileFormat: 'pdf',
        fileSize: Math.floor(Math.random() * 500000) + 100000, // 模拟文件大小
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
        completedAt: new Date(),
        generationTime: 10000, // 模拟生成时间10秒
      }
    });

    console.log(`✅ AI报告生成完成: ${reportId}`);
  } catch (error) {
    console.error(`❌ AI报告生成失败: ${reportId}`, error);
    
    // 更新报告状态为失败
    await prisma.aIReport.update({
      where: { id: reportId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : '报告生成失败',
      }
    });
  }
}

// 生成模拟报告内容
function generateMockReportContent(examResult: any, studentAnswers: any, emotionAnalysisId?: string, timelineData?: any) {
  const answeredQuestions = Object.keys(studentAnswers).length;
  const totalQuestions = examResult.exam.paper.questions.length;
  const completionRate = (answeredQuestions / totalQuestions * 100).toFixed(1);

  return {
    summary: `${examResult.participantName}同学完成了${examResult.exam.title}测试，回答了${answeredQuestions}/${totalQuestions}道题目，完成率${completionRate}%。`,
    analysis: "根据答题情况分析，该学生在测试中表现出良好的专注度和思考能力。答题时间分布合理，显示出对题目的认真思考。",
    recommendations: [
      "建议保持当前的学习状态和心理健康水平",
      "可以适当增加一些放松和减压活动",
      "建议定期进行自我反思和心理调适"
    ],
    emotionInsights: emotionAnalysisId ? "情绪分析显示整体情绪状态稳定，专注度较高，压力水平在正常范围内。" : "未进行情绪分析",
    timeAnalysis: timelineData ? `平均每题用时${Math.round((timelineData.totalDuration || 0) / totalQuestions / 1000)}秒，答题节奏适中。` : "未记录详细时间数据",
    score: examResult.score,
    charts: [
      {
        type: 'pie',
        title: '答题完成度',
        data: [
          { name: '已完成', value: answeredQuestions },
          { name: '未完成', value: totalQuestions - answeredQuestions }
        ]
      }
    ]
  };
}

// 查询报告状态
export const getReportStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportId } = req.params;

    const report = await prisma.aIReport.findUnique({
      where: { id: reportId },
      include: {
        examResult: {
          select: {
            participantName: true,
            exam: {
              select: { title: true }
            }
          }
        }
      }
    });

    if (!report) {
      sendError(res, '报告不存在', 404);
      return;
    }

    sendSuccess(res, {
      reportId: report.id,
      status: report.status,
      progress: report.progress,
      content: report.content,
      error: report.error,
      generatedAt: report.completedAt?.toISOString(),
      downloadUrl: report.downloadUrl,
      examTitle: report.examResult.exam.title,
      studentName: report.examResult.participantName,
    });
  } catch (error) {
    console.error('查询报告状态失败:', error);
    sendError(res, '查询报告状态失败', 500);
  }
};

// 下载报告
export const downloadReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportId } = req.params;
    const { format = 'pdf' } = req.query;

    const report = await prisma.aIReport.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      sendError(res, '报告不存在', 404);
      return;
    }

    if (report.status !== 'completed') {
      sendError(res, '报告尚未完成生成', 400);
      return;
    }

    // 检查是否过期
    if (report.expiresAt && new Date() > report.expiresAt) {
      sendError(res, '下载链接已过期', 410);
      return;
    }

    // 实际实现中，这里应该从文件存储服务获取文件
    // 这里返回模拟的下载信息
    sendSuccess(res, {
      downloadUrl: `/files/reports/${reportId}.${format}`,
      filename: report.filename || `report_${reportId}.${format}`,
      fileSize: report.fileSize || 0,
      format: format,
      expiresAt: report.expiresAt?.toISOString(),
    });
  } catch (error) {
    console.error('下载报告失败:', error);
    sendError(res, '下载报告失败', 500);
  }
};

// 获取报告列表
export const getReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const { examResultId } = req.query;

    if (!examResultId) {
      sendError(res, '考试结果ID不能为空', 400);
      return;
    }

    const reports = await prisma.aIReport.findMany({
      where: { examResultId: examResultId as string },
      select: {
        id: true,
        reportType: true,
        status: true,
        progress: true,
        downloadUrl: true,
        filename: true,
        createdAt: true,
        completedAt: true,
        error: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    sendSuccess(res, reports.map((report: any) => ({
      reportId: report.id,
      type: report.reportType,
      status: report.status,
      progress: report.progress,
      createdAt: report.createdAt.toISOString(),
      completedAt: report.completedAt?.toISOString(),
      downloadUrl: report.downloadUrl,
      filename: report.filename,
      error: report.error,
    })));
  } catch (error) {
    console.error('获取报告列表失败:', error);
    sendError(res, '获取报告列表失败', 500);
  }
};

// WebSocket处理情绪分析数据流
export const handleEmotionWebSocket = (ws: WebSocket, req: any) => {
  // 启动资源监控（如果尚未启动）
  startResourceMonitoring();

  // 解析URL参数
  const url = new URL(req.url, 'http://localhost');
  const examId = url.searchParams.get('examId');
  const studentId = url.searchParams.get('studentId');
  const audioOnly = url.searchParams.get('audioOnly') === 'true';
  
  if (!examId || !studentId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: '缺少必要参数: examId 和 studentId'
    }));
    ws.close(1000, 'Missing required parameters');
    return;
  }

  // 并发控制检查
  const currentConcurrent = getConcurrentSessionCount();
  if (currentConcurrent >= CONCURRENT_CONFIG.maxConcurrentSessions) {
    ws.send(JSON.stringify({
      type: 'error',
      message: '服务器连接已满，请稍后重试'
    }));
    ws.close(1013, 'Server overloaded');
    return;
  }

  const examConcurrent = getSessionCountForExam(examId);
  if (examConcurrent >= CONCURRENT_CONFIG.maxSessionsPerExam) {
    ws.send(JSON.stringify({
      type: 'error',
      message: '该考试的并发连接已达上限，请稍后重试'
    }));
    ws.close(1013, 'Exam session limit reached');
    return;
  }

  // 检查是否存在相同学生的会话
  const existingSession = findExistingSession(examId, studentId);
  if (existingSession) {
    console.log(`🔄 学生 ${studentId} 在考试 ${examId} 中已有会话，关闭旧会话`);
    if (existingSession.ws && existingSession.ws.readyState === WebSocket.OPEN) {
      existingSession.ws.send(JSON.stringify({
        type: 'session_replaced',
        message: '新的连接已建立，当前连接将被关闭'
      }));
      existingSession.ws.close(1000, 'Session replaced');
    }
    emotionSessions.delete(existingSession.sessionId);
  }

  // 创建新会话
  const sessionId = `emotion_${Date.now()}_${uuidv4().substring(0, 8)}`;
  const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const session: EmotionSessionData = {
    sessionId,
    examId,
    studentId,
    ws,
    startTime: new Date(),
    frameCount: 0,
    dataPoints: [],
    audioOnly,
    audioLevel: 0,
    lastActivity: new Date(),
    connectionId,
    resourceUsage: {
      memoryUsed: 0,
      cpuTime: 0,
      framesSent: 0,
    }
  };

  emotionSessions.set(sessionId, session);

  console.log(`🔗 WebSocket连接建立: ${sessionId} (${audioOnly ? '🎤音频' : '📹视频'}模式) - 并发: ${currentConcurrent + 1}/${CONCURRENT_CONFIG.maxConcurrentSessions}`);

  ws.on('message', (data: Buffer) => {
    try {
      session.lastActivity = new Date();
      session.resourceUsage.framesSent++;
      
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'init':
          ws.send(JSON.stringify({
            type: 'connected',
            sessionId,
            audioOnly: session.audioOnly,
            connectionId: session.connectionId,
            concurrentSessions: getConcurrentSessionCount(),
            message: '情绪分析会话已建立'
          }));
          break;
          
        case 'video_frame':
          if (!session.audioOnly) {
            session.frameCount++;
            session.resourceUsage.memoryUsed += data.length;
            
            // 每5帧返回一次分析结果
            if (session.frameCount % 5 === 0) {
              const mockEmotionData = generateMockEmotionData(session.audioLevel, false);
              session.dataPoints.push(mockEmotionData);
              
              ws.send(JSON.stringify({
                type: 'emotion_data',
                payload: mockEmotionData
              }));
            }
          }
          break;

        case 'audio_data':
          if (session.audioOnly && message.data) {
            session.frameCount++;
            session.audioLevel = message.data.audioLevel || 0;
            session.resourceUsage.memoryUsed += JSON.stringify(message.data).length;
            
            // 每10次音频数据返回一次分析结果
            if (session.frameCount % 10 === 0) {
              const mockEmotionData = generateMockEmotionData(session.audioLevel, true);
              session.dataPoints.push(mockEmotionData);
              
              ws.send(JSON.stringify({
                type: 'emotion_data',
                payload: mockEmotionData
              }));
            }
          }
          break;
          
        case 'stop_analysis':
          const analysisId = `analysis_${Date.now()}_${sessionId.substring(0, 8)}`;
          ws.send(JSON.stringify({
            type: 'analysis_complete',
            analysisId,
            timestamp: Date.now(),
            summary: {
              totalFrames: session.frameCount,
              duration: Date.now() - session.startTime.getTime(),
              dataPoints: session.dataPoints.length,
              audioOnly: session.audioOnly,
              averageAudioLevel: session.audioLevel,
              resourceUsage: session.resourceUsage
            }
          }));
          break;

        default:
          console.warn(`未知消息类型: ${message.type}`);
      }
    } catch (error) {
      console.error('处理WebSocket消息失败:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: '处理消息失败'
      }));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket连接关闭: ${sessionId} (代码: ${code}, 原因: ${reason}) - 并发: ${getConcurrentSessionCount() - 1}/${CONCURRENT_CONFIG.maxConcurrentSessions}`);
    emotionSessions.delete(sessionId);
    
    // 如果没有活跃会话，停止资源监控
    if (emotionSessions.size === 0) {
      stopResourceMonitoring();
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket错误 ${sessionId}:`, error);
    emotionSessions.delete(sessionId);
  });

  // 发送连接建立确认
  ws.send(JSON.stringify({
    type: 'connection_established',
    sessionId,
    audioOnly,
    timestamp: Date.now()
  }));
};

// 生成模拟情绪数据
const generateMockEmotionData = (audioLevel: number, isAudioOnly: boolean) => {
  const baseEmotions: Record<string, number> = {
    happiness: 0.6,
    sadness: 0.2,
    anger: 0.1,
    fear: 0.15,
    surprise: 0.3,
    disgust: 0.05,
  };

  const emotions: Record<string, number> = {};
  
  // 基于音频级别调整情绪（适用于音频模式）
  if (isAudioOnly && audioLevel > 0) {
    const audioInfluence = Math.min(audioLevel / 100, 1);
    emotions.happiness = Math.max(0, Math.min(1, baseEmotions.happiness + audioInfluence * 0.3 + (Math.random() - 0.5) * 0.2));
    emotions.surprise = Math.max(0, Math.min(1, baseEmotions.surprise + audioInfluence * 0.2 + (Math.random() - 0.5) * 0.2));
    emotions.sadness = Math.max(0, Math.min(1, baseEmotions.sadness - audioInfluence * 0.1 + (Math.random() - 0.5) * 0.2));
    emotions.anger = Math.max(0, Math.min(1, baseEmotions.anger + (1 - audioInfluence) * 0.1 + (Math.random() - 0.5) * 0.1));
    emotions.fear = Math.max(0, Math.min(1, baseEmotions.fear - audioInfluence * 0.1 + (Math.random() - 0.5) * 0.2));
    emotions.disgust = Math.max(0, Math.min(1, baseEmotions.disgust + (Math.random() - 0.5) * 0.1));
  } else {
    // 标准情绪生成
    Object.keys(baseEmotions).forEach(emotion => {
      emotions[emotion] = Math.max(0, Math.min(1, baseEmotions[emotion] + (Math.random() - 0.5) * 0.3));
    });
  }

  const avgPositive = (emotions.happiness + emotions.surprise) / 2;
  const avgNegative = (emotions.sadness + emotions.anger + emotions.fear) / 3;
  
  const engagement = Math.max(0, Math.min(1, avgPositive + (isAudioOnly ? audioLevel / 200 : 0) + (Math.random() - 0.5) * 0.2));
  const stress = Math.max(0, Math.min(1, avgNegative - (isAudioOnly ? audioLevel / 300 : 0) + (Math.random() - 0.5) * 0.2));

  return {
    timestamp: Date.now(),
    emotions,
    engagement,
    stress,
  };
};

// 导出清理函数供服务器关闭时使用
export const cleanupEmotionSessions = () => {
  console.log(`🧹 清理所有情绪分析会话: ${emotionSessions.size} 个`);
  for (const [sessionId, session] of emotionSessions.entries()) {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({
        type: 'server_shutdown',
        message: '服务器正在关闭，连接将断开'
      }));
      session.ws.close(1001, 'Server shutdown');
    }
    console.log(`🔌 清理会话: ${sessionId} (考试: ${session.examId}, 学生: ${session.studentId})`);
  }
  emotionSessions.clear();
  stopResourceMonitoring();
};