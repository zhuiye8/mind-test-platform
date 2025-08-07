import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Typography,
  Button,
  Space,
  Spin,
  Empty,
  message,
  Descriptions,
  Table,
  Tag,
  Popconfirm,
  Tooltip,
  Input,
  Select,
  Modal,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SortAscendingOutlined,
  SearchOutlined,
  FilterOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { paperApi, questionApi } from '../services/api';
import type { Paper, Question, CreateQuestionForm } from '../types';
import QuestionModal from '../components/QuestionModal';

const { Title, Text } = Typography;

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
  const [selectedRows, setSelectedRows] = useState<Question[]>([]);
  const [modal, contextHolder] = Modal.useModal();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  // 批量删除题目
  const handleBatchDelete = () => {
    if (selectedRows.length === 0) {
      message.warning('请选择要删除的题目');
      return;
    }

    modal.confirm({
      title: `确定删除这 ${selectedRows.length} 道题目吗？`,
      content: '删除后将无法恢复，相关的条件逻辑也会失效。',
      onOk: async () => {
        try {
          // 批量删除题目
          await Promise.all(selectedRows.map(q => questionApi.delete(q.id)));
          message.success(`成功删除 ${selectedRows.length} 道题目`);
          setSelectedRows([]);
          await loadPaperDetail();
        } catch (error) {
          console.error('批量删除失败:', error);
          message.error('批量删除失败');
        }
      },
    });
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

  // 行选择配置
  const rowSelection = {
    selectedRowKeys: selectedRows.map(q => q.id),
    onChange: (_selectedRowKeys: React.Key[], selectedRows: Question[]) => {
      setSelectedRows(selectedRows);
    },
  };

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

  const columns: ColumnsType<Question> = [
    {
      title: '序号',
      dataIndex: 'question_order',
      key: 'question_order',
      width: 80,
      sorter: (a, b) => a.question_order - b.question_order,
    },
    {
      title: '题目内容',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '题目类型',
      dataIndex: 'question_type',
      key: 'question_type',
      width: 100,
      render: (type: string) => (
        <Tag color={getQuestionTypeColor(type)}>
          {getQuestionTypeText(type)}
        </Tag>
      ),
    },
    {
      title: '选项数量',
      key: 'options_count',
      width: 100,
      render: (_, record: Question) => (
        <Text>{Object.keys(record.options || {}).length} 个</Text>
      ),
    },
    {
      title: '条件显示',
      key: 'has_condition',
      width: 100,
      render: (_, record: Question) => (
        record.display_condition ? 
          <Tag color="purple">有条件</Tag> : 
          <Tag>无条件</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, record: Question) => (
        <Space size="small" wrap>
          <Tooltip title="编辑题目">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditQuestion(record)}
            >
              编辑
            </Button>
          </Tooltip>
          <Tooltip title="复制题目">
            <Button
              type="link"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => handleCopyQuestion(record)}
            >
              复制
            </Button>
          </Tooltip>
          <Popconfirm
            title="确定删除这道题目吗？"
            description="删除后将无法恢复，相关的条件逻辑也会失效。"
            onConfirm={() => handleDeleteQuestion(record.id)}
            okText="删除"
            cancelText="取消"
            okType="danger"
          >
            <Tooltip title="删除题目">
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
              >
                删除
              </Button>
            </Tooltip>
          </Popconfirm>
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

  if (!paper) {
    return (
      <Empty
        description="试卷不存在或已被删除"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      >
        <Button type="primary" onClick={() => navigate('/papers')}>
          返回试卷列表
        </Button>
      </Empty>
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
            onClick={() => navigate('/papers')}
          >
            返回
          </Button>
          <Title level={2} style={{ margin: 0 }}>
            {paper.title}
          </Title>
        </Space>
      </div>

      {/* 试卷信息 */}
      <Card style={{ marginBottom: 24 }}>
        <Descriptions title="试卷信息" column={2}>
          <Descriptions.Item label="试卷名称">
            {paper.title}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {new Date(paper.created_at).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="题目数量">
            {questions.length} 题
          </Descriptions.Item>
          <Descriptions.Item label="考试次数">
            {paper.exam_count} 次
          </Descriptions.Item>
          <Descriptions.Item label="试卷描述" span={2}>
            {paper.description || '暂无描述'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 题目列表 */}
      <Card
        title={
          <Space>
            <span>题目列表</span>
            <Text type="secondary">({getFilteredQuestions().length} / {questions.length} 题)</Text>
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="对题目按序号排序">
              <Button
                icon={<SortAscendingOutlined />}
                onClick={() => {
                  const sorted = [...questions].sort((a, b) => a.question_order - b.question_order);
                  setQuestions(sorted);
                }}
              >
                排序
              </Button>
            </Tooltip>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateQuestion}
            >
              添加题目
            </Button>
          </Space>
        }
      >
        {/* 搜索和筛选工具栏 */}
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            <Input
              placeholder="搜索题目内容..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setCurrentPage(1); // 搜索时重置到第一页
              }}
              style={{ width: 250 }}
              allowClear
            />
            <Select
              placeholder="筛选题目类型"
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value);
                setCurrentPage(1); // 筛选时重置到第一页
              }}
              style={{ width: 150 }}
              suffixIcon={<FilterOutlined />}
            >
              <Select.Option value="all">全部类型</Select.Option>
              <Select.Option value="single_choice">单选题</Select.Option>
              <Select.Option value="multiple_choice">多选题</Select.Option>
              <Select.Option value="text">文本题</Select.Option>
            </Select>
            
            {/* 批量操作按钮 */}
            {selectedRows.length > 0 && (
              <Space>
                <Text type="secondary">已选择 {selectedRows.length} 项</Text>
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={handleBatchDelete}
                >
                  批量删除
                </Button>
              </Space>
            )}
          </Space>
        </div>
        <Table
          columns={columns}
          dataSource={getFilteredQuestions()}
          rowKey="id"
          rowSelection={rowSelection}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: getFilteredQuestions().length,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 道题目`,
            onChange: (page, size) => {
              setCurrentPage(page);
              if (size !== pageSize) {
                setPageSize(size);
                setCurrentPage(1); // 改变页面大小时回到第一页
              }
            },
          }}
          locale={{ 
            emptyText: (
              <Empty
                description={searchText || typeFilter !== 'all' ? '没有符合条件的题目' : '暂无题目，点击上方按钮添加题目'}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )
          }}
        />
      </Card>

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