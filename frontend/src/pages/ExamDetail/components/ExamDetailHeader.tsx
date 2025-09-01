import React from 'react';
import { Button, Space, Typography, Tag } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { getStatusColor, getStatusName } from '../../../constants/examStatus';
import type { ExamStatusType } from '../../../constants/examStatus';

const { Title } = Typography;

type Props = {
  title: string;
  status: ExamStatusType;
  onBack: () => void;
};

// 考试详情页头部：返回按钮 + 标题 + 状态标签
const ExamDetailHeader: React.FC<Props> = ({ title, status, onBack }) => {
  return (
    <div style={{ marginBottom: 24 }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回
        </Button>
        <Title level={2} style={{ margin: 0 }}>
          {title}
        </Title>
        <Tag color={getStatusColor(status)}>
          {getStatusName(status)}
        </Tag>
      </Space>
    </div>
  );
};

export default ExamDetailHeader;

