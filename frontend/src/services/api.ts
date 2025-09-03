/**
 * API模块 - 向后兼容导出
 * 主API文件已模块化，此文件保持向后兼容性
 */

// 重新导出模块化的API
export {
  api as default,
  authApi,
  paperApi,
  questionApi,
  examApi,
  analyticsApi,
  publicApi,
  teacherAiApi
} from './api/index';