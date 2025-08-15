import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { VerifyExamPasswordRequest, SubmitExamRequest, ExamStatus } from '../types';
import prisma from '../utils/database';
// import cache, { CacheManager } from '../utils/cache'; // 已移除缓存

// 获取公开考试信息
export const getPublicExam = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicUuid } = req.params;
    const { password } = req.query;

    // 缓存已移除，直接查询数据库
    const exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        password: true,
        startTime: true,
        endTime: true,
        shuffleQuestions: true,
        status: true,
        questionIdsSnapshot: true,
        paper: {
          select: {
            description: true,
          },
        },
      },
    });

    if (!exam) {
      sendError(res, '考试不存在或已过期', 404);
      return;
    }

    if (exam.status !== ExamStatus.PUBLISHED) {
      sendError(res, '考试尚未发布', 403);
      return;
    }

    // 检查考试时间
    const now = new Date();
    if (exam.startTime && now < exam.startTime) {
      sendError(res, '考试尚未开始', 403);
      return;
    }
    if (exam.endTime && now > exam.endTime) {
      sendError(res, '考试已结束', 403);
      return;
    }

    // 检查密码
    const passwordRequired = !!exam.password;
    const passwordCorrect = !passwordRequired || password === exam.password;

    if (passwordRequired && !passwordCorrect) {
      // 需要密码但密码错误或未提供
      sendSuccess(res, {
        title: exam.title,
        description: exam.paper.description,
        duration_minutes: exam.durationMinutes,
        password_required: true,
      });
      return;
    }

    // 获取题目详情
    const questionIds = exam.questionIdsSnapshot as string[];
    const questions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
      },
    });

    // 按快照中的顺序排序题目
    const orderedQuestions = questionIds.map(id => 
      questions.find(q => q.id === id)
    ).filter(Boolean);

    // 格式化题目数据
    let formattedQuestions = orderedQuestions.map(question => ({
      id: question!.id,
      question_order: question!.questionOrder,
      title: question!.title,
      options: question!.options,
      question_type: question!.questionType,
      display_condition: question!.displayCondition,
    }));

    // 如果需要打乱题目顺序
    if (exam.shuffleQuestions) {
      formattedQuestions = shuffleArray(formattedQuestions);
    }

    sendSuccess(res, {
      title: exam.title,
      description: exam.paper.description,
      duration_minutes: exam.durationMinutes,
      password_required: false,
      questions: formattedQuestions,
    });
  } catch (error) {
    console.error('获取公开考试信息错误:', error);
    sendError(res, '获取考试信息失败', 500);
  }
};

// 验证考试密码
export const verifyExamPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicUuid } = req.params;
    const { password }: VerifyExamPasswordRequest = req.body;

    const exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: {
        password: true,
        status: true,
      },
    });

    if (!exam) {
      sendError(res, '考试不存在', 404);
      return;
    }

    if (exam.status !== ExamStatus.PUBLISHED) {
      sendError(res, '考试尚未发布', 403);
      return;
    }

    if (!exam.password) {
      sendError(res, '此考试无需密码', 400);
      return;
    }

    if (password !== exam.password) {
      sendError(res, '密码错误', 401);
      return;
    }

    sendSuccess(res, {
      message: '验证成功',
    });
  } catch (error) {
    console.error('验证考试密码错误:', error);
    sendError(res, '验证密码失败', 500);
  }
};

// 检查重复提交
export const checkDuplicateSubmission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicUuid } = req.params;
    const { student_id } = req.body;

    if (!student_id) {
      sendError(res, '学号不能为空', 400);
      return;
    }

    // 获取考试信息
    const exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: { id: true, status: true },
    });

    if (!exam) {
      sendError(res, '考试不存在', 404);
      return;
    }

    if (exam.status !== ExamStatus.PUBLISHED) {
      sendError(res, '考试尚未发布', 403);
      return;
    }

    // 检查是否已经提交
    const existingResult = await prisma.examResult.findUnique({
      where: {
        examId_participantId: {
          examId: exam.id,
          participantId: student_id,
        },
      },
    });

    if (existingResult) {
      sendError(res, '您已经提交过本次考试，请勿重复提交。', 409);
      return;
    }

    // 没有重复提交
    sendSuccess(res, { canSubmit: true });
  } catch (error) {
    console.error('检查重复提交失败:', error);
    sendError(res, '检查重复提交失败', 500);
  }
};

