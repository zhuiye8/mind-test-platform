import React from 'react';
import { Card, Row, Col, Input, Space, Divider, Typography, Button } from 'antd';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';

type Props = {
  searchValue: string;
  onSearchChange: (v: string) => void;
  filteredCount: number;
  totalCount: number;
};

// 搜索与筛选区域（保留原布局与样式）
const PapersFilters: React.FC<Props> = ({ searchValue, onSearchChange, filteredCount, totalCount }) => {
  return (
    <Card className="modern-card-enter border-0" style={{ marginBottom: 24 }}>
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} sm={12} md={8}>
          <Input
            placeholder="搜索试卷名称或描述..."
            prefix={<SearchOutlined className="text-neutral-400" />}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            allowClear
            size="large"
          />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Space>
            <Button icon={<FilterOutlined />} className="hover:bg-primary-50 hover:text-primary-600">
              筛选条件
            </Button>
            <Divider type="vertical" />
            <Typography.Text type="secondary" className="text-sm">
              显示 {filteredCount} / {totalCount} 条记录
            </Typography.Text>
          </Space>
        </Col>
        <Col xs={24} md={8} className="text-right">
          {/* 预留更多操作按钮位 */}
        </Col>
      </Row>
    </Card>
  );
};

export default PapersFilters;

