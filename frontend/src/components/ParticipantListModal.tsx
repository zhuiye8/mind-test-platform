import React, { useState, useEffect } from 'react';
import {
  Modal,
  Table,
  Space,
  Typography,
  Tag,
  Empty,
  Input,
  Spin,
  Alert,
  Statistic,
  Card,
  Row,
  Col,
} from 'antd';
import {
  UserOutlined,
  CalendarOutlined,
  SearchOutlined,
  TeamOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { examApi } from '../services/api';
import type { ExamResult } from '../types';

const { Text } = Typography;

interface ParticipantListModalProps {
  visible: boolean;
  examId: string;
  examTitle: string;
  onClose: () => void;
  onConfirm?: () => void;
  showConfirmButton?: boolean;
}

/**
 * 参与者提交列表模态框组件
 * 显示指定考试的所有参与者提交记录，支持搜索和分页
 */
const ParticipantListModal: React.FC<ParticipantListModalProps> = ({
  visible,
  examId,
  examTitle,
  onClose,
  onConfirm,
  showConfirmButton = false
}) => {
  const [participants, setParticipants] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // 加载学生提交列表
  const loadParticipants = async (page = 1, pageSize = 10, search = '') => {
    if (!examId || !visible) return;

    try {
      setLoading(true);
      const response = await examApi.getExamSubmissions(examId, {
        page,
        limit: pageSize,
      });

      if (response.success && response.data) {
        setParticipants(response.data.data || []);
        setPagination({
          current: page,
          pageSize,
          total: response.data.pagination?.total || 0,
        });
      }
    } catch (error) {
      console.error('加载学生列表失败:', error);
      setParticipants([]);
      setPagination({
        current: page,
        pageSize,
        total: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  // 监听visible变化，重新加载数据
  useEffect(() => {
    if (visible && examId) {
      loadParticipants(1, pagination.pageSize, searchText);
    }
  }, [visible, examId]);

  // 处理搜索
  const handleSearch = (value: string) => {
    setSearchText(value);
    loadParticipants(1, pagination.pageSize, value);
  };

  // 处理分页变化
  const handleTableChange = (paginationConfig: any) => {
    loadParticipants(paginationConfig.current, paginationConfig.pageSize, searchText);
  };

  const columns: ColumnsType<ExamResult> = [
    {
      title: '学号',
      dataIndex: 'participant_id',
      key: 'participant_id',
      width: 120,
      render: (text: string) => (
        <Space>
          <UserOutlined style={{ color: '#1890ff' }} />
          <Text code>{text}</Text>
        </Space>
      ),
    },
    {
      title: '姓名',
      dataIndex: 'participant_name',
      key: 'participant_name',
      width: 100,
      render: (text: string) => (
        <Text strong>{text}</Text>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 160,
      render: (date: string) => (
        <Space>
          <CalendarOutlined style={{ color: '#52c41a' }} />
          <Text>{new Date(date).toLocaleString()}</Text>
        </Space>
      ),
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 130,
      render: (ip: string) => (
        <Tag color="blue">{ip}</Tag>
      ),
    },
    {
      title: '答题状态',
      key: 'status',
      width: 100,
      render: (_, record: ExamResult) => {
        const answerCount = Object.keys(record.answers || {}).length;
        return (
          <Tag color={answerCount > 0 ? 'green' : 'orange'}>
            {answerCount > 0 ? '已完成' : '未完成'}
          </Tag>
        );
      },
    },
  ];

  // 统计数据
  const stats = {
    totalParticipants: participants.length,
    completedParticipants: participants.filter(p => Object.keys(p.answers || {}).length > 0).length,
    uniqueIPs: new Set(participants.map(p => p.ip_address)).size,
  };

  return (
    <Modal
      title={
        <Space>
          <TeamOutlined />
          <span>学生提交记录</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      onOk={showConfirmButton ? onConfirm : undefined}
      okText={showConfirmButton ? "确认删除" : undefined}
      okType={showConfirmButton ? "danger" : "primary"}
      cancelText="取消"
      width={800}
      styles={{
        body: { padding: '16px 0' }
      }}
    >
      {/* 考试信息 */}
      <Alert
        message={
          <Space>
            <FileTextOutlined />
            <Text strong>考试：{examTitle}</Text>
          </Space>
        }
        type="info"
        style={{ marginBottom: 16 }}
      />

      {/* 统计概览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="提交人数"
              value={stats.totalParticipants}
              suffix="人"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="完成答题"
              value={stats.completedParticipants}
              suffix="人"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="独立IP"
              value={stats.uniqueIPs}
              suffix="个"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 搜索框 */}
      <div style={{ marginBottom: 16, padding: '0 24px' }}>
        <Input
          placeholder="搜索学号或姓名..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          allowClear
          style={{ width: '100%' }}
        />
      </div>

      {/* 学生列表 */}
      <div style={{ padding: '0 24px' }}>
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={participants}
            rowKey="id"
            size="small"
            pagination={{
              ...pagination,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
            }}
            onChange={handleTableChange}
            locale={{
              emptyText: (
                <Empty
                  description={
                    searchText ? '没有找到匹配的学生' : '暂无学生提交记录'
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ),
            }}
          />
        </Spin>
      </div>

      {/* 删除警告 */}
      {showConfirmButton && participants.length > 0 && (
        <Alert
          message="删除警告"
          description={
            <div>
              <p>确认删除后，以下数据将被永久清除：</p>
              <ul style={{ marginBottom: 0 }}>
                <li>{stats.totalParticipants} 名参与者的提交记录</li>
                <li>{stats.completedParticipants} 份完整的答题数据</li>
                <li>所有相关的统计和分析数据</li>
              </ul>
            </div>
          }
          type="error"
          style={{ margin: '16px 24px 0' }}
        />
      )}
    </Modal>
  );
};

export default ParticipantListModal;