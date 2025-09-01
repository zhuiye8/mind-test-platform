/**
 * 认证相关API
 */

import api from './base';
import type { ApiResponse, LoginForm, LoginResponse } from '../../types';

export const authApi = {
  // 教师登录
  login: (data: LoginForm): Promise<ApiResponse<LoginResponse>> => {
    return api.post('/auth/login', data);
  },

  // 验证token
  verify: (): Promise<ApiResponse<{ teacher: any }>> => {
    return api.get('/auth/verify');
  },
};