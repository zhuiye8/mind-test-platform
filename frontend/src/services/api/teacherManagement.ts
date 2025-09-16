import api from './base';

export interface Teacher {
  id: string;
  teacherId: string;
  name: string;
  role: 'ADMIN' | 'TEACHER';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    papers: number;
    exams: number;
  };
}

export interface TeacherStats {
  total_teachers: number;
  active_teachers: number;
  inactive_teachers: number;
  admin_count: number;
  teacher_count: number;
  recently_created: number;
}

export interface CreateTeacherRequest {
  teacher_id: string;
  name: string;
  password: string;
  role?: 'ADMIN' | 'TEACHER';
}

export interface UpdateTeacherRequest {
  name?: string;
  password?: string;
  role?: 'ADMIN' | 'TEACHER';
  is_active?: boolean;
}

export interface ResetPasswordRequest {
  new_password: string;
}

export interface TeacherListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

export interface TeacherListResponse {
  data: Teacher[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
  };
}

// 获取教师统计信息
export const getTeacherStats = async (): Promise<TeacherStats> => {
  const response = await api.get('/teacher/management/stats');
  return response.stats;
};

// 获取教师列表
export const getTeacherList = async (params: TeacherListParams = {}): Promise<TeacherListResponse> => {
  const response = await api.get('/teacher/management/list', { params });
  return response;
};

// 创建教师账户
export const createTeacher = async (data: CreateTeacherRequest): Promise<Teacher> => {
  const response = await api.post('/teacher/management/create', data);
  return response.teacher;
};

// 更新教师信息
export const updateTeacher = async (teacherId: string, data: UpdateTeacherRequest): Promise<Teacher> => {
  const response = await api.put(`/teacher/management/${teacherId}`, data);
  return response.teacher;
};

// 删除教师账户
export const deleteTeacher = async (teacherId: string): Promise<void> => {
  await api.delete(`/teacher/management/${teacherId}`);
};

// 重置教师密码
export const resetTeacherPassword = async (teacherId: string, data: ResetPasswordRequest): Promise<void> => {
  await api.post(`/teacher/management/${teacherId}/reset-password`, data);
};