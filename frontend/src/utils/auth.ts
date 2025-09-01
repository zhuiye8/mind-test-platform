// 认证相关工具函数
export const setAuthToken = (token: string) => {
  localStorage.setItem('auth_token', token);
};

export const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

export const removeAuthToken = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('teacher_info');
};

export const setTeacherInfo = (teacher: any) => {
  localStorage.setItem('teacher_info', JSON.stringify(teacher));
};

export const getTeacherInfo = () => {
  const info = localStorage.getItem('teacher_info');
  if (!info) return null;
  
  try {
    return JSON.parse(info);
  } catch (error) {
    console.error('解析教师信息失败，清除无效数据:', error);
    // 清除损坏的数据
    localStorage.removeItem('teacher_info');
    return null;
  }
};

export const isAuthenticated = (): boolean => {
  return !!getAuthToken();
};