/**
 * ExamCard头部组件
 * 处理考试卡片的标题、状态和时间信息展示
 */

import React from 'react';
import { Space, Typography, Tag, Tooltip } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  LockOutlined,
  SwapOutlined,
  ScheduleOutlined,
  FieldTimeOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import type { Exam } from '../../types';
import { getStatusColor, getStatusName } from '../../constants/examStatus';
import { formatDateTime, getUrgencyLevel, getUrgencyColor, getUrgencyText } from './ExamCardUtils';

const { Title, Text } = Typography;

interface ExamCardHeaderProps {
  exam: Exam;
}

export const ExamCardHeader: React.FC<ExamCardHeaderProps> = ({ exam }) => {
  const urgencyLevel = getUrgencyLevel(exam);

  return (
    <div>
      {/* 标题和状态 */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Title 
            level={5} 
            style={{ 
              margin: 0, 
              color: '#262626',
              fontSize: '18px',
              fontWeight: 700,
              flex: 1,
              paddingRight: '8px'
            }}
            ellipsis={{ rows: 2, tooltip: exam.title }}
          >
            {exam.title}
          </Title>
          
          <Space direction="vertical" size={4} style={{ alignItems: 'flex-end' }}>
            <Tag 
              color={getStatusColor(exam.status)}
              style={{ margin: 0, fontSize: '12px' }}
            >
              {getStatusName(exam.status)}
            </Tag>
            
            {urgencyLevel !== 'normal' && (
              <Tag 
                color={getUrgencyColor(urgencyLevel)}
                style={{ margin: 0, fontSize: '12px' }}
                icon={urgencyLevel === 'critical' ? <ExclamationCircleOutlined /> : undefined}
              >
                {getUrgencyText(urgencyLevel)}
              </Tag>
            )}
          </Space>
        </div>
      </div>

      {/* 试卷信息 */}
      <div style={{ marginBottom: '8px' }}>
        <Text 
          type="secondary" 
          style={{ fontSize: '14px' }}
          ellipsis={{ tooltip: exam.paper_title }}
        >
          📋 {exam.paper_title}
        </Text>
      </div>

      {/* 时间信息 */}
      <div style={{ marginBottom: '8px' }}>
        <Space size={12} wrap>
          {exam.start_time && (
            <Space size={4}>
              <CalendarOutlined style={{ color: '#52c41a', fontSize: '14px' }} />
              <Text style={{ fontSize: '13px', color: '#595959' }}>
                {formatDateTime(exam.start_time)}
              </Text>
            </Space>
          )}
          
          {exam.end_time && (
            <Space size={4}>
              <FieldTimeOutlined style={{ color: '#fa8c16', fontSize: '14px' }} />
              <Text style={{ fontSize: '13px', color: '#595959' }}>
                {formatDateTime(exam.end_time)}
              </Text>
            </Space>
          )}
          
          {exam.duration_minutes && (
            <Space size={4}>
              <ClockCircleOutlined style={{ color: '#1890ff', fontSize: '14px' }} />
              <Text style={{ fontSize: '13px', color: '#595959' }}>
                {exam.duration_minutes}分钟
              </Text>
            </Space>
          )}
        </Space>
      </div>

      {/* 设置标签 */}
      <div style={{ marginBottom: '8px' }}>
        <Space size={4} wrap>
          {exam.question_count && (
            <Tag 
              color="blue" 
              style={{ fontSize: '12px', margin: 0, borderRadius: '6px' }}
            >
              {exam.question_count}题
            </Tag>
          )}
          
          {exam.participant_count > 0 && (
            <Tag 
              color="green" 
              style={{ fontSize: '12px', margin: 0, borderRadius: '6px' }}
            >
              {exam.participant_count}人
            </Tag>
          )}
          
          {exam.has_password && (
            <Tooltip title="需要密码">
              <Tag 
                icon={<LockOutlined />} 
                color="orange" 
                style={{ fontSize: '12px', margin: 0, borderRadius: '6px' }}
              >
                密码
              </Tag>
            </Tooltip>
          )}
          
          {exam.shuffle_questions && (
            <Tooltip title="题目随机打乱">
              <Tag 
                icon={<SwapOutlined />} 
                color="purple" 
                style={{ fontSize: '12px', margin: 0, borderRadius: '6px' }}
              >
                打乱
              </Tag>
            </Tooltip>
          )}
        </Space>
      </div>
    </div>
  );
};
