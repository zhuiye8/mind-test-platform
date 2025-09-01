/**
 * 公开控制器模块统一导出
 * 整合所有公开考试相关的控制器功能，保持向后兼容性
 */

// 导出类型定义
export * from './types';

// 导出工具函数
export * from './utils';

// 导出所有控制器函数
export * from './access.controller';
export * from './validation.controller';
export * from './session.controller';
export * from './submission.controller';