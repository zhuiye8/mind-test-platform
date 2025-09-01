/**
 * 考试卡片组件
 * 重构后的简化版本，拆分了子组件和工具函数
 */

import React from 'react';
import { Card } from 'antd';
import type { Exam } from '../../types';
import type { ExamStatusType } from '../../constants/examStatus';
import { ExamCardHeader } from './ExamCardHeader';
import { ExamCardActions } from './ExamCardActions';
import { getCardGradient, getUrgencyLevel } from './ExamCardUtils';

interface ExamCardProps {
  exam: Exam;
  onEdit: (exam: Exam) => void;
  onDelete: (exam: Exam) => void;
  onViewParticipants: (exam: Exam) => void;
  onStatusChange: (exam: Exam, newStatus: ExamStatusType) => void;
  onCopyLink: (exam: Exam) => void;
  onOpen?: (exam: Exam) => void; // 点击卡片打开详情
}

const ExamCard: React.FC<ExamCardProps> = ({
  exam,
  onEdit,
  onDelete,
  onViewParticipants,
  onStatusChange,
  onCopyLink,
  onOpen
}) => {
  const urgencyLevel = getUrgencyLevel(exam);

  return (
    <Card
      size="small"
      style={{
        background: getCardGradient(exam),
        border: urgencyLevel === 'critical' ? '2px solid #ff4d4f' : 
               urgencyLevel === 'urgent' ? '2px solid #fa8c16' : '1px solid #f0f0f0',
        borderRadius: '12px',
        boxShadow: urgencyLevel !== 'normal' ? 
          '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'all 0.3s ease',
        height: '100%',
        cursor: onOpen ? 'pointer' : 'default'
      }}
      styles={{
        body: { 
          padding: '16px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }
      }}
      hoverable
      onClick={() => onOpen && onOpen(exam)}
    >
      <div>
        <ExamCardHeader exam={exam} />
      </div>
      
      <div>
        <ExamCardActions
          exam={exam}
          onEdit={onEdit}
          onDelete={onDelete}
          onViewParticipants={onViewParticipants}
          onStatusChange={onStatusChange}
          onCopyLink={onCopyLink}
        />
      </div>
    </Card>
  );
};

export default ExamCard;
