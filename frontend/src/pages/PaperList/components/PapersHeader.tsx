import React from 'react';
import { Card, Row, Col, Space, Typography, Button } from 'antd';
import { PlusOutlined, BookOutlined, BarChartOutlined, ExperimentOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

type Stats = {
  totalPapers: number;
  totalQuestions: number;
  totalExams: number;
};

type Props = {
  stats: Stats;
  onCreate: () => void;
};

// 顶部欢迎卡片（标题、简述、统计摘要、创建按钮）
const PapersHeader: React.FC<Props> = ({ stats, onCreate }) => {
  return (
    <Card
      className="modern-card-enter border-0"
      style={{ marginBottom: 24 }}
      styles={{ body: { padding: 24 } }}
    >
      <Row align="middle" justify="space-between">
        <Col>
          <Space direction="vertical" size={4}>
            <Title level={3} style={{ margin: 0 }}>心理测试量表管理</Title>
            <Text type="secondary">创建、维护并复用心理测评场景下的试卷模板</Text>
            <Space size="large" wrap>
              <Text type="secondary">
                <BookOutlined className="mr-1" />
                共 {stats.totalPapers} 份试卷
              </Text>
              <Text type="secondary">
                <BarChartOutlined className="mr-1" />
                {stats.totalQuestions} 道题目
              </Text>
              <Text type="secondary">
                <ExperimentOutlined className="mr-1" />
                {stats.totalExams} 次考试
              </Text>
            </Space>
          </Space>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={onCreate} className="shadow-lg">
            创建试卷
          </Button>
        </Col>
      </Row>
    </Card>
  );
};

export default PapersHeader;

