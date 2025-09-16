import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { sendSuccess, sendError } from '../utils/response';
import prisma from '../utils/database';
import { AppError } from '../types';

// 获取教师列表（仅管理员）
export const getTeacherList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, search = '', role = '', status = '' } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);
    
    // 构建查询条件
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { teacherId: { contains: String(search), mode: 'insensitive' } },
      ];
    }
    
    if (role && role !== 'all') {
      where.role = role === 'admin' ? 'ADMIN' : 'TEACHER';
    }
    
    if (status && status !== 'all') {
      where.isActive = status === 'active';
    }

    // 获取总数和列表
    const [total, teachers] = await Promise.all([
      prisma.teacher.count({ where }),
      prisma.teacher.findMany({
        where,
        select: {
          id: true,
          teacherId: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              papers: true,
              exams: true,
            },
          },
        },
        orderBy: [
          { role: 'desc' }, // 管理员在前
          { createdAt: 'desc' },
        ],
        skip: offset,
        take: Number(limit),
      }),
    ]);

    const hasNext = total > offset + Number(limit);

    sendSuccess(res, {
      data: teachers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        hasNext,
      },
    });
  } catch (error) {
    console.error('获取教师列表错误:', error);
    sendError(res, '获取教师列表失败', 500);
  }
};

// 创建教师账户（仅管理员）
export const createTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teacher_id, name, password, role = 'TEACHER' } = req.body;

    // 参数验证
    if (!teacher_id || !name || !password) {
      sendError(res, '工号、姓名和密码不能为空', 400);
      return;
    }

    if (password.length < 6) {
      sendError(res, '密码长度至少6位', 400);
      return;
    }

    // 检查工号是否已存在
    const existingTeacher = await prisma.teacher.findUnique({
      where: { teacherId: teacher_id },
    });

    if (existingTeacher) {
      sendError(res, '该工号已存在', 409);
      return;
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 12);

    // 创建教师账户
    const newTeacher = await prisma.teacher.create({
      data: {
        teacherId: teacher_id,
        name,
        passwordHash,
        role: role === 'ADMIN' ? 'ADMIN' : 'TEACHER',
        isActive: true,
      },
      select: {
        id: true,
        teacherId: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    sendSuccess(res, {
      teacher: newTeacher,
      message: '教师账户创建成功',
    });

    console.log(`✅ 管理员 ${req.teacher?.name} 创建了新教师账户: ${name}(${teacher_id})`);
  } catch (error) {
    console.error('创建教师账户错误:', error);
    
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode);
      return;
    }
    
    sendError(res, '创建教师账户失败', 500);
  }
};

// 更新教师信息（仅管理员）
export const updateTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teacherId } = req.params;
    const { name, password, role, is_active } = req.body;

    // 检查目标教师是否存在
    const existingTeacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, teacherId: true, name: true, role: true, isActive: true },
    });

    if (!existingTeacher) {
      sendError(res, '教师账户不存在', 404);
      return;
    }

    // 构建更新数据
    const updateData: any = {};
    
    if (name && name !== existingTeacher.name) {
      updateData.name = name;
    }
    
    if (password && password.length >= 6) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }
    
    if (role && role !== existingTeacher.role) {
      updateData.role = role === 'ADMIN' ? 'ADMIN' : 'TEACHER';
    }
    
    if (typeof is_active === 'boolean' && is_active !== existingTeacher.isActive) {
      updateData.isActive = is_active;
    }

    // 如果没有任何更改
    if (Object.keys(updateData).length === 0) {
      sendError(res, '没有需要更新的信息', 400);
      return;
    }

    // 更新教师信息
    const updatedTeacher = await prisma.teacher.update({
      where: { id: teacherId },
      data: updateData,
      select: {
        id: true,
        teacherId: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    sendSuccess(res, {
      teacher: updatedTeacher,
      message: '教师信息更新成功',
    });

    console.log(`✅ 管理员 ${req.teacher?.name} 更新了教师信息: ${updatedTeacher.name}(${updatedTeacher.teacherId})`);
  } catch (error) {
    console.error('更新教师信息错误:', error);
    sendError(res, '更新教师信息失败', 500);
  }
};

// 删除教师账户（仅管理员，不能删除管理员账户）
export const deleteTeacher = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teacherId } = req.params;

    // 检查目标教师是否存在
    const existingTeacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { 
        id: true, 
        teacherId: true, 
        name: true, 
        role: true,
        _count: {
          select: {
            papers: true,
            exams: true,
          },
        },
      },
    });

    if (!existingTeacher) {
      sendError(res, '教师账户不存在', 404);
      return;
    }

    // 防止删除管理员账户
    if (existingTeacher.role === 'ADMIN') {
      sendError(res, '不能删除管理员账户', 403);
      return;
    }

    // 检查是否有关联数据
    if (existingTeacher._count.papers > 0 || existingTeacher._count.exams > 0) {
      sendError(res, '该教师有关联的试卷或考试数据，无法删除', 409);
      return;
    }

    // 删除教师账户
    await prisma.teacher.delete({
      where: { id: teacherId },
    });

    sendSuccess(res, {
      message: '教师账户删除成功',
    });

    console.log(`⚠️ 管理员 ${req.teacher?.name} 删除了教师账户: ${existingTeacher.name}(${existingTeacher.teacherId})`);
  } catch (error) {
    console.error('删除教师账户错误:', error);
    sendError(res, '删除教师账户失败', 500);
  }
};

// 重置教师密码（仅管理员）
export const resetTeacherPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teacherId } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      sendError(res, '新密码长度至少6位', 400);
      return;
    }

    // 检查目标教师是否存在
    const existingTeacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, teacherId: true, name: true, role: true },
    });

    if (!existingTeacher) {
      sendError(res, '教师账户不存在', 404);
      return;
    }

    // 加密新密码
    const passwordHash = await bcrypt.hash(new_password, 12);

    // 更新密码
    await prisma.teacher.update({
      where: { id: teacherId },
      data: { passwordHash },
    });

    sendSuccess(res, {
      message: '密码重置成功',
    });

    console.log(`🔑 管理员 ${req.teacher?.name} 重置了教师密码: ${existingTeacher.name}(${existingTeacher.teacherId})`);
  } catch (error) {
    console.error('重置教师密码错误:', error);
    sendError(res, '重置密码失败', 500);
  }
};

// 获取教师统计信息（仅管理员）
export const getTeacherStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      totalTeachers,
      activeTeachers,
      adminCount,
      teacherCount,
      recentlyCreated,
    ] = await Promise.all([
      prisma.teacher.count(),
      prisma.teacher.count({ where: { isActive: true } }),
      prisma.teacher.count({ where: { role: 'ADMIN' } }),
      prisma.teacher.count({ where: { role: 'TEACHER' } }),
      prisma.teacher.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 最近7天
          },
        },
      }),
    ]);

    sendSuccess(res, {
      stats: {
        total_teachers: totalTeachers,
        active_teachers: activeTeachers,
        inactive_teachers: totalTeachers - activeTeachers,
        admin_count: adminCount,
        teacher_count: teacherCount,
        recently_created: recentlyCreated,
      },
    });
  } catch (error) {
    console.error('获取教师统计信息错误:', error);
    sendError(res, '获取统计信息失败', 500);
  }
};