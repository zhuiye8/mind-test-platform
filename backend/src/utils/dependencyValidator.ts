/**
 * 题目条件依赖关系验证工具 - 重构版本
 * 使用模块化结构，将功能拆分为独立模块
 * 
 * 拆分后的模块：
 * - types.ts: 类型定义
 * - graph.service.ts: 依赖关系图构建和管理
 * - circular-detection.service.ts: 循环依赖检测
 * - validation.service.ts: 条件验证逻辑
 * - visualization.service.ts: 可视化数据生成
 * - dependency-validator.ts: 主要验证器类
 * - utils.ts: 工具函数
 */

// 从模块化结构重新导出所有功能，保持向后兼容性
export * from './dependency/index';