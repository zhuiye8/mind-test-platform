/**
 * ExamCard工具函数
 * 处理格式化、样式计算等纯函数逻辑
 */

import type { Exam } from '../../types';
import { ExamStatus } from '../../constants/examStatus';

/**
 * 格式化时间显示
 */
export const formatDateTime = (dateString?: string): string => {
  if (!dateString) return '未设置';
  return new Date(dateString).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * 计算考试紧急程度
 */
export const getUrgencyLevel = (exam: Exam): 'normal' | 'urgent' | 'critical' => {
  if (exam.status !== ExamStatus.PUBLISHED || !exam.end_time) {
    return 'normal';
  }
  
  const now = new Date();
  const endTime = new Date(exam.end_time);
  const timeLeft = endTime.getTime() - now.getTime();
  const hoursLeft = timeLeft / (1000 * 60 * 60);
  
  if (hoursLeft < 0) return 'critical'; // 已过期
  if (hoursLeft < 1) return 'critical';  // 1小时内
  if (hoursLeft < 24) return 'urgent';   // 24小时内
  
  return 'normal';
};

/**
 * 获取卡片背景渐变
 */
export const getCardGradient = (exam: Exam): string => {
  const urgencyLevel = getUrgencyLevel(exam);
  
  switch (exam.status) {
    case ExamStatus.DRAFT:
      return 'linear-gradient(135deg, #fffbf0 0%, #fff8e1 50%, #ffffff 100%)';
    case ExamStatus.PUBLISHED:
      if (urgencyLevel === 'critical') {
        return 'linear-gradient(135deg, #fff2f0 0%, #ffebee 50%, #ffffff 100%)';
      } else if (urgencyLevel === 'urgent') {
        return 'linear-gradient(135deg, #fff7e6 0%, #fff1f0 50%, #ffffff 100%)';
      } else {
        return 'linear-gradient(135deg, #f6ffed 0%, #f0f9f0 50%, #ffffff 100%)';
      }
    case ExamStatus.SUCCESS:
      return 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 50%, #ffffff 100%)';
    case ExamStatus.ARCHIVED:
      return 'linear-gradient(135deg, #f5f5f5 0%, #fafafa 50%, #ffffff 100%)';
    default:
      return 'linear-gradient(135deg, #ffffff 0%, #fafafa 50%, #f5f5f5 100%)';
  }
};

/**
 * 获取紧急度颜色
 */
export const getUrgencyColor = (urgencyLevel: 'normal' | 'urgent' | 'critical'): string => {
  switch (urgencyLevel) {
    case 'critical':
      return '#ff4d4f';
    case 'urgent':
      return '#fa8c16';
    default:
      return '#52c41a';
  }
};

/**
 * 获取紧急度文本
 */
export const getUrgencyText = (urgencyLevel: 'normal' | 'urgent' | 'critical'): string => {
  switch (urgencyLevel) {
    case 'critical':
      return '紧急';
    case 'urgent':
      return '即将';
    default:
      return '正常';
  }
};