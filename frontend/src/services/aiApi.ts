// AI功能相关的API接口 - 已废弃，请使用 api.ts 中的统一接口
// 
// ⚠️ 此文件已废弃，为避免重复API定义和路由混淆，请使用以下方式：
// 
// import { api } from './api';
// const result = await api.aiApi.generateReport(examResultId);
//
// 原有的 /api/teacher/exam-results/${examResultId}/ai-analysis 端点不存在
// 正确的端点是 /api/teacher/ai/exam-results/:examResultId/generate-report

console.warn('⚠️ aiApi.ts 已废弃，请使用 api.ts 中的统一 aiApi 接口');

// 导出空对象，保持向后兼容
export const aiApiService = {};
export const useAIApi = () => ({});
export default {};