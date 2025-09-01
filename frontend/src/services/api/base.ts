/**
 * API基础配置
 * 共享的axios实例和拦截器配置
 */

import axios, { type AxiosInstance } from 'axios';

// 创建共享的axios实例
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 60000, // 增加到60秒，支持AI报告生成
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加认证token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 统一处理错误
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 当API返回401错误时
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const isStudentPath = currentPath.startsWith('/exam/');
      const isLoginPage = currentPath === '/login';

      // 只有教师端（非学生端、非登录页）才跳转到登录页
      if (!isStudentPath && !isLoginPage) {
        // 清除过期的认证信息
        localStorage.removeItem('auth_token');
        localStorage.removeItem('teacher_info');
        // 使用 window.location.href 来强制刷新页面，确保旧的状态被清除
        window.location.href = '/login';
      }
      // 学生端的401错误（如密码错误）不跳转，让组件内部处理
    }
    // 对于所有错误（包括登录页的401），都将错误继续抛出，以便组件内部可以捕获和处理
    return Promise.reject(error);
  }
);

export default api;