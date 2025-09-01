import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, Space, Typography, Card, App } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { examApi } from '../services/api';
import type { Exam } from '../types';
import ParticipantListModal from '../components/ParticipantListModal';
import { ExamStatus } from '../constants/examStatus';
import type { ExamStatusType } from '../constants/examStatus';

// 导入拆分的子组件
import { 
  KanbanLayout, 
  ExamCard, 
  useExamOperations 
} from '../components/ExamList';
// 统计卡片暂时移除以避免压缩泳道空间

const { Title } = Typography;

const ExamList: React.FC = () => {
  // 基础状态
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = App.useApp();
  
  // 参与者列表模态框
  const [participantModalVisible, setParticipantModalVisible] = useState(false);
  const [selectedExamForParticipants, setSelectedExamForParticipants] = useState<Exam | null>(null);
  
  // 看板布局状态
  const [expandedLane, setExpandedLane] = useState<ExamStatusType>(getInitialExpandedLane());
  const [currentPage, setCurrentPage] = useState<Record<ExamStatusType, number>>(getInitialPageState());

  // 获取初始展开的泳道
  function getInitialExpandedLane(): ExamStatusType {
    // 1. URL参数优先级最高
    const urlStatus = searchParams.get('status');
    if (urlStatus && Object.values(ExamStatus).includes(urlStatus as ExamStatusType)) {
      return urlStatus as ExamStatusType;
    }
    
    // 2. 来源页面上下文 (create-exam → DRAFT)
    if (location.state?.fromCreateExam) {
      return ExamStatus.DRAFT;
    }
    
    // 3. localStorage记忆状态
    const savedLane = localStorage.getItem('examList_expandedLane');
    if (savedLane && Object.values(ExamStatus).includes(savedLane as ExamStatusType)) {
      return savedLane as ExamStatusType;
    }
    
    // 4. 默认进行中状态
    return ExamStatus.PUBLISHED;
  }

  // 获取初始分页状态
  function getInitialPageState(): Record<ExamStatusType, number> {
    const savedPages = localStorage.getItem('examList_currentPage');
    if (savedPages) {
      try {
        return JSON.parse(savedPages);
      } catch (error) {
        console.error('解析分页状态失败:', error);
      }
    }
    
    return {
      [ExamStatus.DRAFT]: 1,
      [ExamStatus.PUBLISHED]: 1,
      [ExamStatus.EXPIRED]: 1,
      [ExamStatus.SUCCESS]: 1,
      [ExamStatus.ARCHIVED]: 1
    };
  }

  // 使用考试操作hooks
  const examOperations = useExamOperations(loadExams);

  // 按状态分组考试
  const examsByStatus = useMemo((): Record<ExamStatusType, Exam[]> => {
    return exams.reduce((acc, exam) => {
      const status = exam.status as ExamStatusType;
      if (!acc[status]) {
        acc[status] = [];
      }
      acc[status].push(exam);
      return acc;
    }, {
      [ExamStatus.DRAFT]: [],
      [ExamStatus.PUBLISHED]: [],
      [ExamStatus.EXPIRED]: [],
      [ExamStatus.SUCCESS]: [],
      [ExamStatus.ARCHIVED]: []
    } as Record<ExamStatusType, Exam[]>);
  }, [exams]);

  // 加载考试列表
  async function loadExams() {
    try {
      setLoading(true);
      const response = await examApi.getList();
      
      if (response.success) {
        setExams(response.data?.data || []);
      } else {
        throw new Error(response.error?.toString() || '加载考试列表失败');
      }
    } catch (error) {
      console.error('加载考试列表失败:', error);
      message.error(error instanceof Error ? error.message : '加载考试列表失败');
    } finally {
      setLoading(false);
    }
  }

  // 处理考试编辑
  const handleExamEdit = useCallback((exam: Exam) => {
    navigate(`/exams/${exam.id}/edit`, {
      state: { 
        returnTo: location.pathname + location.search,
        expandedLane: expandedLane
      }
    });
  }, [navigate, location, expandedLane]);

  // 处理查看学生
  const handleViewParticipants = useCallback((exam: Exam) => {
    setSelectedExamForParticipants(exam);
    setParticipantModalVisible(true);
  }, []);

  // 关闭学生列表模态框
  const handleCloseParticipantModal = useCallback(() => {
    setParticipantModalVisible(false);
    setSelectedExamForParticipants(null);
  }, []);

  // 打开考试详情（用于卡片点击）
  const openExamDetails = useCallback((ex: Exam) => {
    navigate(`/exams/${ex.id}`, {
      state: {
        from: 'exam-list',
        returnTo: location.pathname + location.search,
        expandedLane: expandedLane,
        currentPage: currentPage[expandedLane]
      }
    });
  }, [navigate, location, expandedLane, currentPage]);

  // 渲染考试卡片（保留，不在Kanban中使用）
  const renderExamCard = useCallback((exam: Exam) => {
    return (
      <ExamCard
        key={exam.id}
        exam={exam}
        onEdit={handleExamEdit}
        onDelete={examOperations.deleteExam}
        onViewParticipants={handleViewParticipants}
        onStatusChange={examOperations.changeExamStatus}
        onCopyLink={examOperations.copyExamLink}
        onOpen={openExamDetails}
      />
    );
  }, [handleExamEdit, handleViewParticipants, examOperations, openExamDetails]);

  // 更新URL状态
  const updateUrlState = useCallback((status: ExamStatusType) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('status', status);
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // 处理泳道切换
  const handleLaneChange = useCallback((newLane: ExamStatusType) => {
    setExpandedLane(newLane);
    updateUrlState(newLane);
    
    // 保存状态到localStorage
    localStorage.setItem('examList_expandedLane', newLane);
  }, [updateUrlState]);

  // 处理分页变化
  const handlePageChange = useCallback((newPages: Record<ExamStatusType, number>) => {
    setCurrentPage(newPages);
    
    // 保存分页状态到localStorage
    localStorage.setItem('examList_currentPage', JSON.stringify(newPages));
  }, []);

  // 创建新考试
  const handleCreateExam = useCallback(() => {
    navigate('/exams/create', {
      state: { 
        returnTo: location.pathname + location.search,
        expandedLane: expandedLane
      }
    });
  }, [navigate, location, expandedLane]);

  // 页面加载时获取数据
  useEffect(() => {
    loadExams();
  }, []);

  // 监听URL参数变化
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    if (urlStatus && urlStatus !== expandedLane) {
      if (Object.values(ExamStatus).includes(urlStatus as ExamStatusType)) {
        setExpandedLane(urlStatus as ExamStatusType);
      }
    }
  }, [searchParams, expandedLane]);

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #f0f8ff 0%, #e6f3ff 100%)',
      padding: '24px'
    }}>
      {/* 页面头部 - 固定高度 */}
      <Card className="shadow-sm" style={{ marginBottom: 24, borderRadius: 16, border: '1px solid #f0f0f0' }}
        styles={{
          body: {
            background: 'linear-gradient(135deg, #f0f8ff 0%, #e6f7ff 80%)',
            borderRadius: 16,
          }
        }}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center'
        }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              考试管理
            </Title>
            <span style={{ color: '#8c8c8c', fontSize: '14px' }}>
              共 {exams.length} 个考试
            </span>
          </div>
          
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadExams}
              loading={loading}
            >
              刷新
            </Button>
            
            <Button 
              type="text"
              onClick={() => window.location.href = '/exams/archive'}
            >
              📦 查看归档 ({(examsByStatus.ARCHIVED || []).length})
            </Button>
            
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateExam}
            >
              创建考试
            </Button>
          </Space>
        </div>

        {/* 统计卡片：按需开启。当前移除避免压缩泳道空间 */}
      </Card>

      {/* Kanban看板布局 - 占据剩余所有高度 */}
      <Card 
        style={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        styles={{ 
          body: { 
            padding: 0, 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden'
          } 
        }}
      >
        <KanbanLayout
          examsByStatus={examsByStatus}
          expandedLane={expandedLane}
          setExpandedLane={handleLaneChange}
          currentPage={currentPage}
          setCurrentPage={handlePageChange}
          onRenderExamCard={renderExamCard}
          loading={loading}
          onExamCardClick={openExamDetails}
          onEdit={handleExamEdit}
          onDelete={examOperations.deleteExam}
          onViewParticipants={handleViewParticipants}
          onStatusChange={examOperations.changeExamStatus}
          onCopyLink={examOperations.copyExamLink}
        />
      </Card>

      {/* 学生列表模态框 */}
      {selectedExamForParticipants && (
        <ParticipantListModal
          visible={participantModalVisible}
          onClose={handleCloseParticipantModal}
          examId={selectedExamForParticipants.id}
          examTitle={selectedExamForParticipants.title}
        />
      )}
    </div>
  );
};

export default ExamList;
