/**
 * PaperDetail 组件导出
 * 统一导出所有拆分后的组件，便于外部使用
 */

// 主组件
export { default as PaperDetail } from './index';

// 子组件
export { default as PaperHeader } from './PaperHeader';
export { default as PaperStats } from './PaperStats';
export { default as QuestionList } from './QuestionList';

// Hook
export { usePaperDetail } from './usePaperDetail';

// 类型定义
export type * from './types';