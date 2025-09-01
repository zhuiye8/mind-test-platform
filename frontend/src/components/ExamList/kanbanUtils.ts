/**
 * Kanban布局工具函数
 * 处理布局计算、分页和配置相关逻辑
 */

import type { ExamStatusType } from '../../constants/examStatus';
import { ExamStatus } from '../../constants/examStatus';
import type { Exam } from '../../types';
import {
  InboxOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';

// 布局常量
export const LAYOUT_CONSTANTS = {
  MIN_CARD_WIDTH: 300,
  MAX_COLUMNS: 3,
  MAX_ROWS: 2,
  CARDS_PER_PAGE_EXPANDED: 6, // 2行 x 3列
  COLLAPSED_WIDTH_PERCENT: 15,
  EXPANDED_WIDTH_PERCENT: 70,
} as const;

// 泳道配置
export const laneConfig: Record<ExamStatusType, { 
  title: string; 
  color: string; 
  bgColor: string; 
  Icon: React.ComponentType<any> 
}> = {
  [ExamStatus.DRAFT]: { title: '草稿', color: '#faad14', bgColor: '#fff7e6', Icon: InboxOutlined },
  [ExamStatus.PUBLISHED]: { title: '进行中', color: '#52c41a', bgColor: '#f6ffed', Icon: PlayCircleOutlined },
  [ExamStatus.SUCCESS]: { title: '已结束', color: '#1890ff', bgColor: '#e6f7ff', Icon: CheckCircleOutlined },
  [ExamStatus.ARCHIVED]: { title: '已归档', color: '#8c8c8c', bgColor: '#f5f5f5', Icon: FileTextOutlined },
};

/**
 * 计算卡片布局参数
 */
export const calculateCardLayout = () => {
  // 固定3列2行布局
  return {
    columns: LAYOUT_CONSTANTS.MAX_COLUMNS,
    rows: LAYOUT_CONSTANTS.MAX_ROWS,
    cardsPerPage: LAYOUT_CONSTANTS.CARDS_PER_PAGE_EXPANDED
  };
};

/**
 * 计算泳道宽度
 */
export const calculateLaneWidth = (isExpanded: boolean): string => {
  if (isExpanded) {
    return `${LAYOUT_CONSTANTS.EXPANDED_WIDTH_PERCENT}%`;
  } else {
    return `${LAYOUT_CONSTANTS.COLLAPSED_WIDTH_PERCENT}%`;
  }
};

/**
 * 获取分页后的考试数据
 */
export const getPaginatedExams = (
  exams: Exam[], 
  currentPage: number
): Exam[] => {
  const { cardsPerPage } = calculateCardLayout();
  const startIndex = (currentPage - 1) * cardsPerPage;
  return exams.slice(startIndex, startIndex + cardsPerPage);
};

/**
 * 计算总页数
 */
export const getTotalPages = (exams: Exam[]): number => {
  const { cardsPerPage } = calculateCardLayout();
  return Math.max(1, Math.ceil(exams.length / cardsPerPage));
};

/**
 * 获取考试信息（紧急、活跃状态）
 */
export const getExamInfo = (exam: Exam) => {
  const now = new Date();
  const endTime = exam.end_time ? new Date(exam.end_time) : null;
  const startTime = exam.start_time ? new Date(exam.start_time) : null;
  
  // 紧急判断：距离结束时间不足1小时或已过期
  const isUrgent = endTime && (
    (endTime.getTime() - now.getTime()) < 60 * 60 * 1000 && // 1小时内结束
    exam.status === ExamStatus.PUBLISHED
  );
  
  // 活跃判断：正在进行中的考试
  const isActive = exam.status === ExamStatus.PUBLISHED && 
    (!startTime || startTime <= now) && 
    (!endTime || endTime > now);
  
  return { isUrgent, isActive };
};