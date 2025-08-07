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
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { paperApi } from '../services/api';
import type { Paper, CreatePaperForm } from '../types';

const { Title } = Typography;
const { TextArea } = Input;

const PaperList: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [modal, contextHolder] = Modal.useModal();

  useEffect(() => {
    loadPapers();
  }, []);

  // 加载试卷列表
  const loadPapers = async () => {
    try {
      setLoading(true);
      const response = await paperApi.getList();
      if (response.success && response.data) {
        setPapers(response.data);
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

  // 表格列配置
  const columns: ColumnsType<Paper> = [
    {
      title: '试卷名称',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Paper) => (
        <Space>
          <FileTextOutlined />
          <Button
            type="link"
            style={{ padding: 0, fontWeight: 500, height: 'auto' }}
            onClick={() => navigate(`/papers/${record.id}`)}
          >
            {text}
          </Button>
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: '题目数量',
      dataIndex: 'question_count',
      key: 'question_count',
      width: 100,
      render: (count: number) => (
        <Tag color={count > 0 ? 'blue' : 'default'}>
          {count} 题
        </Tag>
      ),
    },
    {
      title: '考试次数',
      dataIndex: 'exam_count',
      key: 'exam_count',
      width: 100,
      render: (count: number) => (
        <Tag color={count > 0 ? 'green' : 'default'}>
          {count} 次
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      fixed: 'right',
      render: (_, record: Paper) => (
        <Space size="small" wrap>
          <Tooltip title="查看试卷详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/papers/${record.id}`)}
            >
              题目管理
            </Button>
          </Tooltip>
          <Tooltip title="编辑试卷信息">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              编辑
            </Button>
          </Tooltip>
          <Tooltip title={getDeleteTooltip(record)}>
            <Button
              type="link"
              size="small"
              danger
              disabled={!canDeletePaper(record)}
              icon={<DeleteOutlined />}
              onClick={() => showDeleteConfirm(record)}
            >
              删除
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 重要：必须添加contextHolder才能显示Modal */}
      {contextHolder}
      {/* 页面标题和操作按钮 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24
      }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            试卷管理
          </Title>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreate}
        >
          创建试卷
        </Button>
      </div>

      {/* 试卷列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={papers}
          loading={loading}
          rowKey="id"
          scroll={{ x: 800 }}
          locale={{ emptyText: '暂无试卷数据，点击上方按钮创建新试卷' }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      {/* 创建/编辑试卷模态框 */}
      <Modal
        title={editingPaper ? '编辑试卷' : '创建试卷'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingPaper(null);
        }}
        footer={null}
        width={600}
      >
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
            <Input placeholder="请输入试卷名称" />
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
              placeholder="请输入试卷描述（可选）"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                {editingPaper ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PaperList;