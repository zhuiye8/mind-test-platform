import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Space,
  Typography,
  Card,
  Tag,
  message,
  Tooltip,
  Modal,
  Empty,
} from 'antd';
import {
  ArrowLeftOutlined,
  EyeOutlined,
  RollbackOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { examApi } from '../services/api';
import type { Exam } from '../types';
// 归档页面暂时不需要状态常量，已准备好随时使用

const { Title, Paragraph } = Typography;

/**
 * 考试归档库页面组件
 * 显示所有已归档的考试，提供恢复和彻底删除功能
 */
const ExamArchive: React.FC = () => {
  const [archivedExams, setArchivedExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [modal, contextHolder] = Modal.useModal();

  useEffect(() => {
    loadArchivedExams();
  }, []);

  // 加载归档考试列表
  const loadArchivedExams = async () => {
    try {
      setLoading(true);
      const response = await examApi.getArchivedExams();
      if (response.success && response.data?.data) {
        setArchivedExams(response.data.data);
      }
    } catch (error) {
      console.error('加载归档考试列表失败:', error);
      message.error('加载归档考试列表失败');
      // 临时显示空数据而不是报错
      setArchivedExams([]);
    } finally {
      setLoading(false);
    }
  };

  // 恢复考试处理函数
  const handleRestoreExam = async (examId: string) => {
    try {
      const response = await examApi.restoreExam(examId);
      if (response.success) {
        message.success('考试已恢复到正常状态');
        loadArchivedExams(); // 重新加载列表
      } else {
        message.error(response.error || '恢复失败');
      }
    } catch (error) {
      console.error('恢复考试失败:', error);
      message.error('恢复失败，请重试');
    }
  };

  // 彻底删除考试处理函数
  const handlePermanentDelete = async (exam: Exam) => {
    try {
      const response = await examApi.delete(exam.id);
      if (response.success) {
        message.success('考试已彻底删除');
        loadArchivedExams(); // 重新加载列表
      } else {
        message.error(response.error || '删除失败');
      }
    } catch (error) {
      console.error('彻底删除失败:', error);
      message.error('删除失败，请重试');
    }
  };

  // 显示彻底删除确认对话框
  const showPermanentDeleteConfirm = (exam: Exam) => {
    const participantCount = exam.participant_count || 0;
    
    modal.confirm({
      title: '🚨 最后警告：彻底删除考试',
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <div style={{ 
            background: '#fff2f0', 
            border: '1px solid #ffccc7', 
            borderRadius: 6,
            padding: 12,
            marginBottom: 16
          }}>
            <p style={{ color: '#ff4d4f', margin: 0, fontWeight: 600 }}>
              ⚠️ 这是不可逆转的操作！
            </p>
          </div>
          
          <p><strong>考试名称：</strong>{exam.title}</p>
          <p><strong>试卷名称：</strong>{exam.paper_title || '未知试卷'}</p>
          <p><strong>参与人数：</strong>{participantCount} 人</p>
          
          <div style={{ marginTop: 16 }}>
            <p style={{ color: '#ff4d4f', marginBottom: 8 }}>
              <strong>删除后将永久清除：</strong>
            </p>
            <ul style={{ color: '#666', paddingLeft: 20 }}>
              <li>考试基本信息和配置</li>
              <li>所有学生的答题记录 ({participantCount} 份)</li>
              <li>考试统计数据和分析结果</li>
              <li>相关的系统日志记录</li>
            </ul>
          </div>
          
          <p style={{ color: '#fa8c16', marginTop: 16 }}>
            💡 <strong>建议：</strong>如果只是想清理界面，可以点击"取消"保留在归档库中。
          </p>
        </div>
      ),
      okText: '彻底删除',
      okType: 'danger',
      cancelText: '取消',
      width: 580,
      okButtonProps: {
        danger: true,
        style: { fontWeight: 600 }
      },
      onOk: () => handlePermanentDelete(exam),
      onCancel: () => {
        console.log('用户取消彻底删除操作');
      },
    });
  };

  // 批量恢复功能
  const handleBatchRestore = async (selectedExams: Exam[]) => {
    if (selectedExams.length === 0) {
      message.warning('请选择要恢复的考试');
      return;
    }

    modal.confirm({
      title: `确定恢复这 ${selectedExams.length} 个考试吗？`,
      content: (
        <div>
          <p>恢复后的考试将重新出现在考试管理列表中，状态为"已结束"。</p>
          <p style={{ color: '#666' }}>
            恢复的考试列表：{selectedExams.map(exam => exam.title).join('、')}
          </p>
        </div>
      ),
      onOk: async () => {
        try {
          const promises = selectedExams.map(exam => examApi.restoreExam(exam.id));
          await Promise.all(promises);
          message.success(`成功恢复 ${selectedExams.length} 个考试`);
          loadArchivedExams();
        } catch (error) {
          console.error('批量恢复失败:', error);
          message.error('批量恢复失败');
        }
      },
    });
  };

  // 表格行选择配置
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  const columns: ColumnsType<Exam> = [
    {
      title: '考试名称',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (text: string) => (
        <span style={{ fontWeight: 500 }}>{text}</span>
      ),
    },
    {
      title: '试卷名称',
      key: 'paper_title',
      ellipsis: true,
      render: (_, record: Exam) => (
        <span>{record.paper_title || '未知试卷'}</span>
      ),
    },
    {
      title: '参与人数',
      key: 'result_count',
      width: 100,
      render: (_, record: Exam) => (
        <Tag color={(record.participant_count || 0) > 0 ? 'blue' : 'default'}>
          {record.participant_count || 0} 人
        </Tag>
      ),
    },
    {
      title: '时长',
      key: 'duration_minutes',
      width: 100,
      render: (_, record: Exam) => `${record.duration_minutes || 0} 分钟`,
    },
    {
      title: '归档时间',
      key: 'archived_at',
      width: 150,
      render: (_, record: Exam) => {
        // 使用 updated_at 字段作为归档时间
        return record.updated_at ? new Date(record.updated_at).toLocaleDateString() : '未知';
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record: Exam) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/exams/${record.id}`)}
            >
              查看
            </Button>
          </Tooltip>
          
          <Tooltip title="恢复考试">
            <Button
              type="link"
              size="small"
              icon={<RollbackOutlined />}
              onClick={() => handleRestoreExam(record.id)}
            >
              恢复
            </Button>
          </Tooltip>

          <Tooltip title="彻底删除（不可恢复）">
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => showPermanentDeleteConfirm(record)}
            >
              彻底删除
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const selectedExams = archivedExams.filter(exam => 
    selectedRowKeys.includes(exam.id)
  );

  return (
    <div>
      {contextHolder}
      
      {/* 页面头部 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 24 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/exams')}
          >
            返回考试管理
          </Button>
          <div>
            <Title level={2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <InboxOutlined />
              考试归档库
            </Title>
            <Paragraph type="secondary" style={{ margin: '8px 0 0 0' }}>
              已归档的考试会保留在这里，您可以恢复或彻底删除它们
            </Paragraph>
          </div>
        </div>

        {/* 批量操作按钮 */}
        {selectedRowKeys.length > 0 && (
          <Space>
            <span style={{ color: '#666' }}>已选择 {selectedRowKeys.length} 项</span>
            <Button
              type="primary"
              icon={<RollbackOutlined />}
              onClick={() => handleBatchRestore(selectedExams)}
            >
              批量恢复
            </Button>
          </Space>
        )}
      </div>

      {/* 归档库列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={archivedExams}
          loading={loading}
          rowKey="id"
          rowSelection={rowSelection}
          scroll={{ x: 1000 }}
          locale={{ 
            emptyText: (
              <Empty
                image={<InboxOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
                description={
                  <div>
                    <p style={{ color: '#999', marginBottom: 8 }}>归档库为空</p>
                    <p style={{ color: '#ccc', fontSize: 14 }}>
                      归档的考试会显示在这里
                    </p>
                  </div>
                }
              />
            )
          }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个归档考试`,
            defaultPageSize: 10,
          }}
        />
      </Card>

      {/* 底部说明 */}
      <Card 
        size="small" 
        style={{ 
          marginTop: 16, 
          background: '#fafafa',
          border: '1px solid #f0f0f0'
        }}
      >
        <div style={{ display: 'flex', gap: 24, fontSize: 12, color: '#666' }}>
          <span>💡 <strong>恢复：</strong>将考试恢复到"已结束"状态，重新出现在考试列表中</span>
          <span>🗑️ <strong>彻底删除：</strong>永久删除考试及所有相关数据，无法恢复</span>
          <span>📊 <strong>查看：</strong>可以查看归档考试的详细信息和统计数据</span>
        </div>
      </Card>
    </div>
  );
};

export default ExamArchive;