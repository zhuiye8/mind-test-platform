/**
 * Kanban看板布局组件
 * 重构后的模块化版本，拆分了子组件和工具函数
 */

import React, { useCallback } from 'react';
import type { ExamStatusType } from '../../constants/examStatus';
import { ExamStatus } from '../../constants/examStatus';
import type { Exam } from '../../types';
import { KanbanLane } from './KanbanLane';
import { laneConfig } from './kanbanUtils';

interface KanbanLayoutProps {
  examsByStatus: Record<ExamStatusType, Exam[]>;
  expandedLane: ExamStatusType;
  setExpandedLane: (lane: ExamStatusType) => void;
  currentPage: Record<ExamStatusType, number>;
  setCurrentPage: (pages: Record<ExamStatusType, number>) => void;
  onRenderExamCard: (exam: Exam) => React.ReactNode;
  loading?: boolean;
  onExamCardClick?: (exam: Exam) => void;
  onEdit?: (exam: Exam) => void;
  onDelete?: (exam: Exam) => void;
  onViewParticipants?: (exam: Exam) => void;
  onStatusChange?: (exam: Exam, newStatus: ExamStatusType) => void;
  onCopyLink?: (exam: Exam) => void;
}

const KanbanLayout: React.FC<KanbanLayoutProps> = ({
  examsByStatus,
  expandedLane,
  setExpandedLane,
  currentPage,
  setCurrentPage,
  onRenderExamCard,
  loading = false,
  onExamCardClick,
  onEdit,
  onDelete,
  onViewParticipants,
  onStatusChange,
  onCopyLink,
}) => {
  // 获取按状态分组的考试
  const getExamsByStatus = useCallback((status: ExamStatusType) => {
    return examsByStatus[status] || [];
  }, [examsByStatus]);

  // 处理泳道切换
  const handleLaneChange = useCallback((status: ExamStatusType) => {
    setExpandedLane(status);
    // 重置到第一页
    setCurrentPage({
      ...currentPage,
      [status]: 1
    });
  }, [setExpandedLane, currentPage, setCurrentPage]);

  // 处理分页变化
  const handlePageChange = useCallback((status: ExamStatusType, page: number) => {
    setCurrentPage({
      ...currentPage,
      [status]: page
    });
  }, [currentPage, setCurrentPage]);

  // 处理考试卡片点击
  const handleExamCardClick = useCallback((exam: Exam) => {
    if (onExamCardClick) {
      onExamCardClick(exam);
      return;
    }
    // 回退：控制台记录，避免无反馈
    // eslint-disable-next-line no-console
    console.log('点击考试卡片:', exam.id);
  }, [onExamCardClick]);

  // 渲染所有泳道
  const statusOrder = [ExamStatus.DRAFT, ExamStatus.PUBLISHED, ExamStatus.SUCCESS, ExamStatus.ARCHIVED];

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        border: '1px solid #f0f0f0',
        borderRadius: '16px',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #fafafa 0%, #ffffff 100%)',
        position: 'relative',
        padding: '8px',
        gap: '8px'
      }}
    >
      {statusOrder.map((status) => {
        const config = laneConfig[status];
        const exams = getExamsByStatus(status);
        const isExpanded = expandedLane === status;
        const currentPageNum = currentPage[status] || 1;

        return (
          <KanbanLane
            key={status}
            status={status}
            exams={exams}
            isExpanded={isExpanded}
            currentPage={currentPageNum}
            onLaneClick={handleLaneChange}
            onPageChange={(page) => handlePageChange(status, page)}
            onExamCardClick={handleExamCardClick}
            loading={loading}
            onEdit={onEdit}
            onDelete={onDelete}
            onViewParticipants={onViewParticipants}
            onStatusChange={onStatusChange}
            onCopyLink={onCopyLink}
          />
        );
      })}
    </div>
  );
};

export default KanbanLayout;
