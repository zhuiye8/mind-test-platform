import { Request, Response } from 'express';

import { comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { sendSuccess, sendError } from '../utils/response';
import { TeacherLoginRequest } from '../types';
import prisma from '../utils/database';
import { AppError } from '../types';

// 教师登录
export const teacherLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teacher_id, password }: TeacherLoginRequest = req.body;

    // 参数验证
    if (!teacher_id || !password) {
      sendError(res, '工号和密码不能为空', 400);
      return;
    }

    // 查找教师
    const teacher = await prisma.teacher.findUnique({
      where: { teacherId: teacher_id },
      select: {
        id: true,
        teacherId: true,
        name: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });

    if (!teacher) {
      sendError(res, '工号或密码错误', 401);
      return;
    }

    // 检查账户是否被禁用
    if (!teacher.isActive) {
      sendError(res, '账户已被禁用，请联系管理员', 401);
      return;
    }

    // 验证密码
    const isPasswordValid = await comparePassword(password, teacher.passwordHash);
    
    if (!isPasswordValid) {
      sendError(res, '工号或密码错误', 401);
      return;
    }

    // 生成JWT token
    const token = generateToken({
      teacherId: teacher.teacherId,
      id: teacher.id,
      name: teacher.name,
      role: teacher.role,
    });

    // 返回成功响应
    sendSuccess(res, {
      token,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        teacher_id: teacher.teacherId,
        role: teacher.role,
      },
    });

    console.log(`✅ 教师 ${teacher.name}(${teacher.teacherId}) 登录成功`);
  } catch (error) {
    console.error('教师登录错误:', error);
    
    if (error instanceof AppError) {
      sendError(res, error.message, error.statusCode);
      return;
    }
    
    sendError(res, '登录过程中发生错误', 500);
  }
};

// 验证token（用于前端检查登录状态）
export const verifyAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    // 如果能走到这里，说明JWT中间件已经验证了token
    const teacherInfo = req.teacher;
    
    if (!teacherInfo) {
      sendError(res, '认证信息无效', 401);
      return;
    }

    // 查询最新的教师信息
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherInfo.id },
      select: {
        id: true,
        name: true,
        teacherId: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!teacher) {
      sendError(res, '教师账号不存在', 404);
      return;
    }

    // 检查账户是否被禁用
    if (!teacher.isActive) {
      sendError(res, '账户已被禁用，请联系管理员', 401);
      return;
    }

    sendSuccess(res, {
      teacher: {
        id: teacher.id,
        name: teacher.name,
        teacher_id: teacher.teacherId,
        role: teacher.role,
        is_active: teacher.isActive,
        created_at: teacher.createdAt,
        updated_at: teacher.updatedAt,
      },
    });
  } catch (error) {
    console.error('验证认证信息错误:', error);
    sendError(res, '验证认证信息失败', 500);
  }
};