/**
 * 依赖验证器模块统一导出
 * 整合所有依赖验证相关的功能，保持向后兼容性
 */

// 导出类型定义
export * from './types';

// 导出服务类
export { DependencyGraphService } from './graph.service';
export { CircularDetectionService } from './circular-detection.service';
export { ValidationService } from './validation.service';
export { VisualizationService } from './visualization.service';

// 导出主要验证器类
export { DependencyValidator } from './dependency-validator';

// 导出工具函数
export * from './utils';