import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';

type Props = {
  participantCount: number;
  questionCount: number;
  durationMinutes: number;
  completionRate: number; // 保持与原先展示一致的计算方式
};

// 考试统计信息卡片（4列）
const ExamStats: React.FC<Props> = ({ participantCount, questionCount, durationMinutes, completionRate }) => {
  return (
    <Row gutter={16} style={{ marginBottom: 24 }}>
      <Col span={6}>
        <Card>
          <Statistic title="参与人数" value={participantCount} suffix="人" />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="题目数量" value={questionCount} suffix="题" />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="考试时长" value={durationMinutes} suffix="分钟" />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="完成率" value={completionRate} suffix="%" precision={1} />
        </Card>
      </Col>
    </Row>
  );
};

export default ExamStats;

