import React from 'react';
import { Card, Col, Row, Typography } from 'antd';
import { EditOutlined, PlayCircleOutlined, CheckCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import type { Exam } from '../../types';
import type { ExamStatusType } from '../../constants/examStatus';
import { ExamStatus } from '../../constants/examStatus';

const { Text } = Typography;

interface ExamStatsCardsProps {
  examsByStatus: Record<ExamStatusType, Exam[]>;
  total: number;
}

const StatCard: React.FC<{ title: string; count: number; gradient: string; icon: React.ReactNode }>
  = ({ title, count, gradient, icon }) => {
  return (
    <Card
      size="small"
      style={{
        borderRadius: 12,
        border: '1px solid #f0f0f0',
        background: gradient,
        height: 84
      }}
      styles={{ body: { padding: 12, height: '100%' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Text style={{ color: '#595959', fontSize: 12 }}>{title}</Text>
          <Text style={{ fontWeight: 700, fontSize: 24, color: '#262626' }}>{count}</Text>
        </div>
        <div style={{ fontSize: 22, color: '#8c8c8c' }}>
          {icon}
        </div>
      </div>
    </Card>
  );
};

const ExamStatsCards: React.FC<ExamStatsCardsProps> = ({ examsByStatus, total }) => {
  const items = [
    {
      key: 'draft',
      title: '草稿',
      count: (examsByStatus[ExamStatus.DRAFT] || []).length,
      gradient: 'linear-gradient(135deg, #fff7e6 0%, #fff1b8 40%, #ffffff 100%)',
      icon: <EditOutlined />,
    },
    {
      key: 'published',
      title: '进行中',
      count: (examsByStatus[ExamStatus.PUBLISHED] || []).length,
      gradient: 'linear-gradient(135deg, #f6ffed 0%, #b7eb8f 40%, #ffffff 100%)',
      icon: <PlayCircleOutlined />,
    },
    {
      key: 'success',
      title: '已结束',
      count: (examsByStatus[ExamStatus.SUCCESS] || []).length,
      gradient: 'linear-gradient(135deg, #e6f7ff 0%, #91d5ff 40%, #ffffff 100%)',
      icon: <CheckCircleOutlined />,
    },
    {
      key: 'archived',
      title: '已归档',
      count: (examsByStatus[ExamStatus.ARCHIVED] || []).length,
      gradient: 'linear-gradient(135deg, #fafafa 0%, #d9d9d9 35%, #ffffff 100%)',
      icon: <FileTextOutlined />,
    },
  ];

  return (
    <div>
      <Row gutter={[12, 12]}> 
        <Col xs={24} sm={12} md={6}>
          <Card
            size="small"
            style={{
              borderRadius: 12,
              border: '1px solid #f0f0f0',
              background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f7ff 60%, #ffffff 100%)',
              height: 84
            }}
            styles={{ body: { padding: 12, height: '100%' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Text style={{ color: '#595959', fontSize: 12 }}>总考试</Text>
                <Text style={{ fontWeight: 700, fontSize: 24, color: '#262626' }}>{total}</Text>
              </div>
              <div style={{ fontSize: 22, color: '#8c8c8c' }}>
                📊
              </div>
            </div>
          </Card>
        </Col>
        {items.map((it) => (
          <Col key={it.key} xs={24} sm={12} md={6}>
            <StatCard title={it.title} count={it.count} gradient={it.gradient} icon={it.icon} />
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default ExamStatsCards;

