/**
 * 公开控制器 - 重构版本
 * 使用模块化结构，将功能拆分为独立模块
 * 
 * 拆分后的模块：
 * - types.ts: 类型定义
 * - access.controller.ts: 考试访问和密码验证
 * - validation.controller.ts: 提交前验证
 * - session.controller.ts: AI会话管理
 * - submission.controller.ts: 答案提交处理
 * - utils.ts: 工具函数
 */

// 从模块化结构重新导出所有功能，保持向后兼容性
export * from './public/index';