import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../utils/response';
import { CreatePaperRequest } from '../types';
import prisma from '../utils/database';
// import cache, { CacheManager } from '../utils/cache'; // 已移除缓存

// 创建试卷
export const createPaper = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description }: CreatePaperRequest = req.body;
    const teacherId = req.teacher?.id;

    // 参数验证
    if (!title) {
      sendError(res, '试卷标题不能为空', 400);
      return;
    }

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 创建试卷
    const paper = await prisma.paper.create({
      data: {
        title,
        description: description || null,
        teacherId,
      },
      include: {
        teacher: {
          select: {
            name: true,
            teacherId: true,
          },
        },
        _count: {
          select: {
            questions: true,
          },
        },
      },
    });

    sendSuccess(res, {
      id: paper.id,
      title: paper.title,
      description: paper.description,
      teacher: paper.teacher,
      question_count: paper._count.questions,
      created_at: paper.createdAt,
      updated_at: paper.updatedAt,
    }, 201);

    console.log(`✅ 教师 ${paper.teacher.name} 创建试卷: ${paper.title}`);
  } catch (error: any) {
    console.error('创建试卷错误:', error);
    
    // 处理外键约束错误（教师不存在）
    if (error.code === 'P2003' && error.meta?.constraint === 'papers_teacher_id_fkey') {
      sendError(res, '认证失败：教师账号不存在，请重新登录', 403);
      return;
    }
    
    // 处理其他Prisma错误
    if (error.code) {
      sendError(res, `数据库操作失败: ${error.message}`, 400);
      return;
    }
    
    sendError(res, '创建试卷失败', 500);
  }
};

// 获取教师的所有试卷
export const getTeacherPapers = async (req: Request, res: Response): Promise<void> => {
  try {
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 缓存已移除，直接查询数据库

    const papers = await prisma.paper.findMany({
      where: { teacherId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            questions: true,
            exams: true,
          },
        },
      },
    });

    const formattedPapers = papers.map(paper => ({
      id: paper.id,
      title: paper.title,
      description: paper.description,
      question_count: paper._count.questions,
      exam_count: paper._count.exams,
      created_at: paper.createdAt,
      updated_at: paper.updatedAt,
    }));

    console.log(formattedPapers)
    sendSuccess(res, formattedPapers);
  } catch (error) {
    console.error('获取试卷列表错误:', error);
    sendError(res, '获取试卷列表失败', 500);
  }
};

// 获取单个试卷详情
export const getPaperById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 缓存已移除，直接查询数据库

    const paper = await prisma.paper.findFirst({
      where: {
        id: paperId,
        teacherId, // 确保只能查看自己的试卷
      },
      include: {
        questions: {
          orderBy: { questionOrder: 'asc' },
        },
        _count: {
          select: {
            exams: true,
          },
        },
      },
    });

    if (!paper) {
      sendError(res, '试卷不存在或无权限访问', 404);
      return;
    }

    // 解析JSON字段并格式化响应
    const formattedQuestions = paper.questions.map(question => ({
      id: question.id,
      question_order: question.questionOrder,
      title: question.title,
      options: question.options,
      question_type: question.questionType,
      display_condition: question.displayCondition,
      created_at: question.createdAt,
      updated_at: question.updatedAt,
    }));

    const paperDetail = {
      id: paper.id,
      title: paper.title,
      description: paper.description,
      exam_count: paper._count.exams,
      questions: formattedQuestions,
      created_at: paper.createdAt,
      updated_at: paper.updatedAt,
      teacher_id: teacherId, // 用于权限验证
    };

    
    sendSuccess(res, paperDetail);
  } catch (error) {
    console.error('获取试卷详情错误:', error);
    sendError(res, '获取试卷详情失败', 500);
  }
};

// 更新试卷
export const updatePaper = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const { title, description }: CreatePaperRequest = req.body;
    const teacherId = req.teacher?.id;

    if (!title) {
      sendError(res, '试卷标题不能为空', 400);
      return;
    }

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 检查试卷是否属于当前教师
    const existingPaper = await prisma.paper.findFirst({
      where: {
        id: paperId,
        teacherId,
      },
    });

    if (!existingPaper) {
      sendError(res, '试卷不存在或无权限修改', 404);
      return;
    }

    // 更新试卷
    const updatedPaper = await prisma.paper.update({
      where: { id: paperId },
      data: {
        title,
        description: description || null,
      },
      include: {
        _count: {
          select: {
            questions: true,
            exams: true,
          },
        },
      },
    });

    sendSuccess(res, {
      id: updatedPaper.id,
      title: updatedPaper.title,
      description: updatedPaper.description,
      question_count: updatedPaper._count.questions,
      exam_count: updatedPaper._count.exams,
      created_at: updatedPaper.createdAt,
      updated_at: updatedPaper.updatedAt,
    });

    console.log(`✅ 试卷 ${updatedPaper.title} 已更新`);
  } catch (error) {
    console.error('更新试卷错误:', error);
    sendError(res, '更新试卷失败', 500);
  }
};

// 删除试卷
export const deletePaper = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperId } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 检查试卷是否属于当前教师
    const existingPaper = await prisma.paper.findFirst({
      where: {
        id: paperId,
        teacherId,
      },
      include: {
        _count: {
          select: {
            exams: true,
          },
        },
      },
    });

    if (!existingPaper) {
      sendError(res, '试卷不存在或无权限删除', 404);
      return;
    }

    // 检查是否有关联的考试
    if (existingPaper._count.exams > 0) {
      sendError(res, '该试卷已被用于考试，无法删除', 400);
      return;
    }

    // 删除试卷（会级联删除所有题目）
    await prisma.paper.delete({
      where: { id: paperId },
    });

    sendSuccess(res, {
      message: '试卷删除成功',
      deleted_paper: {
        id: existingPaper.id,
        title: existingPaper.title,
      },
    });

    console.log(`✅ 试卷 ${existingPaper.title} 已删除`);
  } catch (error) {
    console.error('删除试卷错误:', error);
    sendError(res, '删除试卷失败', 500);
  }
};