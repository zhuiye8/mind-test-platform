import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Space,
  Typography,
  Card,
  Modal,
  Form,
  Input,
  message,
  Tag,
  Tooltip,
  Row,
  Col,
  Statistic,
  Badge,
  Avatar,
  Divider,
  Empty,
  Skeleton,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  BookOutlined,
  BarChartOutlined,
  CalendarOutlined,
  SearchOutlined,
  FilterOutlined,
  MoreOutlined,
  SettingOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { paperApi } from '../services/api';
import type { Paper, CreatePaperForm } from '../types';

const { Title } = Typography;
const { TextArea } = Input;

const PaperList: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [filteredPapers, setFilteredPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [modal, contextHolder] = Modal.useModal();

  useEffect(() => {
    loadPapers();
  }, []);

  // 搜索过滤
  useEffect(() => {
    if (!searchValue.trim()) {
      setFilteredPapers(papers);
    } else {
      const filtered = papers.filter(paper =>
        paper.title.toLowerCase().includes(searchValue.toLowerCase()) ||
        (paper.description && paper.description.toLowerCase().includes(searchValue.toLowerCase()))
      );
      setFilteredPapers(filtered);
    }
  }, [papers, searchValue]);

  // 计算统计数据
  const statistics = {
    totalPapers: papers.length,
    totalQuestions: papers.reduce((sum, paper) => sum + paper.question_count, 0),
    totalExams: papers.reduce((sum, paper) => sum + paper.exam_count, 0),
    activePapers: papers.filter(paper => paper.question_count > 0).length,
  };

  // 加载试卷列表
  const loadPapers = async () => {
    try {
      setLoading(true);
      const response = await paperApi.getList();
      if (response.success && response.data) {
        setPapers(response.data);
        setFilteredPapers(response.data);
      }
    } catch (error) {
      console.error('加载试卷列表失败:', error);
      message.error('加载试卷列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 创建或更新试卷
  const handleSubmit = async (values: CreatePaperForm) => {
    try {
      if (editingPaper) {
        // 更新试卷
        const response = await paperApi.update(editingPaper.id, values);
        if (response.success) {
          message.success('试卷更新成功');
          loadPapers();
        }
      } else {
        // 创建试卷
        const response = await paperApi.create(values);
        if (response.success) {
          message.success('试卷创建成功');
          loadPapers();
        }
      }
      setModalVisible(false);
      form.resetFields();
      setEditingPaper(null);
    } catch (error) {
      console.error('操作失败:', error);
      message.error('操作失败，请重试');
    }
  };

  // 删除试卷
  const handleDelete = async (paperId: string) => {
    try {
      const response = await paperApi.delete(paperId);
      if (response.success) {
        message.success('试卷删除成功');
        loadPapers();
      } else {
        message.error(response.error || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败，请重试');
    }
  };

  // 判断试卷是否可以删除
  const canDeletePaper = (paper: Paper): boolean => {
    // 如果有关联的考试，不能删除
    return paper.exam_count === 0;
  };

  // 获取删除按钮的提示信息
  const getDeleteTooltip = (paper: Paper): string => {
    if (paper.exam_count > 0) {
      return `该试卷有 ${paper.exam_count} 个关联考试，无法删除`;
    }
    return '删除试卷';
  };

  // 显示删除限制信息
  const showDeleteRestriction = (paper: Paper) => {
    modal.info({
      title: '无法删除试卷',
      icon: <InfoCircleOutlined />,
      content: (
        <div>
          <p>试卷 <strong>"{paper.title}"</strong> 无法删除，原因如下：</p>
          <ul style={{ marginTop: 16, marginBottom: 16 }}>
            <li>该试卷关联了 <strong>{paper.exam_count}</strong> 个考试</li>
            <li>删除试卷会影响现有考试的正常运行</li>
          </ul>
          <p style={{ color: '#1890ff' }}>
            <strong>建议操作：</strong>
          </p>
          <ul>
            <li>先删除或结束相关考试</li>
            <li>确保没有进行中的考试后再删除试卷</li>
          </ul>
        </div>
      ),
      okText: '我知道了',
      width: 500,
    });
  };

  // 显示删除确认对话框
  const showDeleteConfirm = (paper: Paper) => {
    if (!canDeletePaper(paper)) {
      showDeleteRestriction(paper);
      return;
    }

    modal.confirm({
      title: '确定删除这个试卷吗？',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p><strong>试卷名称：</strong>{paper.title}</p>
          <p><strong>题目数量：</strong>{paper.question_count} 题</p>
          <p style={{ color: '#ff4d4f', marginTop: 16 }}>
            删除后将无法恢复，试卷中的所有题目也会被删除！
          </p>
        </div>
      ),
      okText: '确定删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => handleDelete(paper.id),
    });
  };

  // 打开编辑模态框
  const handleEdit = (paper: Paper) => {
    setEditingPaper(paper);
    form.setFieldsValue({
      title: paper.title,
      description: paper.description,
    });
    setModalVisible(true);
  };

  // 打开创建模态框
  const handleCreate = () => {
    setEditingPaper(null);
    form.resetFields();
    setModalVisible(true);
  };

  // 现代化表格列配置
  const columns: ColumnsType<Paper> = [
    {
      title: '试卷信息',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Paper) => (
        <div className="flex items-start space-x-3">
          <Avatar 
            icon={<FileTextOutlined />}
            style={{ 
              background: 'var(--gradient-primary)',
              flexShrink: 0 
            }}
          />
          <div className="flex-1 min-w-0">
            <div 
              className="font-medium text-neutral-900 cursor-pointer hover:text-primary-600 transition-colors truncate"
              onClick={() => navigate(`/papers/${record.id}`)}
            >
              {text}
            </div>
            {record.description && (
              <div className="text-sm text-neutral-500 mt-1 line-clamp-2">
                {record.description}
              </div>
            )}
            <div className="flex items-center space-x-4 mt-2">
              <span className="text-xs text-neutral-400">
                <CalendarOutlined className="mr-1" />
                {new Date(record.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '统计信息',
      key: 'stats',
      width: 200,
      render: (_, record: Paper) => (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">题目数量</span>
            <Badge 
              count={record.question_count} 
              style={{ 
                background: record.question_count > 0 ? 'var(--color-primary-500)' : 'var(--color-neutral-300)',
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">关联考试</span>
            <Badge 
              count={record.exam_count} 
              style={{ 
                background: record.exam_count > 0 ? 'var(--color-secondary-500)' : 'var(--color-neutral-300)',
              }}
            />
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (_, record: Paper) => {
        const isActive = record.question_count > 0;
        const hasExams = record.exam_count > 0;
        
        return (
          <div className="space-y-1">
            <Tag 
              color={isActive ? 'success' : 'default'}
              className="border-0 font-medium"
              style={{ borderRadius: 'var(--border-radius-full)' }}
            >
              {isActive ? '已完善' : '待完善'}
            </Tag>
            {hasExams && (
              <Tag 
                color="processing"
                className="border-0 font-medium"
                style={{ borderRadius: 'var(--border-radius-full)' }}
              >
                使用中
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, record: Paper) => (
        <div className="flex items-center space-x-1">
          <Tooltip title="题目管理">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              className="hover:bg-primary-50 hover:text-primary-600"
              onClick={() => navigate(`/papers/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="编辑试卷">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              className="hover:bg-primary-50 hover:text-primary-600"
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title={getDeleteTooltip(record)}>
            <Button
              type="text"
              size="small"
              danger
              disabled={!canDeletePaper(record)}
              icon={<DeleteOutlined />}
              className="hover:bg-red-50"
              onClick={() => showDeleteConfirm(record)}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

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
      {/* 重要：必须添加contextHolder才能显示Modal */}
      {contextHolder}
      
      {/* Hero区域 - 页面标题和快速操作 */}
      <Card className="modern-card-enter border-0 overflow-hidden" style={{ marginBottom: 24 }}>
        <div 
          className="absolute inset-0 opacity-5"
          style={{ background: 'var(--gradient-secondary)' }}
        />
        <div className="relative z-10">
          <Row align="middle" justify="space-between">
            <Col>
              <Space direction="vertical" size={4}>
                <Title level={1} className="mb-0" style={{ fontSize: '2.5rem' }}>
                  试卷管理
                </Title>
                <Typography.Text className="text-lg text-neutral-600">
                  创建和管理心理测试问卷，构建专业的测评内容
                </Typography.Text>
                <Space size={16} className="mt-2">
                  <Typography.Text type="secondary">
                    <BookOutlined className="mr-1" />
                    共 {statistics.totalPapers} 份试卷
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    <BarChartOutlined className="mr-1" />
                    {statistics.totalQuestions} 道题目
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    <ExperimentOutlined className="mr-1" />
                    {statistics.totalExams} 次考试
                  </Typography.Text>
                </Space>
              </Space>
            </Col>
            <Col>
              <Space>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  size="large"
                  onClick={handleCreate}
                  className="shadow-lg"
                >
                  创建试卷
                </Button>
                <Button 
                  icon={<SettingOutlined />}
                  size="large"
                  className="hover:bg-primary-50"
                >
                  批量管理
                </Button>
              </Space>
            </Col>
          </Row>
        </div>
      </Card>

      {/* 统计卡片 */}
      <div style={{ marginBottom: 24 }}>
        <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="modern-card-enter border-0 text-center hover:shadow-xl transition-all">
            <Statistic
              title="试卷总数"
              value={statistics.totalPapers}
              prefix={
                <div 
                  className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2"
                  style={{ background: 'var(--color-primary-50)' }}
                >
                  <FileTextOutlined style={{ color: 'var(--color-primary-500)', fontSize: '24px' }} />
                </div>
              }
              valueStyle={{ 
                fontSize: '2rem', 
                fontWeight: 'bold',
                color: 'var(--color-primary-600)' 
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="modern-card-enter border-0 text-center hover:shadow-xl transition-all">
            <Statistic
              title="题目总数"
              value={statistics.totalQuestions}
              prefix={
                <div 
                  className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2"
                  style={{ background: 'var(--color-secondary-50)' }}
                >
                  <BarChartOutlined style={{ color: 'var(--color-secondary-500)', fontSize: '24px' }} />
                </div>
              }
              valueStyle={{ 
                fontSize: '2rem', 
                fontWeight: 'bold',
                color: 'var(--color-secondary-600)' 
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="modern-card-enter border-0 text-center hover:shadow-xl transition-all">
            <Statistic
              title="关联考试"
              value={statistics.totalExams}
              prefix={
                <div 
                  className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2"
                  style={{ background: 'var(--color-accent-50)' }}
                >
                  <ExperimentOutlined style={{ color: 'var(--color-accent-500)', fontSize: '24px' }} />
                </div>
              }
              valueStyle={{ 
                fontSize: '2rem', 
                fontWeight: 'bold',
                color: 'var(--color-accent-600)' 
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="modern-card-enter border-0 text-center hover:shadow-xl transition-all">
            <Statistic
              title="完善试卷"
              value={statistics.activePapers}
              suffix={`/${statistics.totalPapers}`}
              prefix={
                <div 
                  className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-2"
                  style={{ background: 'rgba(114, 46, 209, 0.1)' }}
                >
                  <BookOutlined style={{ color: '#722ed1', fontSize: '24px' }} />
                </div>
              }
              valueStyle={{ 
                fontSize: '2rem', 
                fontWeight: 'bold',
                color: '#722ed1' 
              }}
            />
          </Card>
        </Col>
        </Row>
      </div>

      {/* 搜索和筛选区域 */}
      <Card className="modern-card-enter border-0" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="搜索试卷名称或描述..."
              prefix={<SearchOutlined className="text-neutral-400" />}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              allowClear
              size="large"
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Space>
              <Button 
                icon={<FilterOutlined />}
                className="hover:bg-primary-50 hover:text-primary-600"
              >
                筛选条件
              </Button>
              <Divider type="vertical" />
              <Typography.Text type="secondary" className="text-sm">
                显示 {filteredPapers.length} / {papers.length} 条记录
              </Typography.Text>
            </Space>
          </Col>
          <Col xs={24} md={8} className="text-right">
            <Space>
              <Button 
                icon={<MoreOutlined />}
                className="hover:bg-primary-50"
              >
                更多操作
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 试卷列表表格 */}
      <Card 
        className="modern-card-enter border-0"
        style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        bodyStyle={{ 
          flex: 1, 
          padding: 0, 
          display: 'flex', 
          flexDirection: 'column' 
        }}
      >
        {loading ? (
          <div className="space-y-4 p-6">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} active paragraph={{ rows: 2 }} />
            ))}
          </div>
        ) : filteredPapers.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty 
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                searchValue ? (
                  <div>
                    <div>没有找到匹配 "{searchValue}" 的试卷</div>
                    <Typography.Text type="secondary" className="text-sm">
                      尝试调整搜索关键词或清除搜索条件
                    </Typography.Text>
                  </div>
                ) : (
                  <div>
                    <div>暂无试卷数据</div>
                    <Typography.Text type="secondary" className="text-sm">
                      创建您的第一个心理测试试卷
                    </Typography.Text>
                  </div>
                )
              }
              className="py-16"
            >
              {!searchValue && (
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  size="large"
                  onClick={handleCreate}
                >
                  立即创建试卷
                </Button>
              )}
            </Empty>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={filteredPapers}
            loading={loading}
            rowKey="id"
            scroll={{ x: 900, y: 'calc(100vh - 420px)' }}
            className="modern-table"
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => 
                `显示 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
              pageSizeOptions: ['10', '20', '50', '100'],
              defaultPageSize: 20,
              position: ['bottomCenter'],
            }}
            rowClassName="hover:bg-neutral-25 transition-colors"
          />
        )}
      </Card>

      {/* 创建/编辑试卷模态框 */}
      <Modal
        title={
          <div className="flex items-center space-x-3">
            <div 
              className="flex items-center justify-center w-10 h-10 rounded-lg"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <FileTextOutlined className="text-white text-lg" />
            </div>
            <div>
              <div className="text-lg font-semibold">
                {editingPaper ? '编辑试卷' : '创建试卷'}
              </div>
              <div className="text-sm text-neutral-500 font-normal">
                {editingPaper ? '修改试卷基本信息' : '创建新的心理测试试卷'}
              </div>
            </div>
          </div>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingPaper(null);
        }}
        footer={null}
        width={680}
        className="modern-modal"
      >
        <Divider className="my-6" />
        
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            label="试卷名称"
            name="title"
            rules={[
              { required: true, message: '请输入试卷名称' },
              { min: 2, max: 100, message: '试卷名称长度应在2-100字符之间' }
            ]}
          >
            <Input 
              placeholder="例如：大学生心理健康测评问卷"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="试卷描述"
            name="description"
            rules={[
              { max: 500, message: '描述不能超过500字符' }
            ]}
          >
            <TextArea
              rows={4}
              placeholder="请简要描述试卷的用途、测评目标等（可选）"
            />
          </Form.Item>

          <Alert
            message="温馨提示"
            description="创建试卷后，您可以进入题目管理页面添加具体的测评题目。建议先明确测评目标，再设计相应的题目内容。"
            type="info"
            showIcon
            className="mb-6"
          />

          <Form.Item className="mb-0 text-right">
            <Space size="middle">
              <Button 
                size="large"
                onClick={() => setModalVisible(false)}
              >
                取消
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                size="large"
                className="px-8"
              >
                {editingPaper ? '保存修改' : '创建试卷'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PaperList;