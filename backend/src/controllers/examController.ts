/**
 * 考试控制器 - 重构版本
 * 使用模块化结构，将功能拆分为独立模块
 * 
 * 拆分后的模块：
 * - crud.controller.ts: 基本CRUD操作
 * - query.controller.ts: 复杂查询和分页
 * - results.controller.ts: 考试结果管理
 * - export.controller.ts: 导出功能
 * - lifecycle.controller.ts: 生命周期管理
 */

// 从各个模块重新导出所有函数，保持向后兼容性
export * from './exam/index';