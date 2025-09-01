import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { FileTextOutlined, BarChartOutlined, ExperimentOutlined, BookOutlined } from '@ant-design/icons';

type Props = {
  totalPapers: number;
  totalQuestions: number;
  totalExams: number;
  activePapers: number;
};

// 统计卡片网格（四张卡片，样式与原实现保持一致）
const PapersStatsGrid: React.FC<Props> = ({ totalPapers, totalQuestions, totalExams, activePapers }) => {
  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} sm={12} lg={6}>
        <Card className="modern-card-enter border-0 text-center hover:shadow-xl transition-all">
          <Statistic
            title="试卷总数"
            value={totalPapers}
            prefix={
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2" style={{ background: 'var(--color-primary-50)' }}>
                <FileTextOutlined style={{ color: 'var(--color-primary-500)', fontSize: 24 }} />
              </div>
            }
            valueStyle={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-primary-600)' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card className="modern-card-enter border-0 text-center hover:shadow-xl transition-all">
          <Statistic
            title="题目总数"
            value={totalQuestions}
            prefix={
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2" style={{ background: 'var(--color-secondary-50)' }}>
                <BarChartOutlined style={{ color: 'var(--color-secondary-500)', fontSize: 24 }} />
              </div>
            }
            valueStyle={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-secondary-600)' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card className="modern-card-enter border-0 text-center hover:shadow-xl transition-all">
          <Statistic
            title="关联考试"
            value={totalExams}
            prefix={
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2" style={{ background: 'var(--color-accent-50)' }}>
                <ExperimentOutlined style={{ color: 'var(--color-accent-500)', fontSize: 24 }} />
              </div>
            }
            valueStyle={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-accent-600)' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card className="modern-card-enter border-0 text-center hover:shadow-xl transition-all">
          <Statistic
            title="完善试卷"
            value={activePapers}
            suffix={`/${totalPapers}`}
            prefix={
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2" style={{ background: 'rgba(114, 46, 209, 0.1)' }}>
                <BookOutlined style={{ color: '#722ed1', fontSize: 24 }} />
              </div>
            }
            valueStyle={{ fontSize: '2rem', fontWeight: 'bold', color: '#722ed1' }}
          />
        </Card>
      </Col>
    </Row>
  );
};

export default PapersStatsGrid;

