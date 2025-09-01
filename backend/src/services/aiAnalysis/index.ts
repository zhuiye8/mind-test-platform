/**

 * AI分析服务模块化入口
 * 将原 aiAnalysisService.ts (2175行) 拆分为6个专业化模块
 */

// 主服务类
export { AIAnalysisService } from './aiAnalysisService';

// 子模块
export { SessionManager } from './sessionManager';
export { HealthChecker } from './healthChecker'; 
export { ReportGenerator } from './reportGenerator';
// EmotionDataProcessor已重构为独立函数，从emotionDataProcessor模块导出

// 配置和类型
export * from './config';
export * from './types';

// 导出单例实例（保持向后兼容）
import { AIAnalysisService } from './aiAnalysisService';
export const aiAnalysisService = AIAnalysisService.getInstance();