/**
 * ExamCard操作按钮组件
 * 处理考试卡片的操作按钮渲染逻辑
 */

import React, { useMemo } from 'react';
import { Space, Button, Tooltip, Dropdown } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  EditOutlined,
  LinkOutlined,
  DeleteOutlined,
  FileTextOutlined,
  EyeOutlined,
  MoreOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import type { Exam } from '../../types';
import { ExamStatus } from '../../constants/examStatus';
import type { ExamStatusType } from '../../constants/examStatus';

interface ExamCardActionsProps {
  exam: Exam;
  onEdit: (exam: Exam) => void;
  onDelete: (exam: Exam) => void;
  onViewParticipants: (exam: Exam) => void;
  onStatusChange: (exam: Exam, newStatus: ExamStatusType) => void;
  onCopyLink: (exam: Exam) => void;
}

export const ExamCardActions: React.FC<ExamCardActionsProps> = ({
  exam,
  onEdit,
  onDelete,
  onViewParticipants,
  onStatusChange,
  onCopyLink
}) => {
  // 获取主要操作按钮
  const getPrimaryActions = () => {
    const actions: React.ReactNode[] = [];

    // 编辑按钮 (草稿状态)
    if (exam.status === ExamStatus.DRAFT) {
      actions.push(
        <Tooltip key="edit" title="编辑考试">
          <Button
            type="primary"
            icon={<EditOutlined />}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(exam);
            }}
          >
            编辑
          </Button>
        </Tooltip>
      );
    }

    // 发布/停止按钮
    if (exam.status === ExamStatus.DRAFT) {
      actions.push(
        <Tooltip key="publish" title="发布考试">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            size="small"
            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(exam, ExamStatus.PUBLISHED);
            }}
          >
            发布
          </Button>
        </Tooltip>
      );
    } else if (exam.status === ExamStatus.PUBLISHED) {
      actions.push(
        <Tooltip key="finish" title="结束考试">
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            size="small"
            danger
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(exam, ExamStatus.SUCCESS);
            }}
          >
            结束
          </Button>
        </Tooltip>
      );
    }

    // 查看参与者按钮 (已发布或已结束)
    if (exam.status === ExamStatus.PUBLISHED || exam.status === ExamStatus.SUCCESS) {
      actions.push(
        <Tooltip key="participants" title="查看参与者">
          <Button
            icon={<EyeOutlined />}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onViewParticipants(exam);
            }}
          >
            参与者
          </Button>
        </Tooltip>
      );
    }

    // 复制链接按钮 (已发布)
    if (exam.status === ExamStatus.PUBLISHED && exam.public_url) {
      actions.push(
        <Tooltip key="link" title="复制公开链接">
          <Button
            icon={<LinkOutlined />}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onCopyLink(exam);
            }}
          >
            链接
          </Button>
        </Tooltip>
      );
    }

    return actions;
  };

  // 更多操作菜单
  const moreMenuItems = useMemo(() => {
    const items = [];

    // 归档操作 (已结束状态)
    if (exam.status === ExamStatus.SUCCESS) {
      items.push({
        key: 'archive',
        label: '归档考试',
        icon: <FileTextOutlined />,
        onClick: () => onStatusChange(exam, ExamStatus.ARCHIVED)
      });
    }

    // 恢复操作 (已归档状态)
    if (exam.status === ExamStatus.ARCHIVED) {
      items.push({
        key: 'restore',
        label: '恢复考试',
        icon: <CheckCircleOutlined />,
        onClick: () => onStatusChange(exam, ExamStatus.SUCCESS)
      });
    }

    // 删除操作 (草稿和归档状态)
    if (exam.status === ExamStatus.DRAFT || exam.status === ExamStatus.ARCHIVED) {
      items.push({
        key: 'delete',
        label: '删除考试',
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => onDelete(exam)
      });
    }

    return items;
  }, [exam, onStatusChange, onDelete]);

  const primaryActions = getPrimaryActions();

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '12px'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <Space size="small">
        {primaryActions}
      </Space>

      {moreMenuItems.length > 0 && (
        <Dropdown
          menu={{ items: moreMenuItems }}
          placement="bottomRight"
          trigger={['click']}
        >
          <Button
            type="text"
            icon={<MoreOutlined />}
            size="small"
            style={{ color: '#8c8c8c' }}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      )}
    </div>
  );
};