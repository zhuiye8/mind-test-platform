/**
 * API模块统一导出
 * 模块化拆分后的API集合
 */

// 导出基础axios实例
export { default as api } from './base';

// 导出各个API模块
export { authApi } from './authApi';
export { paperApi } from './paperApi';
export { questionApi } from './questionApi';
export { examApi } from './examApi';
export { analyticsApi } from './analyticsApi';
export { publicApi } from './publicApi';
export { teacherAiApi } from './teacherAiApi';