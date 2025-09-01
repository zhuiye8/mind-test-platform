/**
 * QuestionList - 题目列表组件
 * 显示题目列表，支持排序、编辑、删除等操作
 */
import React from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Tooltip,
  Typography,
  Empty,
  Modal,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  SoundOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Question } from '../../types';
import type { QuestionListProps } from './types';

const { Text } = Typography;
const { confirm } = Modal;

const QuestionList: React.FC<QuestionListProps> = ({
  questions,
  onEdit,
  onDelete,
  onDuplicate,
  onAudioGenerate,
  loading = false,
}) => {
  // 格式化题目类型
  const formatQuestionType = (type: string) => {
    const typeMap = {
      'single_choice': { text: '单选题', color: 'blue' },
      'multiple_choice': { text: '多选题', color: 'orange' },
      'text': { text: '文本题', color: 'green' },
    };
    
    const config = typeMap[type as keyof typeof typeMap] || { text: type, color: 'default' };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 格式化选项显示
  const formatOptions = (options: Record<string, any> | null) => {
    if (!options || typeof options !== 'object') return '无选项';
    
    const entries = Object.entries(options);
    if (entries.length === 0) return '无选项';
    
    return (
      <div>
        {entries.slice(0, 2).map(([key, value]) => {
          const text = typeof value === 'string' ? value : value?.text || value?.label || '选项';
          return (
            <div key={key} style={{ marginBottom: 2 }}>
              <Text code>{key}</Text>: {text.length > 20 ? `${text.substring(0, 20)}...` : text}
            </div>
          );
        })}
        {entries.length > 2 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            ...还有 {entries.length - 2} 个选项
          </Text>
        )}
      </div>
    );
  };

  // 删除确认
  const handleDeleteConfirm = (question: Question) => {
    confirm({
      title: '确定要删除这个题目吗？',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p><strong>题目：</strong>{question.title}</p>
          <p style={{ color: '#f5222d', marginTop: 12 }}>
            ⚠️ 删除后无法恢复，请谨慎操作！
          </p>
        </div>
      ),
      okText: '确定删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => onDelete(question.id),
    });
  };

  // 表格列定义
  const columns: ColumnsType<Question> = [
    {
      title: '序号',
      key: 'question_order',
      width: 60,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    {
      title: '题目内容',
      dataIndex: 'title',
      key: 'title',
      ellipsis: { showTitle: false },
      render: (text: string, record: Question) => (
        <div>
          <Tooltip title={text} placement="topLeft">
            <Text strong style={{ display: 'block', marginBottom: 4 }}>
              {text.length > 50 ? `${text.substring(0, 50)}...` : text}
            </Text>
          </Tooltip>
          <Space size="small">
            {record.is_required && (
              <Tag icon={<ExclamationCircleOutlined />} color="red" size="small">
                必填
              </Tag>
            )}
            {record.is_scored && (
              <Tag icon={<CheckCircleOutlined />} color="green" size="small">
                计分
              </Tag>
            )}
            {!record.is_required && !record.is_scored && (
              <Tag icon={<MinusCircleOutlined />} color="default" size="small">
                可选
              </Tag>
            )}
          </Space>
        </div>
      ),
    },
    {
      title: '题目类型',
      dataIndex: 'question_type',
      key: 'question_type',
      width: 100,
      align: 'center',
      render: formatQuestionType,
    },
    {
      title: '选项配置',
      dataIndex: 'options',
      key: 'options',
      width: 200,
      render: formatOptions,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record: Question) => (
        <Space size="small">
          <Tooltip title="编辑题目">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(record)}
            >
              编辑
            </Button>
          </Tooltip>
          
          <Tooltip title="复制题目">
            <Button
              type="link"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => onDuplicate(record)}
            >
              复制
            </Button>
          </Tooltip>
          
          <Tooltip title="生成语音">
            <Button
              type="link"
              size="small"
              icon={<SoundOutlined />}
              onClick={() => onAudioGenerate(record.id)}
            >
              语音
            </Button>
          </Tooltip>
          
          <Tooltip title="删除题目">
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteConfirm(record)}
            >
              删除
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  if (!questions.length && !loading) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无题目，点击上方按钮添加第一个题目"
        style={{ padding: '60px 0' }}
      />
    );
  }

  return (
    <Table
      columns={columns}
      dataSource={questions}
      loading={loading}
      rowKey="id"
      scroll={{ x: 1000 }}
      pagination={{
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 道题目`,
        defaultPageSize: 10,
        pageSizeOptions: ['10', '20', '50'],
      }}
      size="middle"
    />
  );
};

export default QuestionList;