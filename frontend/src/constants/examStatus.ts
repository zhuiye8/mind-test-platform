/**
 * 考试状态枚举常量
 * 与后端数据库枚举值保持一致
 */
export const ExamStatus = {
  DRAFT: 'DRAFT' as const,
  PUBLISHED: 'PUBLISHED' as const,
  EXPIRED: 'EXPIRED' as const,
  SUCCESS: 'SUCCESS' as const,
  ARCHIVED: 'ARCHIVED' as const,
} as const;

export type ExamStatusType = typeof ExamStatus[keyof typeof ExamStatus];

/**
 * 状态颜色映射
 * 用于 Tag 组件的 color 属性
 */
export const STATUS_COLORS = {
  [ExamStatus.DRAFT]: 'orange',          // 草稿 - 橙色
  [ExamStatus.PUBLISHED]: 'green',       // 进行中 - 绿色
  [ExamStatus.EXPIRED]: 'red',           // 已停止 - 红色
  [ExamStatus.SUCCESS]: 'blue',          // 已结束 - 蓝色
  [ExamStatus.ARCHIVED]: 'default',      // 已归档 - 灰色
} as const;

/**
 * 状态显示名称映射
 */
export const STATUS_NAMES = {
  [ExamStatus.DRAFT]: '草稿',
  [ExamStatus.PUBLISHED]: '进行中',
  [ExamStatus.EXPIRED]: '已停止',
  [ExamStatus.SUCCESS]: '已结束',
  [ExamStatus.ARCHIVED]: '已归档',
} as const;

/**
 * 获取状态颜色
 */
export const getStatusColor = (status: ExamStatusType): string => {
  return STATUS_COLORS[status] || 'default';
};

/**
 * 获取状态显示名称
 */
export const getStatusName = (status: ExamStatusType): string => {
  return STATUS_NAMES[status] || status;
};

/**
 * 检查是否为可删除状态
 */
export const canDeleteExam = (status: ExamStatusType): boolean => {
  return [ExamStatus.DRAFT, ExamStatus.EXPIRED, ExamStatus.ARCHIVED].includes(status as any);
};

/**
 * 检查是否为活跃状态（学生可参与）
 */
export const isActiveStatus = (status: ExamStatusType): boolean => {
  return status === ExamStatus.PUBLISHED;
};

/**
 * 检查是否为已完成状态
 */
export const isCompletedStatus = (status: ExamStatusType): boolean => {
  return [ExamStatus.SUCCESS, ExamStatus.EXPIRED].includes(status as any);
};