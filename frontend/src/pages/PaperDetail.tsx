/**
 * PaperDetail Page - 重构版
 * 从733行单文件重构为模块化组件
 * 
 * 重构后结构：
 * - PaperDetail/index.tsx (主组件 ~200行)
 * - PaperDetail/PaperHeader.tsx (头部组件 ~80行)
 * - PaperDetail/PaperStats.tsx (统计组件 ~60行)
 * - PaperDetail/QuestionList.tsx (题目列表 ~150行)
 * - PaperDetail/usePaperDetail.ts (业务逻辑Hook ~120行)
 * - PaperDetail/types.ts (类型定义 ~50行)
 */

// 重新导出重构后的组件，保持向后兼容
export { PaperDetail as default } from '../components/PaperDetail/exports';