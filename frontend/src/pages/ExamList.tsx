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
} from 'antd';
import {
  PlusOutlined,
  EyeOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  RollbackOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { examApi } from '../services/api';
import type { Exam } from '../types';
import ExamStatusFilter from '../components/ExamStatusFilter';
import StudentListModal from '../components/StudentListModal';
import { ExamStatus, getStatusColor, getStatusName } from '../constants/examStatus';
import type { ExamStatusType } from '../constants/examStatus';

const { Title } = Typography;

const ExamList: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [modal, contextHolder] = Modal.useModal();
  
  // 状态筛选相关
  const [currentStatusFilter, setCurrentStatusFilter] = useState<string>('all');
  
  // 学生列表模态框相关
  const [studentModalVisible, setStudentModalVisible] = useState(false);
  const [selectedExamForStudents, setSelectedExamForStudents] = useState<Exam | null>(null);

  useEffect(() => {
    loadExams();
  }, []);

  const loadExams = async () => {
    try {
      setLoading(true);
      const response = await examApi.getList();
      if (response.success && response.data?.data) {
        setExams(response.data.data);
      }
    } catch (error) {
      console.error('加载考试列表失败:', error);
      message.error('加载考试列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 手动刷新考试列表
  const handleRefresh = async () => {
    try {
      setLoading(true);
      const response = await examApi.getList();
      if (response.success && response.data?.data) {
        setExams(response.data.data);
        message.success('考试列表已刷新');
      }
    } catch (error) {
      console.error('刷新考试列表失败:', error);
      message.error('刷新失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePublish = async (examId: string) => {
    try {
      const response = await examApi.togglePublish(examId);
      if (response.success) {
        message.success('状态更新成功');
        loadExams();
      }
    } catch (error) {
      console.error('状态更新失败:', error);
      message.error('状态更新失败');
    }
  };

  // 结束考试处理函数
  const handleFinishExam = async (examId: string) => {
    try {
      const response = await examApi.finishExam(examId);
      if (response.success) {
        message.success('考试已正常结束');
        loadExams();
      } else {
        message.error(response.error || '结束考试失败');
      }
    } catch (error) {
      console.error('结束考试失败:', error);
      message.error('结束考试失败');
    }
  };

  // 归档考试处理函数
  const handleArchiveExam = async (examId: string) => {
    try {
      const response = await examApi.archiveExam(examId);
      if (response.success) {
        message.success('考试已移至归档库');
        loadExams();
      } else {
        message.error(response.error || '归档失败');
      }
    } catch (error) {
      console.error('归档失败:', error);
      message.error('归档失败');
    }
  };

  // 恢复考试处理函数
  const handleRestoreExam = async (examId: string) => {
    try {
      const response = await examApi.restoreExam(examId);
      if (response.success) {
        message.success('考试已恢复');
        loadExams();
      } else {
        message.error(response.error || '恢复失败');
      }
    } catch (error) {
      console.error('恢复失败:', error);
      message.error('恢复失败');
    }
  };

  // 删除考试处理函数
  const handleDeleteExam = async (exam: Exam) => {
    try {
      const response = await examApi.delete(exam.id);
      if (response.success) {
        message.success('考试删除成功');
        loadExams();
      } else {
        message.error(response.error || '删除失败');
      }
    } catch (error) {
      console.error('删除考试失败:', error);
      message.error('删除失败，请重试');
    }
  };

  // 判断考试是否可以删除
  const canDeleteExam = (exam: Exam): boolean => {
    // 草稿状态可以删除
    if (exam.status === ExamStatus.DRAFT) return true;
    // 已停止考试可以删除
    if (exam.status === ExamStatus.EXPIRED) return true;
    // 已归档考试可以彻底删除
    if (exam.status === ExamStatus.ARCHIVED) return true;
    // 其他状态不能直接删除
    return false;
  };

  // 获取删除按钮的提示信息
  const getDeleteTooltip = (exam: Exam): string => {
    switch (exam.status) {
      case ExamStatus.DRAFT:
        return '删除草稿考试';
      case ExamStatus.EXPIRED:
        return '删除已停止的考试';
      case ExamStatus.ARCHIVED:
        return '彻底删除（不可恢复）';
      default:
        return '删除考试';
    }
  };

  // 显示删除/归档确认对话框
  const showDeleteConfirm = (exam: Exam) => {
    console.log('showDeleteConfirm被调用，考试:', exam);
    console.log('考试状态:', exam.status, '可删除:', canDeleteExam(exam));
    
    // 再次检查是否可以删除
    if (!canDeleteExam(exam)) {
      message.warning(`${exam.status === ExamStatus.PUBLISHED ? '进行中的考试无法删除' : '当前状态的考试无法删除'}`);
      return;
    }

    const participantCount = exam.participant_count || 0;
    const hasParticipants = participantCount > 0;
    
    // 根据不同状态显示不同的确认对话框
    const getConfirmConfig = () => {
      switch (exam.status) {
        case ExamStatus.DRAFT:
          return {
            title: '确定删除草稿考试吗？',
            content: (
              <div>
                <p><strong>考试名称：</strong>{exam.title}</p>
                <p><strong>试卷名称：</strong>{exam.paper_title || '未知试卷'}</p>
                {hasParticipants && (
                  <>
                    <p><strong>已有提交：</strong>{participantCount} 人</p>
                    <p style={{ color: '#fa8c16', marginTop: 16 }}>
                      ⚠️ 该草稿已有学生提交答案，删除后学生数据也会被清除！
                    </p>
                    <Button 
                      type="link" 
                      size="small"
                      onClick={() => {
                        // 关闭当前对话框并显示学生列表
                        setTimeout(() => showStudentList(exam), 100);
                        showStudentList(exam); // 显示学生列表
                      }}
                    >
                      查看提交学生名单 &gt;
                    </Button>
                  </>
                )}
                <p style={{ color: '#ff4d4f', marginTop: 16 }}>
                  删除后将无法恢复！
                </p>
              </div>
            ),
            okText: hasParticipants ? '仍要删除' : '确定删除',
            okType: 'danger',
          };
        
        case ExamStatus.EXPIRED:
          return {
            title: '确定删除已停止的考试吗？',
            content: (
              <div>
                <p><strong>考试名称：</strong>{exam.title}</p>
                <p><strong>试卷名称：</strong>{exam.paper_title || '未知试卷'}</p>
                <p><strong>参与人数：</strong>{participantCount} 人</p>
                {hasParticipants && (
                  <>
                    <p style={{ color: '#fa8c16', marginTop: 16 }}>
                      ⚠️ 删除后，所有 {participantCount} 名学生的答案数据将被清除！
                    </p>
                    <Button 
                      type="link" 
                      size="small"
                      onClick={() => {
                        // 关闭当前对话框并显示学生列表
                        setTimeout(() => showStudentList(exam), 100);
                        showStudentList(exam); // 显示学生列表
                      }}
                    >
                      查看提交学生名单 &gt;
                    </Button>
                  </>
                )}
                <p style={{ color: '#ff4d4f', marginTop: 16 }}>
                  删除后将无法恢复，建议先导出数据备份！
                </p>
              </div>
            ),
            okText: hasParticipants ? '仍要删除' : '确定删除',
            okType: 'danger',
          };
        
        case ExamStatus.ARCHIVED:
          return {
            title: '确定彻底删除这个考试吗？',
            content: (
              <div>
                <p><strong>考试名称：</strong>{exam.title}</p>
                <p><strong>试卷名称：</strong>{exam.paper_title || '未知试卷'}</p>
                <p><strong>参与人数：</strong>{participantCount} 人</p>
                <p style={{ color: '#ff4d4f', marginTop: 16 }}>
                  🚨 这是最后一次删除机会！删除后将彻底清除，无法恢复！
                </p>
                <p style={{ color: '#666', marginTop: 8 }}>
                  如果只是想清理列表，建议点击"取消"，考试会保留在归档库中。
                </p>
              </div>
            ),
            okText: '彻底删除',
            okType: 'danger',
          };
        
        default:
          return {
            title: '确定删除这个考试吗？',
            content: '删除后将无法恢复！',
            okText: '确定删除',
            okType: 'danger',
          };
      }
    };

    const config = getConfirmConfig();
    
    // 使用modal.confirm替代Modal.confirm
    modal.confirm({
      title: config.title,
      icon: <ExclamationCircleOutlined />,
      content: config.content,
      okText: config.okText,
      okType: config.okType as any,
      cancelText: '取消',
      width: 520, // 增加宽度以适应更多内容
      onOk: async () => {
        console.log('用户确认删除，考试ID:', exam.id, '状态:', exam.status);
        
        // 根据状态调用不同的处理函数
        try {
          if (exam.status === ExamStatus.SUCCESS) {
            // 已结束的考试执行归档操作
            await handleArchiveExam(exam.id);
          } else {
            // 其他状态执行删除操作
            await handleDeleteExam(exam);
          }
        } catch (error) {
          console.error('操作失败:', error);
        }
      },
      onCancel: () => {
        console.log('用户取消操作');
      },
    });
  };

  // 显示学生列表（在删除前）
  const showStudentList = (exam: Exam) => {
    setSelectedExamForStudents(exam);
    setStudentModalVisible(true);
  };

  // 筛选考试列表
  const getFilteredExams = (): Exam[] => {
    let filtered = exams;
    
    // 始终不显示归档的考试
    filtered = filtered.filter(exam => exam.status !== ExamStatus.ARCHIVED);
    
    // 根据状态筛选
    if (currentStatusFilter !== 'all') {
      filtered = filtered.filter(exam => exam.status === currentStatusFilter);
    }
    
    return filtered;
  };


  // 使用常量文件中的函数
  // const getStatusColor = getStatusColor; // 已导入

  // 使用常量文件中的函数
  // const getStatusText = getStatusName; // 已导入为 getStatusName

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('链接已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
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
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status as ExamStatusType)}>
          {getStatusName(status as ExamStatusType)}
        </Tag>
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
      title: '公开链接',
      key: 'public_url',
      width: 120,
      render: (_, record: Exam) => {
        return record.status === ExamStatus.PUBLISHED && record.public_url ? (
          <Tooltip title="点击复制链接">
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => copyToClipboard(record.public_url)}
            >
              复制链接
            </Button>
          </Tooltip>
        ) : (
          <span style={{ color: '#ccc' }}>未发布</span>
        );
      },
    },
    {
      title: '创建时间',
      key: 'created_at',
      width: 150,
      render: (_, record: Exam) => {
        return record.created_at ? new Date(record.created_at).toLocaleDateString() : '未知';
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
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
          
          {/* 根据状态显示不同的操作按钮 */}
          {record.status === ExamStatus.DRAFT && (
            <Tooltip title="发布考试">
              <Button
                type="link"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleTogglePublish(record.id)}
              >
                发布
              </Button>
            </Tooltip>
          )}

          {record.status === ExamStatus.PUBLISHED && (
            <>
              <Tooltip title="停止考试">
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  onClick={() => handleTogglePublish(record.id)}
                >
                  停止
                </Button>
              </Tooltip>
              <Tooltip title="正常结束考试">
                <Button
                  type="link"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleFinishExam(record.id)}
                >
                  结束
                </Button>
              </Tooltip>
            </>
          )}

          {record.status === ExamStatus.SUCCESS && (
            <Tooltip title="移至归档库">
              <Button
                type="link"
                size="small"
                icon={<InboxOutlined />}
                onClick={() => handleArchiveExam(record.id)}
              >
                归档
              </Button>
            </Tooltip>
          )}

          {record.status === ExamStatus.ARCHIVED && (
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
          )}

          {/* 删除/彻底删除按钮 */}
          {(record.status === ExamStatus.DRAFT || record.status === ExamStatus.EXPIRED || record.status === ExamStatus.ARCHIVED) && (
            <Tooltip title={getDeleteTooltip(record)}>
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  console.log('删除按钮被点击，考试:', record);
                  console.log('考试状态:', record.status, '可删除:', canDeleteExam(record));
                  showDeleteConfirm(record);
                }}
              >
                {record.status === ExamStatus.ARCHIVED ? '彻底删除' : '删除'}
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const filteredExams = getFilteredExams();

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
            考试管理
          </Title>
        </div>
        <Space>
          <Tooltip title="刷新考试列表，获取最新学生提交信息">
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={loading}
            >
              刷新
            </Button>
          </Tooltip>
          <Button
            icon={<InboxOutlined />}
            onClick={() => navigate('/exams/archive')}
          >
            归档库
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/exams/create')}
          >
            创建考试
          </Button>
        </Space>
      </div>

      {/* 状态筛选器 */}
      <Card style={{ marginBottom: 16 }}>
        <ExamStatusFilter
          exams={exams}
          currentStatus={currentStatusFilter}
          onStatusChange={setCurrentStatusFilter}
        />
      </Card>

      {/* 考试列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredExams}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1000 }}
          locale={{ 
            emptyText: currentStatusFilter === 'all' 
              ? '暂无考试数据，点击上方按钮创建新考试' 
              : `暂无${getStatusName(currentStatusFilter as ExamStatusType)}状态的考试`
          }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      {/* 学生列表模态框 */}
      {selectedExamForStudents && (
        <StudentListModal
          visible={studentModalVisible}
          examId={selectedExamForStudents.id}
          examTitle={selectedExamForStudents.title}
          onClose={() => {
            setStudentModalVisible(false);
            setSelectedExamForStudents(null);
          }}
          onConfirm={() => {
            // 确认删除后的回调
            setStudentModalVisible(false);
            if (selectedExamForStudents) {
              handleDeleteExam(selectedExamForStudents);
            }
            setSelectedExamForStudents(null);
          }}
          showConfirmButton={true}
        />
      )}
    </div>
  );
};

export default ExamList;