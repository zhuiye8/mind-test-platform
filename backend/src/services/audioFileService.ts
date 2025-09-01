/**

 * 音频文件服务 - 重构版本
 * 使用模块化结构，将功能拆分为独立模块
 * 
 * 拆分后的模块：
 * - types.ts: 类型定义
 * - core.service.ts: 核心服务和基础功能
 * - generator.service.ts: 单个音频生成
 * - batch.service.ts: 批量音频生成
 * - management.service.ts: 音频文件管理
 */

// 从模块化结构重新导出所有功能，保持向后兼容性
export * from './audio/index';