import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Row,
  Col,
  Statistic,
  Table,
  Select,
  Button,
  Space,
  Tag,
  message,
  Empty,
  Modal,
} from 'antd';
import {
  BarChartOutlined,
  UserOutlined,
  FileTextOutlined,
  ExperimentOutlined,
  TrophyOutlined,
  ReloadOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { analyticsApi, examApi } from '../services/api';
import type { AnalyticsData } from '../types';
import { getStatusColor, getStatusName, ExamStatus } from '../constants/examStatus';
import type { ExamStatusType } from '../constants/examStatus';

const { Title, Text } = Typography;
const { Option } = Select;

// 参与者列表弹窗组件
const ParticipantModal: React.FC<{
  visible: boolean;
  examId: string | null;
  onCancel: () => void;
}> = ({ visible, examId, onCancel }) => {
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && examId) {
      loadParticipants();
    }
  }, [visible, examId]);

  const loadParticipants = async () => {
    if (!examId) return;
    
    try {
      setLoading(true);
      const response = await examApi.getExamSubmissions(examId);
      if (response.success && response.data) {
        // 转换数据格式为表格需要的格式
        const formattedParticipants = response.data.data.map((result: any) => ({
          id: result.id,
          student_id: result.participant_id,
          student_name: result.participant_name,
          submitted_at: result.submitted_at,
          score: result.score,
          ip_address: result.ip_address,
        }));
        setParticipants(formattedParticipants);
      } else {
        setParticipants([]);
      }
    } catch (error) {
      console.error('加载参与者失败:', error);
      message.error('加载参与者失败');
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  };

  const participantColumns: ColumnsType<any> = [
    {
      title: '学号',
      dataIndex: 'student_id',
      key: 'student_id',
    },
    {
      title: '姓名',
      dataIndex: 'student_name',
      key: 'student_name',
    },
    {
      title: '分数',
      dataIndex: 'score',
      key: 'score',
      render: (score: number) => {
        if (score === null || score === undefined) {
          return <Text type="secondary">-</Text>;
        }
        if (score === 0) {
          return (
            <Text type="secondary" style={{ fontStyle: 'italic' }}>
              不计分
            </Text>
          );
        }
        return `${score}分`;
      },
      sorter: (a: any, b: any) => (a.score || 0) - (b.score || 0),
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      render: (ip: string) => ip || '-',
    },
  ];

  return (
    <Modal
      title="参与者列表"
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="confirm" type="primary" onClick={onCancel}>
          确认
        </Button>
      ]}
      width={600}
    >
      <Table
        columns={participantColumns}
        dataSource={participants}
        rowKey="id"
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 人参与`,
          defaultPageSize: 5,
        }}
        locale={{
          emptyText: <Empty description="暂无参与者" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        }}
      />
    </Modal>
  );
};

const Analytics: React.FC = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  // const [statusFilter, setStatusFilter] = useState<string>('all'); // 暂未使用
  const [participantModalVisible, setParticipantModalVisible] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  useEffect(() => {
    loadAnalyticsData();
  }, [timeRange]);

  // 加载分析数据
  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const response = await analyticsApi.getData(timeRange);
      if (response.success && response.data) {
        setAnalyticsData(response.data);
      }
    } catch (error) {
      console.error('加载分析数据失败:', error);
      message.error('加载分析数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 导出分析报告
  const handleExportReport = async () => {
    try {
      // 模拟导出功能
      message.success('导出功能开发中，敬请期待');
    } catch (error) {
      console.error('导出失败:', error);
      message.error('导出失败');
    }
  };

  // 显示参与者列表
  const handleShowParticipants = (examId: string) => {
    setSelectedExamId(examId);
    setParticipantModalVisible(true);
  };

  // 获取时间范围显示文本
  const getTimeRangeText = (range: string) => {
    switch (range) {
      case '7d': return '最近7天';
      case '30d': return '最近30天';
      case '90d': return '最近90天';
      case '1y': return '最近1年';
      default: return '最近30天';
    }
  };

  // 考试表现表格列配置
  const examPerformanceColumns: ColumnsType<any> = [
    {
      title: '考试名称',
      dataIndex: 'exam_title',
      key: 'exam_title',
      render: (text: string) => (
        <Text strong style={{ color: '#1890ff' }}>{text}</Text>
      ),
    },
    {
      title: '试卷',
      dataIndex: 'paper_title',
      key: 'paper_title',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: ExamStatusType) => (
        <Tag color={getStatusColor(status)}>
          {getStatusName(status)}
        </Tag>
      ),
      filters: [
        { text: '草稿', value: ExamStatus.DRAFT },
        { text: '进行中', value: ExamStatus.PUBLISHED },
        { text: '已停止', value: ExamStatus.EXPIRED },
        { text: '已结束', value: ExamStatus.SUCCESS },
        { text: '已归档', value: ExamStatus.ARCHIVED },
      ],
      onFilter: (value: any, record: any) => record.status === value,
    },
    {
      title: '参与人数',
      dataIndex: 'participant_count',
      key: 'participant_count',
      width: 120,
      render: (count: number, record: any) => (
        <Button
          type="link"
          onClick={() => handleShowParticipants(record.exam_id)}
          style={{ 
            padding: '4px 8px',
            height: 'auto',
            borderRadius: '4px',
            border: '1px dashed #1890ff',
            backgroundColor: '#f0f9ff'
          }}
        >
          <Space size={4}>
            <UserOutlined style={{ color: '#1890ff' }} />
            <span style={{ color: '#1890ff', fontWeight: 500 }}>{count} 人</span>
          </Space>
        </Button>
      ),
      sorter: (a: any, b: any) => a.participant_count - b.participant_count,
    },
    // {
    //   title: '完成率',
    //   dataIndex: 'completion_rate',
    //   key: 'completion_rate',
    //   width: 120,
    //   render: (rate: number) => (
    //     <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    //       <Progress
    //         percent={rate}
    //         size="small"
    //         style={{ width: 60 }}
    //         strokeColor={rate >= 80 ? '#52c41a' : rate >= 60 ? '#faad14' : '#ff4d4f'}
    //       />
    //       <Text>{rate.toFixed(1)}%</Text>
    //     </div>
    //   ),
    //   sorter: (a: any, b: any) => a.completion_rate - b.completion_rate,
    // },
    {
      title: '平均用时',
      dataIndex: 'avg_duration',
      key: 'avg_duration',
      width: 120,
      render: (minutes: number) => `${minutes.toFixed(0)}分钟`,
      sorter: (a: any, b: any) => a.avg_duration - b.avg_duration,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (date: string) => new Date(date).toLocaleDateString(),
      sorter: (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
  ];


  return (
    <div>
      {/* 页面标题和操作 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 24 
      }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            数据分析
          </Title>
          <Text type="secondary">
            查看系统使用情况和考试表现数据
          </Text>
        </div>
        <Space>
          <Select
            value={timeRange}
            onChange={setTimeRange}
            style={{ width: 120 }}
          >
            <Option value="7d">最近7天</Option>
            <Option value="30d">最近30天</Option>
            <Option value="90d">最近90天</Option>
            <Option value="1y">最近1年</Option>
          </Select>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadAnalyticsData}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportReport}
          >
            导出报告
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Text>正在加载数据分析...</Text>
        </div>
      ) : !analyticsData ? (
        <Card>
          <Empty
            description="暂无分析数据"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      ) : (
        <>
          {/* 总体统计卡片 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="试卷总数"
                  value={analyticsData.overall_stats.total_papers}
                  prefix={<FileTextOutlined style={{ color: '#1890ff' }} />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="考试总数"
                  value={analyticsData.overall_stats.total_exams}
                  prefix={<ExperimentOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="参与总人数"
                  value={analyticsData.overall_stats.total_participants}
                  prefix={<UserOutlined style={{ color: '#faad14' }} />}
                  valueStyle={{ color: '#faad14' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="考试参与率"
                  value={analyticsData.overall_stats.avg_completion_rate}
                  suffix="%"
                  precision={1}
                  prefix={<BarChartOutlined style={{ color: '#722ed1' }} />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
          </Row>

          {/* 热门考试和月度趋势 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {/* 最受欢迎的考试 */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <TrophyOutlined style={{ color: '#faad14' }} />
                    最受欢迎的考试
                  </Space>
                }
                size="small"
              >
                {analyticsData.overall_stats.most_popular_exam ? (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 16, color: '#1890ff' }}>
                        {analyticsData.overall_stats.most_popular_exam.title}
                      </Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text type="secondary">参与人数</Text>
                      <Text strong style={{ color: '#52c41a' }}>
                        {analyticsData.overall_stats.most_popular_exam.participant_count} 人
                      </Text>
                    </div>
                  </div>
                ) : (
                  <Empty
                    description="暂无数据"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    style={{ margin: '20px 0' }}
                  />
                )}
              </Card>
            </Col>

            {/* 时间范围总结 */}
            <Col xs={24} lg={12}>
              <Card
                title={`${getTimeRangeText(timeRange)}数据总结`}
                size="small"
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">新增考试</Text>
                    <Text strong>{analyticsData.monthly_trends?.reduce((sum, item) => sum + item.exams_created, 0) || 0} 个</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">新增参与</Text>
                    <Text strong>{analyticsData.monthly_trends?.reduce((sum, item) => sum + item.participants, 0) || 0} 人次</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary">平均参与人数</Text>
                    <Text strong>
                      {analyticsData.monthly_trends?.length > 0
                        ? (analyticsData.monthly_trends.reduce((sum, item) => sum + item.completion_rate, 0) / analyticsData.monthly_trends.length).toFixed(1)
                        : 0} 人/考试
                    </Text>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {/* 考试表现详情表 */}
          <Card
            title={
              <Space>
                <BarChartOutlined />
                考试表现详情
              </Space>
            }
          >
            <Table
              columns={examPerformanceColumns}
              dataSource={analyticsData.exam_performance}
              rowKey="exam_id"
              pagination={{
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 项考试`,
                defaultPageSize: 10,
              }}
              locale={{
                emptyText: (
                  <Empty
                    description="暂无考试数据"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                )
              }}
            />
          </Card>
        </>
      )}

      {/* 参与者列表弹窗 */}
      <ParticipantModal
        visible={participantModalVisible}
        examId={selectedExamId}
        onCancel={() => {
          setParticipantModalVisible(false);
          setSelectedExamId(null);
        }}
      />
    </div>
  );
};

export default Analytics;