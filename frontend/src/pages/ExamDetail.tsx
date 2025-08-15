import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Typography,
  Button,
  Space,
  Descriptions,
  Tag,
  Table,
  Spin,
  Empty,
  message,
  Tooltip,
  Modal,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  ArrowLeftOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  RobotOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { examApi, aiApi } from '../services/api';
import type { Exam, ExamResult } from '../types';
import { ExamStatus, getStatusColor, getStatusName } from '../constants/examStatus';
import type { ExamStatusType } from '../constants/examStatus';
import StudentAnswerDetail from '../components/StudentAnswerDetail';

const { Title, Text, Paragraph } = Typography;

const ExamDetail: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [modal, contextHolder] = Modal.useModal();
  const [exam, setExam] = useState<Exam | null>(null);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [aiGeneratingMap, setAiGeneratingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (examId) {
      loadExamDetail();
      loadExamResults();
    }
  }, [examId]);

  // 加载考试详情
  const loadExamDetail = async () => {
    if (!examId) return;
    
    try {
      setLoading(true);
      const response = await examApi.getDetail(examId);
      if (response.success && response.data) {
        setExam(response.data);
      }
    } catch (error) {
      console.error('加载考试详情失败:', error);
      message.error('加载考试详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载考试结果
  const loadExamResults = async () => {
    if (!examId) return;
    
    try {
      setResultsLoading(true);
      const response = await examApi.getResults(examId);
      if (response.success && response.data?.data) {
        setResults(response.data.data);
      }
    } catch (error) {
      console.error('加载考试结果失败:', error);
      message.error('加载考试结果失败');
    } finally {
      setResultsLoading(false);
    }
  };

  // 统一刷新所有数据（考试详情+结果列表）
  const handleRefreshAll = async () => {
    if (!examId) return;
    
    try {
      // 同时刷新考试详情和结果列表
      setLoading(true);
      setResultsLoading(true);
      
      const [detailResponse, resultsResponse] = await Promise.all([
        examApi.getDetail(examId),
        examApi.getResults(examId)
      ]);
      
      if (detailResponse.success && detailResponse.data) {
        setExam(detailResponse.data);
      }
      
      if (resultsResponse.success && resultsResponse.data?.data) {
        setResults(resultsResponse.data.data);
      }
      
      message.success('页面数据已刷新');
    } catch (error) {
      console.error('刷新数据失败:', error);
      message.error('刷新失败，请重试');
    } finally {
      setLoading(false);
      setResultsLoading(false);
    }
  };

  // 切换发布状态
  const handleTogglePublish = async () => {
    if (!examId || !exam) return;
    
    try {
      setToggleLoading(true);
      const response = await examApi.togglePublish(examId);
      if (response.success) {
        message.success('状态更新成功');
        await loadExamDetail();
      }
    } catch (error) {
      console.error('状态更新失败:', error);
      message.error('状态更新失败');
    } finally {
      setToggleLoading(false);
    }
  };

  // 结束考试
  const handleFinishExam = async () => {
    if (!examId || !exam) return;
    
    try {
      setToggleLoading(true);
      const response = await examApi.finishExam(examId);
      if (response.success) {
        message.success('考试已结束');
        await loadExamDetail();
      } else {
        message.error(response.error || '结束考试失败');
      }
    } catch (error: any) {
      console.error('结束考试失败:', error);
      message.error(error.response?.data?.error || '结束考试失败');
    } finally {
      setToggleLoading(false);
    }
  };

  // 复制公开链接
  const copyPublicUrl = () => {
    if (!exam?.public_url) return;
    
    navigator.clipboard.writeText(exam.public_url).then(() => {
      message.success('链接已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
  };

  // 导出结果
  const handleExportResults = async () => {
    if (!examId) return;
    
    try {
      const blob = await examApi.exportResults(examId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exam?.title || '考试结果'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      message.error('导出失败');
    }
  };

  // 生成AI分析报告
  const handleGenerateAIReport = async (examResult: ExamResult) => {
    if (!examResult.id || aiGeneratingMap[examResult.id]) return;

    try {
      // 设置生成状态
      setAiGeneratingMap(prev => ({ ...prev, [examResult.id]: true }));

      console.log(`[AI分析] 开始为考试结果 ${examResult.id} 生成AI报告`);

      const response = await aiApi.generateReport(examResult.id);

      if (response.success && response.data) {
        message.success('AI分析报告生成成功！');
        
        // 显示报告内容
        modal.info({
          title: `${examResult.participant_name} 的AI心理分析报告`,
          width: 800,
          icon: <RobotOutlined style={{ color: '#1890ff' }} />,
          content: (
            <div style={{ maxHeight: 600, overflow: 'auto' }}>
              <div style={{ 
                whiteSpace: 'pre-wrap', 
                lineHeight: 1.6,
                fontSize: '14px',
                background: '#f5f5f5',
                padding: '16px',
                borderRadius: '8px',
                marginTop: '16px'
              }}>
                {response.data.report}
              </div>
              {response.data.reportFile && (
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <Text type="secondary">
                    报告文件: {response.data.reportFile}
                  </Text>
                </div>
              )}
            </div>
          ),
          okText: '关闭',
        });

        console.log(`[AI分析] 报告生成成功，文件: ${response.data.reportFile}`);
      } else {
        message.error(response.error || 'AI分析报告生成失败');
        console.error('[AI分析] 报告生成失败:', response.error);
      }
    } catch (error: any) {
      console.error('[AI分析] 生成报告时发生错误:', error);
      message.error(error.response?.data?.error || 'AI分析服务连接失败');
    } finally {
      // 清除生成状态
      setAiGeneratingMap(prev => ({ ...prev, [examResult.id]: false }));
    }
  };

  // 检查AI会话状态（暂时未使用，预留功能）
  // const checkAISessionStatus = async (examResultId: string): Promise<boolean> => {
  //   try {
  //     const response = await aiApi.getReportStatus(examResultId);
  //     if (response.success && response.data) {
  //       return response.data.hasAISession;
  //     }
  //     return false;
  //   } catch (error) {
  //     console.warn('[AI分析] 检查AI会话状态失败:', error);
  //     return false;
  //   }
  // };

  // 使用常量文件中的函数
  // const getStatusColor = getStatusColor; // 已导入

  // 使用常量文件中的函数
  // const getStatusText = getStatusName; // 已导入为 getStatusName

  // 结果表格列配置
  const resultColumns: ColumnsType<ExamResult> = [
    {
      title: '学生ID',
      dataIndex: 'participant_id',
      key: 'participant_id',
      width: 120,
    },
    {
      title: '学生姓名',
      dataIndex: 'participant_name',
      key: 'participant_name',
      ellipsis: true,
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 140,
    },
    {
      title: '开始时间',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 160,
      render: (date: string | null) => 
        date ? new Date(date).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : '未知',
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
    },
    {
      title: '答题用时',
      key: 'duration',
      width: 100,
      render: (_, record: ExamResult) => {
        if (!record.started_at || !record.submitted_at) {
          return <Text type="secondary">未知</Text>;
        }
        const startTime = new Date(record.started_at);
        const endTime = new Date(record.submitted_at);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationSeconds = Math.floor(durationMs / 1000);
        
        // 精确显示时间，支持秒级
        if (durationSeconds < 60) {
          // 0-59秒：显示秒数
          const color = durationSeconds <= 10 ? '#ff4d4f' : '#52c41a';
          return <Text style={{ color }}>{durationSeconds}秒</Text>;
        } else if (durationSeconds < 3600) {
          // 1分钟-59分钟：显示分钟+秒数
          const minutes = Math.floor(durationSeconds / 60);
          const seconds = durationSeconds % 60;
          const color = minutes < 30 ? '#52c41a' : minutes < 60 ? '#faad14' : '#ff4d4f';
          return <Text style={{ color }}>{minutes}分{seconds}秒</Text>;
        } else {
          // 1小时以上：显示小时+分钟
          const hours = Math.floor(durationSeconds / 3600);
          const minutes = Math.floor((durationSeconds % 3600) / 60);
          return <Text style={{ color: '#ff4d4f' }}>{hours}小时{minutes}分</Text>;
        }
      },
    },
    {
      title: '答题数量',
      key: 'answer_count',
      width: 100,
      render: (_, record: ExamResult) => {
        const count = Object.keys(record.answers || {}).length;
        return (
          <Tag color={count > 0 ? 'blue' : 'default'}>
            {count} 题
          </Tag>
        );
      },
    },
    {
      title: '分数',
      dataIndex: 'score',
      key: 'score',
      width: 80,
      render: (score: number | null | undefined, record: ExamResult) => {
        if (score === null || score === undefined) {
          return <Text type="secondary">-</Text>;
        }
        
        // 通过答题数量和分数判断是否为计分题目
        const answerCount = Object.keys(record.answers || {}).length;
        
        // 如果有答题但分数为0，可能是不计分题目
        if (score === 0 && answerCount > 0) {
          return (
            <Text type="secondary" style={{ fontStyle: 'italic' }}>
              不计分
            </Text>
          );
        }
        
        return (
          <Text strong style={{ color: '#722ed1' }}>
            {score}分
          </Text>
        );
      },
      sorter: (a: ExamResult, b: ExamResult) => (a.score || 0) - (b.score || 0),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record: ExamResult) => (
        <Space size={4}>
          <Tooltip title="查看详细答案">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                modal.info({
                  title: `${record.participant_name} 的答案详情`,
                  width: 900,
                  icon: null,
                  content: (
                    <StudentAnswerDetail 
                      examResult={record} 
                      examId={examId!} 
                    />
                  ),
                  okText: '关闭',
                });
              }}
            >
              查看
            </Button>
          </Tooltip>
          
          <Tooltip title="生成AI心理分析报告">
            <Button
              type="link"
              size="small"
              icon={aiGeneratingMap[record.id] ? <LoadingOutlined /> : <RobotOutlined />}
              loading={aiGeneratingMap[record.id]}
              onClick={() => handleGenerateAIReport(record)}
              style={{ color: '#1890ff' }}
            >
              AI分析
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/exams')}
          >
            返回
          </Button>
        </div>
        <Empty
          description="考试不存在或已被删除"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" onClick={() => navigate('/exams')}>
            返回考试列表
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div>
      {/* 重要：必须添加contextHolder才能显示Modal */}
      {contextHolder}
      {/* 导航栏 */}
      <div style={{ marginBottom: 24 }}>
        <Space>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/exams')}
          >
            返回
          </Button>
          <Title level={2} style={{ margin: 0 }}>
            {exam.title}
          </Title>
          <Tag color={getStatusColor(exam.status as ExamStatusType)}>
            {getStatusName(exam.status as ExamStatusType)}
          </Tag>
        </Space>
      </div>

      {/* 统计信息 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="参与人数"
              value={exam.participant_count || 0}
              suffix="人"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="题目数量"
              value={exam.question_count || 0}
              suffix="题"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="考试时长"
              value={exam.duration_minutes || 0}
              suffix="分钟"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="完成率"
              value={(exam.participant_count || 0) > 0 ? 100 : 0}
              suffix="%"
              precision={1}
            />
          </Card>
        </Col>
      </Row>

      {/* 考试信息 */}
      <Card 
        title="考试信息" 
        style={{ marginBottom: 24 }}
        extra={
          <Space>
            <Tooltip title="刷新考试详情和结果列表">
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefreshAll}
                loading={loading || resultsLoading}
              >
                刷新全部
              </Button>
            </Tooltip>
            {exam.status === ExamStatus.PUBLISHED && (
              <Button
                icon={<LinkOutlined />}
                onClick={copyPublicUrl}
              >
                复制链接
              </Button>
            )}
            {/* 根据状态显示不同的操作按钮 */}
            {exam.status === ExamStatus.DRAFT && (
              <Button
                type="primary"
                loading={toggleLoading}
                icon={<PlayCircleOutlined />}
                onClick={handleTogglePublish}
              >
                发布考试
              </Button>
            )}
            {exam.status === ExamStatus.PUBLISHED && (
              <Space>
                <Button
                  loading={toggleLoading}
                  icon={<CheckCircleOutlined />}
                  onClick={handleFinishExam}
                >
                  结束考试
                </Button>
                <Button
                  danger
                  loading={toggleLoading}
                  icon={<StopOutlined />}
                  onClick={handleTogglePublish}
                >
                  停止考试
                </Button>
              </Space>
            )}
          </Space>
        }
      >
        <Descriptions column={2}>
          <Descriptions.Item label="考试标题">
            {exam.title}
          </Descriptions.Item>
          <Descriptions.Item label="基础试卷">
            {exam.paper_title || '未知试卷'}
          </Descriptions.Item>
          <Descriptions.Item label="考试时长">
            {exam.duration_minutes || 0} 分钟
          </Descriptions.Item>
          <Descriptions.Item label="题目顺序">
            {exam.shuffle_questions ? '随机打乱' : '按序显示'}
          </Descriptions.Item>
          <Descriptions.Item label="密码保护">
            {exam.has_password ? '需要密码' : '无需密码'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {new Date(exam.created_at).toLocaleString()}
          </Descriptions.Item>
          {exam.start_time && (
            <Descriptions.Item label="开始时间">
              {new Date(exam.start_time).toLocaleString()}
            </Descriptions.Item>
          )}
          {exam.end_time && (
            <Descriptions.Item label="结束时间">
              {new Date(exam.end_time).toLocaleString()}
            </Descriptions.Item>
          )}
          {exam.status === ExamStatus.PUBLISHED && (
            <Descriptions.Item label="公开链接" span={2}>
              <Paragraph copyable={{ text: exam.public_url }}>
                {exam.public_url}
              </Paragraph>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* 考试结果 */}
      <Card
        title={
          <Space>
            <span>考试结果</span>
            <Text type="secondary">({results.length} 人参与)</Text>
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadExamResults}
              loading={resultsLoading}
            >
              刷新
            </Button>
            {results.length > 0 && (
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportResults}
              >
                导出结果
              </Button>
            )}
          </Space>
        }
      >
        <Table
          columns={resultColumns}
          dataSource={results}
          loading={resultsLoading}
          rowKey="id"
          scroll={{ x: 1200 }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          locale={{ 
            emptyText: (
              <Empty
                description="暂无参与记录"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )
          }}
        />
      </Card>
    </div>
  );
};

export default ExamDetail;