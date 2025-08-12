import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Typography,
  Button,
  Space,
  Empty,
  message,
  Tag,
  Tooltip,
  Input,
  Select,
  Modal,
  Row,
  Col,
  Alert,
  Divider,
  Table,
  InputNumber,
  Spin,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  CopyOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ExperimentOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { paperApi, questionApi } from '../services/api';
import type { Paper, Question, CreateQuestionForm } from '../types';
import type { ColumnsType } from 'antd/es/table';
import QuestionModal from '../components/QuestionModal';

const { Title } = Typography;

const PaperDetail: React.FC = () => {
  const { paperId } = useParams<{ paperId: string }>();
  const navigate = useNavigate();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [questionModalVisible, setQuestionModalVisible] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [modal, contextHolder] = Modal.useModal();
  const [updating, setUpdating] = useState<string | null>(null); // 正在更新排序的题目ID

  useEffect(() => {
    if (paperId) {
      loadPaperDetail();
    }
  }, [paperId]);

  const loadPaperDetail = async () => {
    if (!paperId) return;
    
    try {
      setLoading(true);
      const [paperRes, questionsRes] = await Promise.all([
        paperApi.getDetail(paperId),
        questionApi.getList(paperId),
      ]);

      if (paperRes.success && paperRes.data) {
        setPaper(paperRes.data);
      }

      if (questionsRes.success && questionsRes.data) {
        setQuestions(questionsRes.data);
      }
    } catch (error) {
      console.error('加载试卷详情失败:', error);
      message.error('加载试卷详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 处理题目创建或更新
  const handleQuestionSubmit = async (data: CreateQuestionForm) => {
    if (!paperId) return;

    try {
      if (editingQuestion && editingQuestion.id) {
        // 更新题目
        await questionApi.update(editingQuestion.id, data);
        message.success('题目更新成功');
      } else {
        // 创建题目 - 自动计算题目顺序
        const maxOrder = questions.length > 0 
          ? Math.max(...questions.map(q => q.question_order))
          : 0;
        
        const createData = {
          ...data,
          question_order: maxOrder + 1,
        };
        
        await questionApi.create(paperId, createData);
        message.success('题目创建成功');
      }
      
      // 重新加载题目列表
      await loadPaperDetail();
      
      // 关闭模态框并重置状态
      setQuestionModalVisible(false);
      setEditingQuestion(null);
    } catch (error) {
      console.error('题目操作失败:', error);
      throw error; // 让模态框处理错误显示
    }
  };

  // 删除题目
  const handleDeleteQuestion = async (questionId: string) => {
    try {
      await questionApi.delete(questionId);
      message.success('题目删除成功');
      await loadPaperDetail();
    } catch (error) {
      console.error('删除题目失败:', error);
      message.error('删除题目失败');
    }
  };

  // 打开创建题目模态框
  const handleCreateQuestion = () => {
    setEditingQuestion(null);
    setQuestionModalVisible(true);
  };

  // 打开编辑题目模态框
  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setQuestionModalVisible(true);
  };

  // 关闭模态框
  const handleModalCancel = () => {
    setQuestionModalVisible(false);
    setEditingQuestion(null);
  };

  // 复制题目
  const handleCopyQuestion = (question: Question) => {
    // 创建题目副本
    const copyQuestion = {
      ...question,
      id: '', // 清空ID，表示新建
      title: `${question.title} (副本)`,
    };
    
    // 设置为编辑模式，传入复制的题目数据
    setEditingQuestion(copyQuestion);
    setQuestionModalVisible(true);
  };

  // 单个题目排序更新
  const handleQuestionOrderChange = async (questionId: string, newOrder: number) => {
    // 验证输入
    if (!newOrder || isNaN(newOrder) || !Number.isInteger(newOrder)) {
      message.warning('请输入有效的整数');
      return;
    }

    if (newOrder < 1 || newOrder > questions.length) {
      message.warning(`排序号必须在1到${questions.length}之间`);
      return;
    }

    // 防止重复操作
    if (updating === questionId) return;

    // 找到当前题目
    const currentQuestion = questions.find(q => q.id === questionId);
    if (!currentQuestion) {
      message.error('题目不存在');
      return;
    }

    // 如果没有变化，直接返回
    if (currentQuestion.question_order === newOrder) {
      return;
    }

    try {
      setUpdating(questionId);

      // 找到目标位置的题目
      const targetQuestion = questions.find(q => q.question_order === newOrder);

      // 乐观更新：立即更新UI
      const updatedQuestions = [...questions];
      
      if (targetQuestion) {
        // 交换两个题目的排序号
        const currentIndex = updatedQuestions.findIndex(q => q.id === questionId);
        const targetIndex = updatedQuestions.findIndex(q => q.id === targetQuestion.id);
        
        updatedQuestions[currentIndex] = { ...currentQuestion, question_order: newOrder };
        updatedQuestions[targetIndex] = { ...targetQuestion, question_order: currentQuestion.question_order };
        
        message.success(`题目 "${currentQuestion.title.substring(0, 20)}..." 已与排序号${newOrder}的题目交换位置`);
      } else {
        // 直接更新排序号（不应该发生，但以防万一）
        const currentIndex = updatedQuestions.findIndex(q => q.id === questionId);
        updatedQuestions[currentIndex] = { ...currentQuestion, question_order: newOrder };
        
        message.success(`题目排序已更新为${newOrder}`);
      }

      setQuestions(updatedQuestions);

      // 准备批量更新数据
      const questionOrders = updatedQuestions.map((q) => ({
        id: q.id,
        order: q.question_order
      }));

      // 调用后端API持久化
      await questionApi.batchReorder(paperId!, questionOrders);
    } catch (error) {
      console.error('更新排序失败:', error);
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      message.error(`更新排序失败: ${errorMsg}`);
      // 失败时重新加载数据恢复状态
      await loadPaperDetail();
    } finally {
      setUpdating(null);
    }
  };

  // 自动重排序号（将所有题目按顺序重新编号1,2,3...）
  const handleAutoReorder = async () => {
    try {
      setUpdating('batch'); // 使用特殊标识表示批量操作

      // 按当前显示顺序重新分配序号
      const sortedQuestions = [...questions].sort((a, b) => a.question_order - b.question_order);
      const updatedQuestions = sortedQuestions.map((q, index) => ({
        ...q,
        question_order: index + 1
      }));

      setQuestions(updatedQuestions);

      // 准备批量更新数据
      const questionOrders = updatedQuestions.map((q) => ({
        id: q.id,
        order: q.question_order
      }));

      // 调用后端API
      await questionApi.batchReorder(paperId!, questionOrders);
      message.success('题目序号已重新排序');
    } catch (error) {
      console.error('重排序失败:', error);
      message.error('重排序失败，请重试');
      await loadPaperDetail();
    } finally {
      setUpdating(null);
    }
  };

  // 显示删除确认对话框
  const showDeleteConfirm = (question: Question) => {
    modal.confirm({
      title: '确定删除这道题目吗？',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p><strong>题目标题：</strong>{question.title}</p>
          <p style={{ color: '#ff4d4f', marginTop: '16px' }}>
            删除后将无法恢复！
          </p>
        </div>
      ),
      okText: '确定删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => handleDeleteQuestion(question.id),
    });
  };

  // 题目类型显示
  const getQuestionTypeText = (type: string) => {
    switch (type) {
      case 'single_choice': return '单选题';
      case 'multiple_choice': return '多选题';
      case 'text': return '文本题';
      default: return type;
    }
  };

  const getQuestionTypeColor = (type: string) => {
    switch (type) {
      case 'single_choice': return 'blue';
      case 'multiple_choice': return 'green';
      case 'text': return 'orange';
      default: return 'default';
    }
  };

  // 过滤题目
  const getFilteredQuestions = (): Question[] => {
    return questions.filter(question => {
      // 搜索过滤
      const matchSearch = question.title.toLowerCase().includes(searchText.toLowerCase());
      
      // 类型过滤
      const matchType = typeFilter === 'all' || question.question_type === typeFilter;
      
      return matchSearch && matchType;
    });
  };

  // 表格列配置
  const columns: ColumnsType<Question> = [
    {
      title: '排序',
      dataIndex: 'question_order',
      key: 'question_order',
      width: 100,
      sorter: (a, b) => a.question_order - b.question_order,
      defaultSortOrder: 'ascend',
      render: (text: number, record: Question) => (
        <div style={{ position: 'relative' }}>
          <InputNumber
            min={1}
            max={questions.length}
            value={text}
            size="small"
            style={{ width: 70 }}
            disabled={updating === record.id}
            onChange={(value) => handleQuestionOrderChange(record.id, value as number)}
            placeholder="序号"
          />
          {updating === record.id && (
            <div style={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none'
            }}>
              <Spin size="small" />
            </div>
          )}
        </div>
      ),
    },
    {
      title: '题目信息',
      key: 'info',
      render: (_, record) => (
        <div>
          <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tag color={getQuestionTypeColor(record.question_type)}>
              {getQuestionTypeText(record.question_type)}
            </Tag>
            {record.is_required !== false && (
              <Tag color="red">必填</Tag>
            )}
          </div>
          <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>
            {record.title}
          </div>
          <div style={{ fontSize: '12px', color: '#999' }}>
            选项数量：{Object.keys(record.options || {}).length}
          </div>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="编辑题目">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditQuestion(record)}
            />
          </Tooltip>
          <Tooltip title="复制题目">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopyQuestion(record)}
            />
          </Tooltip>
          <Tooltip title="删除题目">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => showDeleteConfirm(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, fontSize: '16px', color: '#666' }}>
            加载中...
          </div>
        </div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <Empty
          description="试卷不存在或已被删除"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button 
            type="primary" 
            size="large"
            onClick={() => navigate('/papers')}
          >
            返回试卷列表
          </Button>
        </Empty>
      </div>
    );
  }

  // 计算统计数据
  const statistics = {
    totalQuestions: questions.length,
    singleChoice: questions.filter(q => q.question_type === 'single_choice').length,
    multipleChoice: questions.filter(q => q.question_type === 'multiple_choice').length,
    textQuestions: questions.filter(q => q.question_type === 'text').length,
    requiredQuestions: questions.filter(q => q.is_required !== false).length,
  };

  return (
    <div>
      {/* 重要：必须添加contextHolder才能显示Modal */}
      {contextHolder}
      
      <div>
        {/* Hero区域 - 横向分布优化 */}
        <Card style={{ marginBottom: 24 }}>
          <Row align="middle" justify="space-between" gutter={[24, 16]}>
            {/* 左侧内容区 */}
            <Col flex="1">
              <div>
                {/* 第一行：导航、标题和标签页类型 */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                  <Button 
                    icon={<ArrowLeftOutlined />} 
                    onClick={() => navigate('/papers')}
                    style={{ marginRight: 16 }}
                  >
                    返回
                  </Button>
                  <Title level={1} style={{ margin: 0, fontSize: '1.8rem', marginRight: 16 }}>
                    {paper.title}
                  </Title>
                  <Tag color="processing">试卷详情</Tag>
                </div>
                
                {/* 第二行：描述 */}
                {paper.description && (
                  <Typography.Text type="secondary" style={{ fontSize: '14px', display: 'block', marginBottom: 12 }}>
                    {paper.description}
                  </Typography.Text>
                )}
                
                {/* 第三行：统计标签 */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: 12 }}>
                  <Tag color="magenta" style={{ padding: '2px 8px', fontSize: '13px', fontWeight: 500 }}>
                    <FileTextOutlined /> 总计 {statistics.totalQuestions} 题
                  </Tag>
                  <Tag color="cyan" style={{ padding: '2px 8px', fontSize: '13px', fontWeight: 500 }}>
                    <CheckCircleOutlined /> 单选 {statistics.singleChoice}
                  </Tag>
                  <Tag color="lime" style={{ padding: '2px 8px', fontSize: '13px', fontWeight: 500 }}>
                    <BarChartOutlined /> 多选 {statistics.multipleChoice}
                  </Tag>
                  <Tag color="red" style={{ padding: '2px 8px', fontSize: '13px', fontWeight: 500 }}>
                    <ExclamationCircleOutlined /> 必填 {statistics.requiredQuestions}
                  </Tag>
                  {statistics.textQuestions > 0 && (
                    <Tag color="purple" style={{ padding: '2px 8px', fontSize: '13px', fontWeight: 500 }}>
                      <EditOutlined /> 文本 {statistics.textQuestions}
                    </Tag>
                  )}
                  <Divider type="vertical" />
                  <Typography.Text type="secondary" style={{ fontSize: '13px' }}>
                    <ClockCircleOutlined /> {new Date(paper.created_at).toLocaleDateString()}
                  </Typography.Text>
                  {paper.exam_count > 0 && (
                    <>
                      <Divider type="vertical" />
                      <Typography.Text type="secondary" style={{ fontSize: '13px' }}>
                        <ExperimentOutlined /> {paper.exam_count} 次考试
                      </Typography.Text>
                    </>
                  )}
                </div>
                
                {/* 第四行：操作提示 */}
                <Alert
                  message="简洁的题目管理界面，支持题目的增删改查。必填题目将在学生答题时进行验证。"
                  type="info"
                  showIcon
                  style={{ fontSize: '13px' }}
                />
              </div>
            </Col>
            
            {/* 右侧操作区 */}
            <Col>
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                size="large"
                onClick={handleCreateQuestion}
              >
                添加题目
              </Button>
            </Col>
          </Row>
        </Card>

        {/* 搜索筛选区域 */}
        <Card style={{ marginBottom: 24 }}>
          <Row gutter={16} align="middle">
            <Col span={8}>
              <Input
                placeholder="搜索题目内容..."
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                }}
                allowClear
                size="large"
              />
            </Col>
            <Col span={6}>
              <Select
                placeholder="筛选题目类型"
                value={typeFilter}
                onChange={(value) => {
                  setTypeFilter(value);
                }}
                style={{ width: '100%' }}
                size="large"
              >
                <Select.Option value="all">全部类型</Select.Option>
                <Select.Option value="single_choice">单选题</Select.Option>
                <Select.Option value="multiple_choice">多选题</Select.Option>
                <Select.Option value="text">文本题</Select.Option>
              </Select>
            </Col>
            <Col span={10}>
              <Typography.Text type="secondary">
                显示 {getFilteredQuestions().length} / {questions.length} 题
              </Typography.Text>
            </Col>
          </Row>
        </Card>

        {/* 题目列表表格 */}
        <Card 
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>题目列表</span>
              {questions.length > 0 && (
                <Space>
                  <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                    📝 直接修改排序号可调整题目顺序
                  </Typography.Text>
                  <Button 
                    size="small" 
                    loading={updating === 'batch'}
                    disabled={!!updating}
                    onClick={handleAutoReorder}
                  >
                    自动重排序号
                  </Button>
                </Space>
              )}
            </div>
          }
        >
          {questions.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无题目数据"
              style={{ padding: '48px 0' }}
            >
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                size="large"
                onClick={handleCreateQuestion}
              >
                立即添加题目
              </Button>
            </Empty>
          ) : (
            <Table
              columns={columns}
              dataSource={getFilteredQuestions()}
              rowKey="id"
              scroll={{ x: 800 }}
              loading={!!updating}
              pagination={{
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => 
                  `显示 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
                pageSizeOptions: ['10', '20', '50'],
                defaultPageSize: 10,
              }}
            />
          )}
        </Card>
      </div>

      {/* 题目创建/编辑模态框 */}
      <QuestionModal
        visible={questionModalVisible}
        question={editingQuestion}
        onCancel={handleModalCancel}
        onSubmit={handleQuestionSubmit}
      />
    </div>
  );
};

export default PaperDetail;