/**
 * PaperHeader - 试卷详情页头部组件
 * 显示试卷基本信息和操作按钮
 */
import React from 'react';
import { Button, Space, Typography, Tag } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { PaperHeaderProps } from './types';

const { Title, Text } = Typography;

const PaperHeader: React.FC<PaperHeaderProps> = ({
  paper,
  onUpdate,
  onBack,
}) => {
  if (!paper) {
    return (
      <div style={{ marginBottom: 24 }}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={onBack}
        >
          返回试卷列表
        </Button>
      </div>
    );
  }

  const getStatusTag = (status: string) => {
    const statusMap = {
      'draft': { color: 'default', text: '草稿' },
      'published': { color: 'green', text: '已发布' },
      'archived': { color: 'orange', text: '已归档' },
    };
    
    const config = statusMap[status as keyof typeof statusMap] || { color: 'default', text: status };
    
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={onBack}
            >
              返回试卷列表
            </Button>
          </Space>
          
          <Space>
            <Button 
              type="primary"
              icon={<EditOutlined />}
              onClick={() => onUpdate(paper)}
            >
              编辑试卷信息
            </Button>
          </Space>
        </div>

        <div>
          <Title level={2} style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <FileTextOutlined />
            {paper.title}
            {getStatusTag(paper.status)}
          </Title>

          {paper.description && (
            <Text type="secondary" style={{ fontSize: 16, display: 'block', marginBottom: 16 }}>
              {paper.description}
            </Text>
          )}

          <Space size="large" wrap>
            <Text type="secondary">
              <strong>创建时间：</strong>
              {formatDate(paper.createdAt)}
            </Text>
            
            <Text type="secondary">
              <strong>最后更新：</strong>
              {formatDate(paper.updatedAt)}
            </Text>
            
            {paper.status === 'published' && paper.publishedAt && (
              <Text type="secondary">
                <strong>发布时间：</strong>
                {formatDate(paper.publishedAt)}
              </Text>
            )}
          </Space>
        </div>
      </Space>
    </div>
  );
};

export default PaperHeader;