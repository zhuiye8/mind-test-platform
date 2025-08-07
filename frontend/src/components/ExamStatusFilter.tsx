import React from 'react';
import { Tabs, Badge, Space } from 'antd';
import {
  EditOutlined,
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { Exam } from '../types';
import { ExamStatus } from '../constants/examStatus';

interface ExamStatusFilterProps {
  exams: Exam[];
  currentStatus: string;
  onStatusChange: (status: string) => void;
}

/**
 * 考试状态筛选器组件
 * 提供按状态筛选考试的Tab切换功能
 */
const ExamStatusFilter: React.FC<ExamStatusFilterProps> = ({
  exams,
  currentStatus,
  onStatusChange
}) => {
  // 统计各状态下的考试数量（不包括归档的考试）
  const getCountByStatus = (status: string): number => {
    if (status === 'all') {
      return exams.filter(exam => exam.status !== ExamStatus.ARCHIVED).length;
    }
    return exams.filter(exam => exam.status === status).length;
  };

  // 定义Tab配置
  const tabItems = [
    {
      key: 'all',
      label: (
        <Space size={4}>
          <span>全部考试</span>
          <Badge 
            count={getCountByStatus('all')} 
            style={{ backgroundColor: '#52c41a' }}
            overflowCount={999}
          />
        </Space>
      ),
    },
    {
      key: ExamStatus.DRAFT,
      label: (
        <Space size={4}>
          <EditOutlined />
          <span>草稿</span>
          <Badge 
            count={getCountByStatus(ExamStatus.DRAFT)} 
            style={{ backgroundColor: '#faad14' }}
            overflowCount={999}
          />
        </Space>
      ),
    },
    {
      key: ExamStatus.PUBLISHED,
      label: (
        <Space size={4}>
          <PlayCircleOutlined />
          <span>进行中</span>
          <Badge 
            count={getCountByStatus(ExamStatus.PUBLISHED)} 
            style={{ backgroundColor: '#52c41a' }}
            overflowCount={999}
          />
        </Space>
      ),
    },
    {
      key: ExamStatus.EXPIRED,
      label: (
        <Space size={4}>
          <StopOutlined />
          <span>已停止</span>
          <Badge 
            count={getCountByStatus(ExamStatus.EXPIRED)} 
            style={{ backgroundColor: '#ff4d4f' }}
            overflowCount={999}
          />
        </Space>
      ),
    },
    {
      key: ExamStatus.SUCCESS,
      label: (
        <Space size={4}>
          <CheckCircleOutlined />
          <span>已结束</span>
          <Badge 
            count={getCountByStatus(ExamStatus.SUCCESS)} 
            style={{ backgroundColor: '#1890ff' }}
            overflowCount={999}
          />
        </Space>
      ),
    }
  ];

  return (
    <Tabs
      activeKey={currentStatus}
      onChange={onStatusChange}
      items={tabItems}
      size="large"
      style={{
        marginBottom: 0,
      }}
    />
  );
};

export default ExamStatusFilter;