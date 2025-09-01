import React, { useState, useEffect } from 'react';
import { Button, Space, Typography, Card, Modal, Input, message, Row, Col, Empty, Skeleton } from 'antd';
import {
  PlusOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  BookOutlined,
  BarChartOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { paperApi } from '../services/api';
import type { Paper, CreatePaperForm } from '../types';
import PapersTable from './PaperList/components/PapersTable';
import PaperModal from './PaperList/components/PaperModal';
import PapersStatsGrid from './PaperList/components/PapersStatsGrid';
import PapersFilters from './PaperList/components/PapersFilters';

const { Title } = Typography;

const PaperList: React.FC = () => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [filteredPapers, setFilteredPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPaper, setEditingPaper] = useState<Paper | null>(null);
  const [searchValue, setSearchValue] = useState('');
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
    setModalVisible(true);
  };

  // 打开创建模态框
  const handleCreate = () => {
    setEditingPaper(null);
    setModalVisible(true);
  };

  // 表格列配置已迁移到子组件 PapersTable

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
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                size="large"
                onClick={handleCreate}
                className="shadow-lg"
              >
                创建试卷
              </Button>
            </Col>
          </Row>
        </div>
      </Card>

      {/* 统计卡片 */}
      <div style={{ marginBottom: 24 }}>
        <PapersStatsGrid
          totalPapers={statistics.totalPapers}
          totalQuestions={statistics.totalQuestions}
          totalExams={statistics.totalExams}
          activePapers={statistics.activePapers}
        />
      </div>

      {/* 搜索和筛选区域 */}
      <PapersFilters
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filteredCount={filteredPapers.length}
        totalCount={papers.length}
      />

      {/* 试卷列表表格 */}
      <Card
        className="modern-card-enter border-0"
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, padding: 0, display: 'flex', flexDirection: 'column' } }}
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
                    <Typography.Text type="secondary" className="text-sm">尝试调整搜索关键词或清除搜索条件</Typography.Text>
                  </div>
                ) : (
                  <div>
                    <div>暂无试卷数据</div>
                    <Typography.Text type="secondary" className="text-sm">创建您的第一个心理测试试卷</Typography.Text>
                  </div>
                )
              }
              className="py-16"
            >
              {!searchValue && (
                <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleCreate}>
                  立即创建试卷
                </Button>
              )}
            </Empty>
          </div>
        ) : (
          <PapersTable
            data={filteredPapers}
            loading={loading}
            onOpenPaper={(id) => navigate(`/papers/${id}`)}
            onEdit={handleEdit}
            onDelete={(paper) => showDeleteConfirm(paper)}
            canDeletePaper={canDeletePaper}
            getDeleteTooltip={getDeleteTooltip}
          />
        )}
      </Card>

      {/* 创建/编辑试卷模态框 */}
      <PaperModal
        open={modalVisible}
        editingPaper={editingPaper}
        onCancel={() => {
          setModalVisible(false);
          setEditingPaper(null);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
};

export default PaperList;
