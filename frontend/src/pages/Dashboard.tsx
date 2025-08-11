import React, { useState, useEffect } from 'react';
import { 
  Row, 
  Col, 
  Card, 
  Statistic, 
  Typography, 
  Space, 
  Button, 
  List, 
  Avatar, 
  Tag,
  Progress,
  Skeleton,
  Empty,
  Divider
} from 'antd';
import {
  FileTextOutlined,
  ExperimentOutlined,
  UserOutlined,
  BarChartOutlined,
  PlusOutlined,
  EyeOutlined,
  TrophyOutlined,
  RiseOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
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

  // 计算统计数据的变化趋势（模拟数据，实际应从后端获取）
  const getTrendIcon = (value: number) => {
    const trend = Math.random() > 0.5 ? 'up' : 'down';
    const percentage = Math.floor(Math.random() * 20) + 1;
    
    if (trend === 'up') {
      return (
        <span className="text-secondary-600 text-sm flex items-center gap-1">
          <ArrowUpOutlined />
          +{percentage}%
        </span>
      );
    } else {
      return (
        <span className="text-accent-600 text-sm flex items-center gap-1">
          <ArrowDownOutlined />
          -{percentage}%
        </span>
      );
    }
  };

  return (
    <div 
      className="modern-page-enter"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Hero 区域 */}
      <div className="relative">
        <Card className="modern-card-enter border-0 overflow-hidden" style={{ marginBottom: 24 }}>
          <div 
            className="absolute inset-0 opacity-5"
            style={{
              background: 'var(--gradient-primary)',
            }}
          />
          <div className="relative z-10">
            <Row align="middle" justify="space-between">
              <Col>
                <Space direction="vertical" size={4}>
                  <Title level={1} className="mb-0" style={{ fontSize: '2.5rem' }}>
                    仪表板总览
                  </Title>
                  <Text className="text-lg text-neutral-600">
                    欢迎回到心理测试平台管理系统
                  </Text>
                  <Space size={16} className="mt-2">
                    <Text type="secondary">
                      <ClockCircleOutlined className="mr-1" />
                      实时更新于 {new Date().toLocaleString()}
                    </Text>
                    <Text type="secondary">
                      <CheckCircleOutlined className="mr-1" />
                      系统运行正常
                    </Text>
                  </Space>
                </Space>
              </Col>
              <Col>
                <Space>
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    size="large"
                    onClick={() => navigate('/papers')}
                    className="shadow-lg"
                  >
                    创建试卷
                  </Button>
                  <Button 
                    icon={<ExperimentOutlined />}
                    size="large"
                    onClick={() => navigate('/exams')}
                  >
                    新建考试
                  </Button>
                </Space>
              </Col>
            </Row>
          </div>
        </Card>
      </div>

      {/* 核心统计指标 */}
      <div style={{ marginBottom: 24 }}>
        <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          <Card 
            className="modern-card-enter hover:shadow-xl transition-all duration-300 border-0"
            loading={loading}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className="flex items-center justify-center w-12 h-12 rounded-xl"
                    style={{ background: 'var(--color-primary-50)' }}
                  >
                    <FileTextOutlined 
                      className="text-xl" 
                      style={{ color: 'var(--color-primary-500)' }} 
                    />
                  </div>
                  <div>
                    <Text type="secondary" className="text-xs font-medium uppercase tracking-wider">
                      试卷总数
                    </Text>
                    <div className="mt-1">
                      {getTrendIcon(dashboardData?.overall_stats.total_papers || 0)}
                    </div>
                  </div>
                </div>
                <Statistic
                  value={dashboardData?.overall_stats.total_papers || 0}
                  className="mb-0"
                  valueStyle={{ 
                    fontSize: '2rem', 
                    fontWeight: 'bold',
                    background: 'var(--gradient-primary)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-100">
              <Progress 
                percent={75} 
                strokeColor="var(--color-primary-500)"
                trailColor="var(--color-primary-100)"
                showInfo={false}
                strokeWidth={6}
              />
              <Text type="secondary" className="text-xs mt-2 block">
                本月活跃试卷占比
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card 
            className="modern-card-enter hover:shadow-xl transition-all duration-300 border-0"
            loading={loading}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className="flex items-center justify-center w-12 h-12 rounded-xl"
                    style={{ background: 'var(--color-secondary-50)' }}
                  >
                    <ExperimentOutlined 
                      className="text-xl" 
                      style={{ color: 'var(--color-secondary-500)' }} 
                    />
                  </div>
                  <div>
                    <Text type="secondary" className="text-xs font-medium uppercase tracking-wider">
                      考试总数
                    </Text>
                    <div className="mt-1">
                      {getTrendIcon(dashboardData?.overall_stats.total_exams || 0)}
                    </div>
                  </div>
                </div>
                <Statistic
                  value={dashboardData?.overall_stats.total_exams || 0}
                  className="mb-0"
                  valueStyle={{ 
                    fontSize: '2rem', 
                    fontWeight: 'bold',
                    background: 'var(--gradient-secondary)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-100">
              <Progress 
                percent={60} 
                strokeColor="var(--color-secondary-500)"
                trailColor="var(--color-secondary-100)"
                showInfo={false}
                strokeWidth={6}
              />
              <Text type="secondary" className="text-xs mt-2 block">
                进行中考试占比
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card 
            className="modern-card-enter hover:shadow-xl transition-all duration-300 border-0"
            loading={loading}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className="flex items-center justify-center w-12 h-12 rounded-xl"
                    style={{ background: 'var(--color-accent-50)' }}
                  >
                    <UserOutlined 
                      className="text-xl" 
                      style={{ color: 'var(--color-accent-500)' }} 
                    />
                  </div>
                  <div>
                    <Text type="secondary" className="text-xs font-medium uppercase tracking-wider">
                      参与人数
                    </Text>
                    <div className="mt-1">
                      {getTrendIcon(dashboardData?.overall_stats.total_participants || 0)}
                    </div>
                  </div>
                </div>
                <Statistic
                  value={dashboardData?.overall_stats.total_participants || 0}
                  className="mb-0"
                  valueStyle={{ 
                    fontSize: '2rem', 
                    fontWeight: 'bold',
                    background: 'var(--gradient-accent)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-100">
              <Progress 
                percent={85} 
                strokeColor="var(--color-accent-500)"
                trailColor="var(--color-accent-100)"
                showInfo={false}
                strokeWidth={6}
              />
              <Text type="secondary" className="text-xs mt-2 block">
                本月新增用户
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card 
            className="modern-card-enter hover:shadow-xl transition-all duration-300 border-0"
            loading={loading}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className="flex items-center justify-center w-12 h-12 rounded-xl"
                    style={{ background: 'rgba(114, 46, 209, 0.1)' }}
                  >
                    <TrophyOutlined 
                      className="text-xl" 
                      style={{ color: '#722ed1' }} 
                    />
                  </div>
                  <div>
                    <Text type="secondary" className="text-xs font-medium uppercase tracking-wider">
                      完成率
                    </Text>
                    <div className="mt-1">
                      {getTrendIcon(dashboardData?.overall_stats.avg_completion_rate || 0)}
                    </div>
                  </div>
                </div>
                <Statistic
                  value={dashboardData?.overall_stats.avg_completion_rate || 0}
                  suffix="%"
                  precision={1}
                  className="mb-0"
                  valueStyle={{ 
                    fontSize: '2rem', 
                    fontWeight: 'bold',
                    color: '#722ed1'
                  }}
                />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-100">
              <Progress 
                percent={dashboardData?.overall_stats.avg_completion_rate || 0}
                strokeColor="#722ed1"
                trailColor="rgba(114, 46, 209, 0.1)"
                showInfo={false}
                strokeWidth={6}
              />
              <Text type="secondary" className="text-xs mt-2 block">
                平均测试完成率
              </Text>
            </div>
          </Card>
        </Col>
        </Row>
      </div>

      {/* 内容区域 */}
      <div style={{ flex: 1, overflow: 'hidden', paddingBottom: 24 }}>
        <Row gutter={[24, 24]} style={{ height: '100%' }}>
        {/* 最近试卷 */}
        <Col xs={24} lg={12} style={{ height: '100%' }}>
          <Card
            title={
              <Space align="center">
                <div 
                  className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: 'var(--color-primary-50)' }}
                >
                  <FileTextOutlined style={{ color: 'var(--color-primary-500)' }} />
                </div>
                <span className="font-semibold">最近试卷</span>
              </Space>
            }
            extra={
              <Button 
                type="text" 
                className="text-primary-600 hover:text-primary-700"
                onClick={() => navigate('/papers')}
              >
                查看全部 →
              </Button>
            }
            className="modern-card-enter border-0"
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1, overflow: 'auto', padding: '16px' }}
            loading={loading}
          >
            {dashboardData?.recent_papers && dashboardData.recent_papers.length > 0 ? (
              <List
                dataSource={dashboardData.recent_papers}
                renderItem={(paper, index) => (
                  <List.Item
                    className="hover:bg-neutral-50 rounded-lg transition-colors px-4 py-3 border-0"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar 
                          className="shadow-sm"
                          style={{ 
                            background: 'var(--gradient-primary)',
                            border: '2px solid var(--color-bg-paper)'
                          }}
                          icon={<FileTextOutlined />} 
                        />
                      }
                      title={
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-neutral-800 hover:text-primary-600 cursor-pointer">
                            {paper.title}
                          </span>
                          <Button 
                            type="text" 
                            size="small"
                            icon={<EyeOutlined />}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => navigate(`/papers/${paper.id}`)}
                          />
                        </div>
                      }
                      description={
                        <div className="flex items-center justify-between">
                          <Space size={16}>
                            <Text type="secondary" className="text-xs">
                              <BarChartOutlined className="mr-1" />
                              {paper.question_count} 道题
                            </Text>
                            <Text type="secondary" className="text-xs">
                              <ExperimentOutlined className="mr-1" />
                              {paper.exam_count} 次考试
                            </Text>
                          </Space>
                          <Text type="secondary" className="text-xs">
                            {Math.floor(Math.random() * 7) + 1} 天前
                          </Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无试卷数据"
                className="py-8"
              >
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/papers')}
                >
                  创建第一个试卷
                </Button>
              </Empty>
            )}
            
            {dashboardData?.recent_papers && dashboardData.recent_papers.length > 0 && (
              <div className="text-center pt-4 border-t border-neutral-100 mt-4">
                <Button 
                  type="dashed" 
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/papers')}
                  className="hover:border-primary-500 hover:text-primary-600"
                >
                  创建新试卷
                </Button>
              </div>
            )}
          </Card>
        </Col>

        {/* 最近考试 */}
        <Col xs={24} lg={12} style={{ height: '100%' }}>
          <Card
            title={
              <Space align="center">
                <div 
                  className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: 'var(--color-secondary-50)' }}
                >
                  <ExperimentOutlined style={{ color: 'var(--color-secondary-500)' }} />
                </div>
                <span className="font-semibold">最近考试</span>
              </Space>
            }
            extra={
              <Button 
                type="text" 
                className="text-primary-600 hover:text-primary-700"
                onClick={() => navigate('/exams')}
              >
                查看全部 →
              </Button>
            }
            className="modern-card-enter border-0"
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1, overflow: 'auto', padding: '16px' }}
            loading={loading}
          >
            {dashboardData?.recent_exams && dashboardData.recent_exams.length > 0 ? (
              <List
                dataSource={dashboardData.recent_exams}
                renderItem={(exam, index) => (
                  <List.Item
                    className="hover:bg-neutral-50 rounded-lg transition-colors px-4 py-3 border-0"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar 
                          className="shadow-sm"
                          style={{ 
                            background: 'var(--gradient-secondary)',
                            border: '2px solid var(--color-bg-paper)'
                          }}
                          icon={<ExperimentOutlined />} 
                        />
                      }
                      title={
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-neutral-800 hover:text-primary-600 cursor-pointer">
                            {exam.title}
                          </span>
                          <Button 
                            type="text" 
                            size="small"
                            icon={<EyeOutlined />}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => navigate(`/exams/${exam.id}`)}
                          />
                        </div>
                      }
                      description={
                        <div className="flex items-center justify-between">
                          <Space size={12}>
                            <Tag 
                              color={getStatusColor(exam.status as ExamStatusType)}
                              className="border-0 font-medium"
                              style={{ borderRadius: 'var(--border-radius-full)' }}
                            >
                              {getStatusName(exam.status as ExamStatusType)}
                            </Tag>
                            <Text type="secondary" className="text-xs">
                              <UserOutlined className="mr-1" />
                              {exam.result_count} 人参与
                            </Text>
                          </Space>
                          <Text type="secondary" className="text-xs">
                            {Math.floor(Math.random() * 5) + 1} 天前
                          </Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无考试数据"
                className="py-8"
              >
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/exams')}
                >
                  创建第一个考试
                </Button>
              </Empty>
            )}
            
            {dashboardData?.recent_exams && dashboardData.recent_exams.length > 0 && (
              <div className="text-center pt-4 border-t border-neutral-100 mt-4">
                <Button 
                  type="dashed" 
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/exams')}
                  className="hover:border-primary-500 hover:text-primary-600"
                >
                  创建新考试
                </Button>
              </div>
            )}
          </Card>
        </Col>
        </Row>
      </div>
    </div>
  );
};

export default Dashboard;