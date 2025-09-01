/**
 * PaperStats - 试卷统计信息组件
 * 显示题目数量、类型分布等统计数据
 */
import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import {
  FileTextOutlined,
  CheckSquareOutlined,
  SelectOutlined,
  EditOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { PaperStatsProps } from './types';

const PaperStats: React.FC<PaperStatsProps> = ({ questions, paper }) => {
  // 计算统计数据
  const getStatistics = () => {
    const totalQuestions = questions.length;
    const singleChoice = questions.filter(q => q.question_type === 'single_choice').length;
    const multipleChoice = questions.filter(q => q.question_type === 'multiple_choice').length;
    const textQuestions = questions.filter(q => q.question_type === 'text').length;
    const requiredQuestions = questions.filter(q => q.is_required).length;
    const scoredQuestions = questions.filter(q => q.is_scored).length;

    return {
      totalQuestions,
      singleChoice,
      multipleChoice,
      textQuestions,
      requiredQuestions,
      scoredQuestions,
    };
  };

  const stats = getStatistics();

  // 估算完成时间（每题平均30秒）
  const estimatedTime = Math.ceil(stats.totalQuestions * 0.5); // 分钟

  return (
    <Card style={{ marginBottom: 24 }}>
      <Row gutter={16}>
        <Col xs={24} sm={12} md={6}>
          <Statistic
            title="题目总数"
            value={stats.totalQuestions}
            prefix={<FileTextOutlined />}
            valueStyle={{ color: '#1890ff' }}
          />
        </Col>
        
        <Col xs={24} sm={12} md={6}>
          <Statistic
            title="单选题"
            value={stats.singleChoice}
            prefix={<SelectOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        
        <Col xs={24} sm={12} md={6}>
          <Statistic
            title="多选题"
            value={stats.multipleChoice}
            prefix={<CheckSquareOutlined />}
            valueStyle={{ color: '#fa8c16' }}
          />
        </Col>
        
        <Col xs={24} sm={12} md={6}>
          <Statistic
            title="文本题"
            value={stats.textQuestions}
            prefix={<EditOutlined />}
            valueStyle={{ color: '#722ed1' }}
          />
        </Col>
      </Row>
      
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} sm={8} md={6}>
          <Statistic
            title="必填题"
            value={stats.requiredQuestions}
            suffix={`/ ${stats.totalQuestions}`}
            valueStyle={{ color: '#f5222d' }}
          />
        </Col>
        
        <Col xs={24} sm={8} md={6}>
          <Statistic
            title="计分题"
            value={stats.scoredQuestions}
            suffix={`/ ${stats.totalQuestions}`}
            valueStyle={{ color: '#13c2c2' }}
          />
        </Col>
        
        <Col xs={24} sm={8} md={6}>
          <Statistic
            title="预计用时"
            value={estimatedTime}
            suffix="分钟"
            prefix={<ClockCircleOutlined />}
            valueStyle={{ color: '#eb2f96' }}
          />
        </Col>
        
        <Col xs={24} sm={8} md={6}>
          <Statistic
            title="试卷状态"
            value={paper?.status === 'published' ? '已发布' : paper?.status === 'draft' ? '草稿' : '未知'}
            valueStyle={{ 
              color: paper?.status === 'published' ? '#52c41a' : '#fa8c16' 
            }}
          />
        </Col>
      </Row>
    </Card>
  );
};

export default PaperStats;