// 提交考试答案
export const submitExamAnswers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { publicUuid } = req.params;
    const { 
      student_id, 
      student_name, 
      answers, 
      started_at,
      // AI功能相关数据
      emotion_analysis_id,
      timeline_data,
      voice_interactions,
      device_test_results
    }: SubmitExamRequest = req.body;

    // 参数验证
    if (!student_id || !student_name || !answers) {
      sendError(res, '学号、姓名和答案不能为空', 400);
      return;
    }

    // 获取考试信息
    const exam = await prisma.exam.findUnique({
      where: { publicUuid },
      select: {
        id: true,
        paperId: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
      },
    });

    if (!exam) {
      sendError(res, '考试不存在', 404);
      return;
    }

    if (exam.status !== ExamStatus.PUBLISHED) {
      sendError(res, '考试尚未发布', 403);
      return;
    }

    // 检查考试时间
    const now = new Date();
    if (exam.startTime && now < exam.startTime) {
      sendError(res, '考试尚未开始', 403);
      return;
    }
    if (exam.endTime && now > exam.endTime) {
      sendError(res, '考试已结束', 403);
      return;
    }

    // 获取客户端IP地址
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    // 获取题目信息用于计分
    const questions = await prisma.question.findMany({
      where: {
        paperId: exam.paperId,
      },
      orderBy: {
        questionOrder: 'asc',
      },
    });

    // 计算得分（智能计分，支持选项分数）
    const score = calculateScore(answers, questions);

    try {
      // 创建考试结果
      const result = await prisma.examResult.create({
        data: {
          examId: exam.id,
          participantId: student_id,
          participantName: student_name,
          answers: answers,
          score,
          ipAddress,
          startedAt: started_at ? new Date(started_at) : now, // 使用前端传递的精确开始时间
          // AI功能相关数据
          emotionAnalysisId: emotion_analysis_id || null,
          timelineData: timeline_data || null,
          voiceInteractions: voice_interactions || null,
          deviceTestResults: device_test_results || null,
        },
      });

      sendSuccess(res, {
        result_id: result.id,
        score,
        message: '提交成功！感谢您的参与。',
        submitted_at: result.submittedAt,
      }, 201);

      console.log(`✅ 学生 ${student_name}(${student_id}) 提交了考试 ${exam.title}`);
    } catch (error: any) {
      // 处理重复提交错误
      if (error.code === 'P2002') {
        sendError(res, '您已提交过本次考试，请勿重复提交。', 409);
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('提交考试答案错误:', error);
    sendError(res, '提交答案失败', 500);
  }
};

// 工具函数：打乱数组顺序
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 工具函数：智能计分（支持选项分数）
function calculateScore(answers: Record<string, string>, questions: any[]): number {
  if (!questions || questions.length === 0) return 0;
  
  let totalScore = 0;
  let scoredQuestionCount = 0;
  
  for (const question of questions) {
    // 检查题目是否计分
    if (question.is_scored === false) {
      continue; // 跳过不计分的题目
    }
    
    const answer = answers[question.id];
    if (!answer || answer.trim() === '') {
      continue; // 跳过未回答的题目
    }
    
    // 获取题目选项配置
    const options = question.options || {};
    let questionScore = 0;
    
    // 检查选项是否有分数配置
    let hasOptionScores = false;
    for (const [, optionValue] of Object.entries(options)) {
      if (typeof optionValue === 'object' && (optionValue as any).score !== undefined) {
        hasOptionScores = true;
        break;
      }
    }
    
    if (hasOptionScores) {
      // 基于选项分数计分
      if (question.question_type === 'multiple_choice') {
        // 多选题：答案可能是逗号分隔的多个选项
        const selectedOptions = answer.split(',').map(opt => opt.trim());
        for (const selectedOption of selectedOptions) {
          const optionData = options[selectedOption];
          if (typeof optionData === 'object' && (optionData as any).score !== undefined) {
            questionScore += (optionData as any).score;
          }
        }
      } else {
        // 单选题或文本题
        const optionData = options[answer];
        if (typeof optionData === 'object' && (optionData as any).score !== undefined) {
          questionScore = (optionData as any).score;
        }
      }
      
      totalScore += questionScore;
      scoredQuestionCount++;
    } else {
      // 传统计分：回答即得分（向后兼容）
      scoredQuestionCount++;
    }
  }
  
  // 如果没有计分题目，返回0
  if (scoredQuestionCount === 0) {
    return 0;
  }
  
  // 如果有选项分数，直接返回累计分数；否则按传统方式计算
  if (totalScore > 0) {
    return totalScore;
  } else {
    // 传统计分方式：100分平均分配
    const scorePerQuestion = Math.floor(100 / scoredQuestionCount);
    return Math.min(100, scoredQuestionCount * scorePerQuestion);
  }
}