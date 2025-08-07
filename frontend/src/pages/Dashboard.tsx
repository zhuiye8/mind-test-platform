import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Typography, Space, Button, List, Avatar, Tag } from 'antd';
import {
  FileTextOutlined,
  ExperimentOutlined,
  UserOutlined,
  BarChartOutlined,
  PlusOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { analyticsApi, paperApi, examApi } from '../services/api';
import type { AnalyticsData, Paper, Exam } from '../types';
import { getStatusColor, getStatusName } from '../constants/examStatus';
import type { ExamStatusType } from '../constants/examStatus';

const { Title, Text } = Typography;

const Dashboard: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<{
    overall_stats: {
      total_papers: number;
      total_exams: number;
      total_participants: number;
      avg_completion_rate: number;
    };
    activity_stats: {
      active_exams: number;
      recent_submissions: number;
    };
    recent_papers: any[];
    recent_exams: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // 使用统一的Dashboard接口
      const dashboardRes = await analyticsApi.getDashboard();
      if (dashboardRes.data) {
        setDashboardData(dashboardRes.data);
      }
    } catch (error) {
      console.error('加载仪表板数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 使用常量文件中的函数
  // const getStatusColor = getStatusColor; // 已导入

  // 使用常量文件中的函数
  // const getStatusText = getStatusName; // 已导入为 getStatusName

  return (
    <div>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          仪表板
        </Title>
        <Text type="secondary">欢迎回到心理测试平台管理系统</Text>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="试卷总数"
              value={dashboardData?.overall_stats.total_papers || 0}
              prefix={<FileTextOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="考试总数"
              value={dashboardData?.overall_stats.total_exams || 0}
              prefix={<ExperimentOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="参与人数"
              value={dashboardData?.overall_stats.total_participants || 0}
              prefix={<UserOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading}>
            <Statistic
              title="平均完成率"
              value={dashboardData?.overall_stats.avg_completion_rate || 0}
              suffix="%"
              precision={1}
              prefix={<BarChartOutlined style={{ color: '#722ed1' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* 最近内容 */}
      <Row gutter={[16, 16]}>
        {/* 最近试卷 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <FileTextOutlined />
                最近试卷
              </Space>
            }
            extra={
              <Button 
                type="link" 
                onClick={() => navigate('/papers')}
              >
                查看全部
              </Button>
            }
            loading={loading}
          >
            <List
              itemLayout="horizontal"
              dataSource={dashboardData?.recent_papers || []}
              locale={{ emptyText: '暂无试卷数据' }}
              renderItem={(paper) => (
                <List.Item
                  actions={[
                    <Button 
                      type="link" 
                      size="small" 
                      icon={<EyeOutlined />}
                      onClick={() => navigate(`/papers/${paper.id}`)}
                    >
                      查看
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<FileTextOutlined />} />}
                    title={paper.title}
                    description={
                      <Space>
                        <Text type="secondary">
                          {paper.question_count} 道题
                        </Text>
                        <Text type="secondary">
                          {paper.exam_count} 次考试
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
            
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button 
                type="dashed" 
                icon={<PlusOutlined />}
                onClick={() => navigate('/papers')}
              >
                创建新试卷
              </Button>
            </div>
          </Card>
        </Col>

        {/* 最近考试 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ExperimentOutlined />
                最近考试
              </Space>
            }
            extra={
              <Button 
                type="link" 
                onClick={() => navigate('/exams')}
              >
                查看全部
              </Button>
            }
            loading={loading}
          >
            <List
              itemLayout="horizontal"
              dataSource={dashboardData?.recent_exams || []}
              locale={{ emptyText: '暂无考试数据' }}
              renderItem={(exam) => (
                <List.Item
                  actions={[
                    <Button 
                      type="link" 
                      size="small" 
                      icon={<EyeOutlined />}
                      onClick={() => navigate(`/exams/${exam.id}`)}
                    >
                      查看
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<ExperimentOutlined />} />}
                    title={exam.title}
                    description={
                      <Space>
                        <Tag color={getStatusColor(exam.status as ExamStatusType)}>
                          {getStatusName(exam.status as ExamStatusType)}
                        </Tag>
                        <Text type="secondary">
                          {exam.result_count} 人参与
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
            
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button 
                type="dashed" 
                icon={<PlusOutlined />}
                onClick={() => navigate('/exams')}
              >
                创建新考试
              </Button>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;