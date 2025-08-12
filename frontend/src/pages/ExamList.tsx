import React, { useState, useEffect } from 'react';
import {
  Button,
  Space,
  Typography,
  Card,
  Tag,
  message,
  Tooltip,
  Modal,
  Badge,
  Progress,
} from 'antd';
import {
  PlusOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  // RollbackOutlined, // 暂时不使用
  ReloadOutlined,
  FileTextOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { examApi } from '../services/api';
import type { Exam } from '../types';
import StudentListModal from '../components/StudentListModal';
import { ExamStatus, getStatusColor, getStatusName } from '../constants/examStatus';
import type { ExamStatusType } from '../constants/examStatus';

const { Title } = Typography;

const ExamList: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modal, contextHolder] = Modal.useModal();
  
  // 学生列表模态框相关
  const [studentModalVisible, setStudentModalVisible] = useState(false);
  const [selectedExamForStudents, setSelectedExamForStudents] = useState<Exam | null>(null);
  
  // 智能泳道状态记忆
  const getInitialExpandedLane = (): ExamStatusType => {
    // 1. 检查URL参数中的lane
    const urlLane = searchParams.get('lane') as ExamStatusType;
    if (urlLane && Object.values(ExamStatus).includes(urlLane)) {
      return urlLane;
    }
    
    // 2. 检查来源页面状态
    if (location.state?.from === 'create-exam') {
      // 从创建考试页面来，展开草稿
      return ExamStatus.DRAFT;
    }
    
    if (location.state?.from === 'exam-list' && location.state?.returnToLane) {
      // 从考试详情页返回，恢复之前的泳道状态
      const returnLane = location.state.returnToLane as ExamStatusType;
      if (Object.values(ExamStatus).includes(returnLane)) {
        return returnLane;
      }
    }
    
    // 3. 检查localStorage中的记忆状态
    const rememberedLane = localStorage.getItem('exam-kanban-expanded-lane') as ExamStatusType;
    if (rememberedLane && Object.values(ExamStatus).includes(rememberedLane)) {
      return rememberedLane;
    }
    
    // 4. 默认展开进行中
    return ExamStatus.PUBLISHED;
  };
  
  // 智能页面状态恢复
  const getInitialPageState = (): Record<ExamStatusType, number> => {
    const defaultPages = {
      [ExamStatus.DRAFT]: 1,
      [ExamStatus.PUBLISHED]: 1,
      [ExamStatus.EXPIRED]: 1,
      [ExamStatus.SUCCESS]: 1,
      [ExamStatus.ARCHIVED]: 1,
    };
    
    // 如果是从详情页返回，恢复页面状态
    if (location.state?.from === 'exam-list' && location.state?.returnToPage) {
      const returnLane = location.state.returnToLane as ExamStatusType;
      const returnPage = location.state.returnToPage as number;
      if (returnLane && returnPage > 0 && defaultPages.hasOwnProperty(returnLane)) {
        defaultPages[returnLane] = returnPage;
      }
    }
    
    return defaultPages;
  };
  
  // Kanban布局状态
  const [expandedLane, setExpandedLane] = useState<ExamStatusType>(getInitialExpandedLane());
  const [currentPage, setCurrentPage] = useState<Record<ExamStatusType, number>>(getInitialPageState());
  
  // 分页设置 - 智能布局：最多3列2行
  const CARDS_PER_PAGE_EXPANDED = 6; // 展开状态每页显示6个卡片 (2行 x 3列)
  const MIN_CARD_WIDTH = 300; // 卡片最小宽度300px
  const MAX_COLUMNS = 3; // 最多3列
  const MAX_ROWS = 2; // 最多2行
  // 宽度分配：收起泳道各12%，展开泳道64%，总计100%
  const COLLAPSED_WIDTH_PERCENT = 15; // 收起状态占容器宽度百分比
  const EXPANDED_WIDTH_PERCENT = 70; // 展开状态占容器宽度百分比

  useEffect(() => {
    loadExams();
  }, []);

  // 键盘导航支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) { // Alt + 数字键切换泳道
        const keyToStatus: Record<string, ExamStatusType> = {
          '1': ExamStatus.DRAFT,
          '2': ExamStatus.PUBLISHED,
          '3': ExamStatus.EXPIRED,
          '4': ExamStatus.SUCCESS,
        };
        
        if (keyToStatus[e.key]) {
          e.preventDefault();
          handleLaneChange(keyToStatus[e.key]);
        }
      } else if (expandedLane) {
        const totalPages = getTotalPages(expandedLane);
        const currentPageNum = currentPage[expandedLane];
        
        if (e.key === 'ArrowLeft' && currentPageNum > 1) {
          e.preventDefault();
          handlePageChange(expandedLane, currentPageNum - 1);
        } else if (e.key === 'ArrowRight' && currentPageNum < totalPages) {
          e.preventDefault();
          handlePageChange(expandedLane, currentPageNum + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedLane, currentPage]);

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

  // 恢复考试处理函数 (暂时不使用)
  // const handleRestoreExam = async (examId: string) => {
  //   try {
  //     const response = await examApi.restoreExam(examId);
  //     if (response.success) {
  //       message.success('考试已恢复');
  //       loadExams();
  //     } else {
  //       message.error(response.error || '恢复失败');
  //     }
  //   } catch (error) {
  //     console.error('恢复失败:', error);
  //     message.error('恢复失败');
  //   }
  // };

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

  // 按状态分组考试
  const getExamsByStatus = (status: ExamStatusType): Exam[] => {
    return exams.filter(exam => exam.status === status).sort((a, b) => 
      new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
    );
  };

  // 计算泳道宽度 - 精确百分比分配，避免溢出
  const calculateLaneWidth = (isExpanded: boolean) => {
    if (isExpanded) {
      // 展开状态：64%宽度
      return `${EXPANDED_WIDTH_PERCENT}%`;
    }
    // 收起状态：12%宽度
    return `${COLLAPSED_WIDTH_PERCENT}%`;
  };

  // 动态计算卡片布局参数
  const calculateCardLayout = () => {
    // 假设容器总宽度为1200px，展开泳道64%约为768px
    const estimatedLaneWidth = 768; // 64% of 1200px
    const availableWidth = estimatedLaneWidth - 32; // 减去padding
    
    // 计算可容纳的列数（考虑最小宽度300px和30%最大宽度限制）
    const maxWidthPer30Percent = Math.floor(availableWidth * 0.30);
    const actualCardWidth = Math.max(MIN_CARD_WIDTH, maxWidthPer30Percent);
    const possibleColumns = Math.floor(availableWidth / actualCardWidth);
    const actualColumns = Math.min(possibleColumns, MAX_COLUMNS);
    
    // 最终每页卡片数 = 列数 x 行数
    const cardsPerPage = actualColumns * MAX_ROWS;
    
    return {
      columns: actualColumns,
      cardWidth: actualCardWidth,
      cardsPerPage: Math.min(cardsPerPage, CARDS_PER_PAGE_EXPANDED)
    };
  };

  // 获取分页后的考试数据
  const getPaginatedExams = (status: ExamStatusType) => {
    const examsInLane = getExamsByStatus(status);
    const isExpanded = expandedLane === status;
    
    if (!isExpanded) {
      return examsInLane; // 收起状态显示所有考试（仅数量）
    }
    
    const cardLayout = calculateCardLayout();
    const currentPageNum = currentPage[status];
    const startIndex = (currentPageNum - 1) * cardLayout.cardsPerPage;
    const endIndex = startIndex + cardLayout.cardsPerPage;
    
    return examsInLane.slice(startIndex, endIndex);
  };

  // 获取总页数
  const getTotalPages = (status: ExamStatusType) => {
    const examsInLane = getExamsByStatus(status);
    const cardLayout = calculateCardLayout();
    return Math.ceil(examsInLane.length / cardLayout.cardsPerPage);
  };

  // 切换页面
  const handlePageChange = (status: ExamStatusType, page: number) => {
    setCurrentPage(prev => ({
      ...prev,
      [status]: page
    }));
  };

  // 智能泳道切换 - 记忆状态
  const handleLaneChange = (status: ExamStatusType) => {
    setExpandedLane(status);
    // 保存到localStorage
    localStorage.setItem('exam-kanban-expanded-lane', status);
    // 更新URL参数
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('lane', status);
      return newParams;
    });
  };

  // 渲染 Kanban 泳道
  const renderKanbanLane = (
    status: ExamStatusType,
    title: string,
    Icon: React.ComponentType<any>,
    color: string,
    bgColor: string
  ) => {
    const examsInLane = getExamsByStatus(status);
    const paginatedExams = getPaginatedExams(status);
    const isExpanded = expandedLane === status;
    const totalPages = getTotalPages(status);
    const currentPageNum = currentPage[status];
    
    return (
      <div
        key={status}
        style={{
          width: calculateLaneWidth(isExpanded),
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          flexShrink: 0,
          height: '100%',
          position: 'relative', // 为底部分页控件提供定位参考
          // 使用内边距代替外边距，避免溢出
          paddingRight: '4px',
          paddingLeft: '4px',
          boxSizing: 'border-box'
        }}
        onClick={() => !isExpanded && handleLaneChange(status)}
      >
        {/* 泳道头部 */}
        <div
          style={{
            background: isExpanded ? bgColor : '#fafafa',
            padding: isExpanded ? '16px' : '12px',
            borderRadius: isExpanded ? '12px 12px 0 0' : '12px',
            border: `2px solid ${isExpanded ? color : '#f0f0f0'}`,
            borderBottom: isExpanded ? 'none' : `2px solid #f0f0f0`,
            cursor: isExpanded ? 'default' : 'pointer',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: isExpanded ? `0 0 0 4px ${color}20` : 'none',
            height: isExpanded ? 'auto' : '100px', // 收起状态增大高度
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}
          className={!isExpanded ? 'hover:shadow-lg' : ''}
          onClick={(e) => {
            e.stopPropagation();
            if (!isExpanded) {
              handleLaneChange(status);
            }
          }}
        >
          {/* 基础信息 */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: isExpanded ? 'space-between' : 'center',
            flexDirection: isExpanded ? 'row' : 'column',
            gap: isExpanded ? '8px' : '4px'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: isExpanded ? '8px' : '4px',
              flexDirection: isExpanded ? 'row' : 'column'
            }}>
              <Icon style={{ 
                color, 
                fontSize: isExpanded ? '18px' : '16px',
                transition: 'all 0.3s ease'
              }} />
              {isExpanded && (
                <span style={{ 
                  fontWeight: 600, 
                  fontSize: '16px',
                  color: '#262626',
                  transition: 'all 0.3s ease'
                }}>
                  {title}
                </span>
              )}
            </div>
            
            {/* 收起状态：居中显示丰富信息 */}
            {!isExpanded && (
              <div style={{ 
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ 
                  fontWeight: 600, 
                  fontSize: '14px',
                  color: '#262626',
                  lineHeight: 1
                }}>
                  {title}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <Badge 
                    count={examsInLane.length} 
                    style={{ 
                      backgroundColor: color,
                      fontSize: '12px',
                      height: '20px',
                      minWidth: '20px',
                      lineHeight: '20px'
                    }}
                  />
                </div>
              </div>
            )}

            {/* 展开状态的右侧控件 */}
            {isExpanded && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* 分页控件 */}
                {totalPages > 1 && (
                  <Space size="small">
                    <Button
                      type="text"
                      size="small"
                      disabled={currentPageNum === 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePageChange(status, currentPageNum - 1);
                      }}
                      style={{ padding: '0 4px', height: '20px', fontSize: '12px' }}
                    >
                      ←
                    </Button>
                    <Typography.Text 
                      style={{ fontSize: '11px', color: '#8c8c8c', minWidth: '30px', textAlign: 'center' }}
                    >
                      {currentPageNum}/{totalPages}
                    </Typography.Text>
                    <Button
                      type="text"
                      size="small"
                      disabled={currentPageNum === totalPages}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePageChange(status, currentPageNum + 1);
                      }}
                      style={{ padding: '0 4px', height: '20px', fontSize: '12px' }}
                    >
                      →
                    </Button>
                  </Space>
                )}
                
                <Badge 
                  count={examsInLane.length} 
                  style={{ 
                    backgroundColor: color,
                    fontSize: '12px',
                    height: '20px',
                    minWidth: '20px',
                    lineHeight: '20px'
                  }}
                />
                
                {/* 收起按钮 */}
                {/* <Button
                  type="text"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    // 暂时没有收起逻辑，点击其他泳道会自动收起
                  }}
                  style={{ 
                    padding: '0 4px', 
                    height: '20px',
                    color: '#8c8c8c'
                  }}
                >
                  ✕
                </Button> */}
              </div>
            )}
          </div>
          
          {/* 展开状态的统计信息 */}
          {isExpanded && (
            <div style={{ marginTop: '12px' }}>
              <Progress
                percent={examsInLane.length > 0 ? Math.min(100, (examsInLane.length / Math.max(1, exams.length)) * 100) : 0}
                strokeColor={color}
                trailColor={`${color}20`}
                showInfo={false}
                strokeWidth={4}
                style={{ 
                  opacity: 0,
                  animation: 'fadeIn 0.5s ease 0.3s forwards'
                }}
              />
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginTop: '4px'
              }}>
                <Typography.Text 
                  type="secondary" 
                  style={{ 
                    fontSize: '11px',
                    opacity: 0,
                    animation: 'fadeIn 0.5s ease 0.4s forwards'
                  }}
                >
                  显示 {paginatedExams.length} / {examsInLane.length} 项 (每页最多{calculateCardLayout().cardsPerPage}项)
                </Typography.Text>
                {totalPages > 1 && (
                  <Typography.Text 
                    type="secondary" 
                    style={{ 
                      fontSize: '11px',
                      opacity: 0,
                      animation: 'fadeIn 0.5s ease 0.5s forwards'
                    }}
                  >
                    第 {currentPageNum} 页
                  </Typography.Text>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 泳道内容区域 */}
        {isExpanded && (
          <div
            style={{
              background: '#fafafa',
              borderRadius: '0 0 12px 12px',
              border: `2px solid ${color}`,
              borderTop: 'none',
              height: 'calc(100% - 160px)', // 减去增大的头部高度
              overflowY: 'auto',
              padding: '16px',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {examsInLane.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '32px 16px',
                color: '#8c8c8c',
                fontSize: '13px'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <Icon style={{ fontSize: '24px', color: '#d9d9d9' }} />
                </div>
                暂无{title}的考试
                {status === 'DRAFT' && (
                  <div style={{ marginTop: '12px' }}>
                    <Button
                      type="dashed"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => navigate('/exams/create')}
                      style={{ fontSize: '11px' }}
                    >
                      创建考试
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* 智能网格布局 - 动态计算最优列数 */}
                <div style={{ 
                  display: 'grid',
                  gridTemplateColumns: `repeat(${calculateCardLayout().columns}, minmax(${MIN_CARD_WIDTH}px, 1fr))`,
                  gap: '16px',
                  marginBottom: '16px',
                  alignItems: 'start',
                  gridTemplateRows: `repeat(${MAX_ROWS}, auto)` // 最多2行
                }}>
                  {paginatedExams.map((exam, index) => (
                    <div
                      key={exam.id}
                      style={{
                        opacity: 0,
                        animation: `slideInUp 0.4s ease ${index * 0.1}s forwards`
                      }}
                    >
                      <CompactExamCard exam={exam} />
                    </div>
                  ))}
                </div>
                
                {/* 页面信息 */}
                {totalPages > 1 && (
                  <div style={{
                    textAlign: 'center',
                    paddingTop: '8px',
                    opacity: 0,
                    animation: 'fadeIn 0.5s ease 0.6s forwards'
                  }}>
                    <Typography.Text 
                      type="secondary" 
                      style={{ fontSize: '11px' }}
                    >
                      显示 {paginatedExams.length} / {examsInLane.length} 项
                    </Typography.Text>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        
        {/* 收起状态：完全简化，不显示内容区域 */}
        {!isExpanded && examsInLane.length === 0 && (
          <div style={{
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.5,
            fontSize: '10px',
            color: '#8c8c8c'
          }}>
            无考试
          </div>
        )}
        
        {/* 固定底部分页控件 - 更明显的切换按钮 */}
        {isExpanded && totalPages > 1 && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            padding: '8px 16px',
            border: `1px solid ${color}30`,
            boxShadow: `0 4px 12px ${color}20`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 10
          }}>
            <Button
              type="text"
              size="small"
              disabled={currentPageNum === 1}
              onClick={(e) => {
                e.stopPropagation();
                handlePageChange(status, currentPageNum - 1);
              }}
              style={{ 
                padding: '4px 8px', 
                height: '28px', 
                fontSize: '14px',
                color: currentPageNum === 1 ? '#d9d9d9' : color,
                fontWeight: 600
              }}
              icon={<span>←</span>}
            >
              上页
            </Button>
            
            <div style={{
              background: `${color}15`,
              borderRadius: '12px',
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Typography.Text 
                style={{ 
                  fontSize: '12px', 
                  color: color,
                  fontWeight: 600,
                  minWidth: '40px',
                  textAlign: 'center'
                }}
              >
                {currentPageNum} / {totalPages}
              </Typography.Text>
              <Typography.Text 
                type="secondary" 
                style={{ fontSize: '10px' }}
              >
                共{examsInLane.length}项
              </Typography.Text>
            </div>
            
            <Button
              type="text"
              size="small"
              disabled={currentPageNum === totalPages}
              onClick={(e) => {
                e.stopPropagation();
                handlePageChange(status, currentPageNum + 1);
              }}
              style={{ 
                padding: '4px 8px', 
                height: '28px', 
                fontSize: '14px',
                color: currentPageNum === totalPages ? '#d9d9d9' : color,
                fontWeight: 600
              }}
            >
              下页
              <span style={{ marginLeft: '4px' }}>→</span>
            </Button>
          </div>
        )}
      </div>
    );
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

  // 获取考试状态相关信息
  const getExamInfo = (exam: Exam) => {
    const now = new Date();
    const endTime = exam.end_time || exam.endTime;
    const endDate = endTime ? new Date(endTime) : null;
    const isUrgent = endDate && (endDate.getTime() - now.getTime()) < 24 * 60 * 60 * 1000; // 24小时内结束
    const isActive = exam.status === ExamStatus.PUBLISHED;
    const hasParticipants = exam.participant_count && exam.participant_count > 0;
    
    return { isUrgent, isActive, hasParticipants };
  };

  // 获取卡片背景色 - 丰富的淡色彩系统
  const getCardBackground = (exam: Exam) => {
    const { isUrgent, isActive, hasParticipants } = getExamInfo(exam);
    const now = new Date();
    const startTime = exam.start_time || exam.startTime;
    const endTime = exam.end_time || exam.endTime;
    const startDate = startTime ? new Date(startTime) : null;
    const endDate = endTime ? new Date(endTime) : null;
    const isScheduled = startDate && startDate > now; // 未来开始的考试
    const isEnding = endDate && (endDate.getTime() - now.getTime()) < 3 * 24 * 60 * 60 * 1000; // 3天内结束
    
    // 紧急考试：暖红色渐变
    if (isUrgent) {
      return 'linear-gradient(135deg, #fff2f0 0%, #fef1f0 50%, #ffffff 100%)';
    }
    
    // 活跃考试（进行中）：清新绿色渐变
    if (isActive && !isEnding) {
      return 'linear-gradient(135deg, #f0faf0 0%, #f6ffed 50%, #ffffff 100%)';
    }
    
    // 即将结束的考试：淡橙色渐变
    if (isActive && isEnding) {
      return 'linear-gradient(135deg, #fff7e6 0%, #fff2e8 50%, #ffffff 100%)';
    }
    
    // 根据状态和特殊属性设置背景色
    switch (exam.status) {
      case ExamStatus.DRAFT:
        // 草稿：温暖的淡黄色
        if (exam.password || exam.has_password) {
          return 'linear-gradient(135deg, #fffbe6 0%, #fff9db 50%, #ffffff 100%)'; // 有密码的草稿
        }
        return 'linear-gradient(135deg, #fffaf0 0%, #fff8e1 50%, #ffffff 100%)'; // 普通草稿
        
      case ExamStatus.EXPIRED:
        // 已过期：柔和的灰粉色
        return 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 50%, #ffffff 100%)';
        
      case ExamStatus.SUCCESS:
        // 已完成：淡蓝紫色
        if (hasParticipants) {
          return 'linear-gradient(135deg, #f0f5ff 0%, #e6f7ff 50%, #ffffff 100%)'; // 有参与者的已完成
        }
        return 'linear-gradient(135deg, #f9f0ff 0%, #f4f1ff 50%, #ffffff 100%)'; // 无参与者的已完成
        
      case ExamStatus.PUBLISHED:
        // 已发布但未开始：淡紫色
        if (isScheduled) {
          return 'linear-gradient(135deg, #f8f4ff 0%, #f0ecff 50%, #ffffff 100%)'; // 预定时间的考试
        }
        if (exam.shuffle_questions || exam.shuffleQuestions) {
          return 'linear-gradient(135deg, #f0f9ff 0%, #e8f4f8 50%, #ffffff 100%)'; // 有打乱设置的考试
        }
        return 'linear-gradient(135deg, #f5f8ff 0%, #eff4ff 50%, #ffffff 100%)'; // 普通已发布
        
      default:
        // 其他状态：根据属性设置
        const hasPassword = exam.password || exam.has_password;
        const hasShuffleQuestions = exam.shuffle_questions || exam.shuffleQuestions;
        
        if (hasPassword && hasShuffleQuestions) {
          // 密码+打乱：淡青色
          return 'linear-gradient(135deg, #f0fdff 0%, #e6fffb 50%, #ffffff 100%)';
        }
        if (hasPassword) {
          // 仅密码保护：淡金色
          return 'linear-gradient(135deg, #fffbe6 0%, #fff8dc 50%, #ffffff 100%)';
        }
        if (hasShuffleQuestions) {
          // 仅打乱设置：淡薄荷色
          return 'linear-gradient(135deg, #f0fff4 0%, #ecfdf5 50%, #ffffff 100%)';
        }
        if (hasParticipants) {
          // 有参与者：淡绿色
          return 'linear-gradient(135deg, #f6ffed 0%, #f0f9f0 50%, #ffffff 100%)';
        }
        
        // 默认：纯净白色
        return 'linear-gradient(135deg, #ffffff 0%, #fafafa 50%, #ffffff 100%)';
    }
  };

  // 紧凑版卡片组件 - 网格布局，丰富内容
  const CompactExamCard: React.FC<{ exam: Exam }> = ({ exam }) => {
    const { isUrgent, isActive } = getExamInfo(exam);
    
    return (
      <Card
        size="small"
        className="kanban-card"
        style={{ 
          cursor: 'pointer',
          border: `2px solid ${isActive ? '#52c41a' : '#f0f0f0'}`,
          height: '200px', // 增加高度容纳更多内容
          background: getCardBackground(exam),
          position: 'relative',
          overflow: 'hidden'
        }}
        styles={{ body: { padding: '12px', height: '100%', position: 'relative' } }}
        hoverable
        onClick={() => navigate(`/exams/${exam.id}`, {
          state: { 
            from: 'exam-list',
            returnToLane: expandedLane,
            returnToPage: currentPage[expandedLane]
          }
        })}
      >
        {/* 状态指示器 */}
        {isUrgent && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 0,
            height: 0,
            borderLeft: '20px solid transparent',
            borderTop: '20px solid #ff4d4f'
          }}>
            <div style={{
              position: 'absolute',
              top: '-18px',
              right: '-2px',
              color: 'white',
              fontSize: '10px',
              fontWeight: 'bold'
            }}>!</div>
          </div>
        )}

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%',
          justifyContent: 'space-between'
        }}>
          {/* 标题和标签区域 */}
          <div>
            <div style={{ 
              fontWeight: 600, 
              fontSize: '15px', 
              color: isActive ? '#52c41a' : '#262626',
              marginBottom: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.2
            }}>
              {exam.title}
            </div>
            
            {/* 标签行 - 增强信息 */}
            <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              <Tag 
                color={getStatusColor(exam.status)} 
                style={{ fontSize: '10px', margin: 0, borderRadius: '8px' }}
              >
                {getStatusName(exam.status)}
              </Tag>
              
              {/* 题目数量标签 */}
              {exam.question_count && (
                <Tag color="blue" style={{ fontSize: '10px', margin: 0, borderRadius: '8px' }}>
                  📝 {exam.question_count}题
                </Tag>
              )}
              
              {isUrgent && (
                <Tag color="red" style={{ fontSize: '10px', margin: 0, borderRadius: '8px' }}>
                  🔥 急
                </Tag>
              )}
              
              {exam.participant_count > 0 && (
                <Tag color="green" style={{ fontSize: '10px', margin: 0, borderRadius: '8px' }}>
                  👥 {exam.participant_count}人
                </Tag>
              )}
              
              {exam.duration_minutes && exam.duration_minutes > 60 && (
                <Tag color="orange" style={{ fontSize: '10px', margin: 0, borderRadius: '8px' }}>
                  ⏱️ {Math.round(exam.duration_minutes / 60)}h
                </Tag>
              )}
              
              
              {/* 高级设置标签 */}
              {(exam.password || exam.has_password) && (
                <Tooltip title={exam.password ? `密码保护：${exam.password}` : '密码保护已设置'}>
                  <Tag 
                    color="gold" 
                    style={{ fontSize: '10px', margin: 0, borderRadius: '8px', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      message.info(exam.password ? `考试密码：${exam.password}` : '考试已设置密码保护');
                    }}
                  >
                    🔒 需密码
                  </Tag>
                </Tooltip>
              )}
              
              {(exam.shuffle_questions || exam.shuffleQuestions) && (
                <Tooltip title="题目顺序已打乱，每个学生看到的题目顺序不同">
                  <Tag 
                    color="purple" 
                    style={{ fontSize: '10px', margin: 0, borderRadius: '8px', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      message.info('题目顺序已打乱，每个学生看到的题目顺序不同');
                    }}
                  >
                    🔀 已打乱
                  </Tag>
                </Tooltip>
              )}
              
              {(exam.start_time || exam.startTime || exam.end_time || exam.endTime) && (
                <Tooltip title={
                  <div>
                    {(exam.start_time || exam.startTime) && <div>开始时间：{new Date(exam.start_time || exam.startTime!).toLocaleString()}</div>}
                    {(exam.end_time || exam.endTime) && <div>结束时间：{new Date(exam.end_time || exam.endTime!).toLocaleString()}</div>}
                  </div>
                }>
                  <Tag 
                    color="volcano" 
                    style={{ fontSize: '10px', margin: 0, borderRadius: '8px', cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const timeInfo = [];
                      const startTime = exam.start_time || exam.startTime;
                      const endTime = exam.end_time || exam.endTime;
                      if (startTime) {
                        timeInfo.push(`开始：${new Date(startTime).toLocaleString()}`);
                      }
                      if (endTime) {
                        timeInfo.push(`结束：${new Date(endTime).toLocaleString()}`);
                      }
                      message.info(timeInfo.join('\n'), 3);
                    }}
                  >
                    ⏰ 限时段
                  </Tag>
                </Tooltip>
              )}
            </div>
            
            <Typography.Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>
              <FileTextOutlined style={{ marginRight: 4 }} />
              {exam.paper_title ? 
                (exam.paper_title.length > 12 ? 
                  `${exam.paper_title.substring(0, 12)}...` : 
                  exam.paper_title
                ) : 
                '未知试卷'
              }
            </Typography.Text>
          </div>

          {/* 底部信息和操作 */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            paddingTop: 8,
            borderTop: '1px solid #f0f0f0'
          }}>
            {/* 左侧详细信息 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {(exam.end_time || exam.endTime) && (
                <Typography.Text 
                  type="secondary" 
                  style={{ 
                    fontSize: '10px',
                    color: isUrgent ? '#ff4d4f' : '#8c8c8c'
                  }}
                >
                  <CalendarOutlined style={{ marginRight: 2 }} />
                  截止 {new Date(exam.end_time || exam.endTime!).toLocaleDateString()}
                </Typography.Text>
              )}
              <Typography.Text type="secondary" style={{ fontSize: '10px' }}>
                <ClockCircleOutlined style={{ marginRight: 2 }} />
                {exam.duration_minutes || 0}分钟
                {exam.question_count && ` · ${exam.question_count}题`}
              </Typography.Text>
              {exam.created_at && (
                <Typography.Text type="secondary" style={{ fontSize: '9px', opacity: 0.7 }}>
                  创建于 {new Date(exam.created_at).toLocaleDateString()}
                </Typography.Text>
              )}
            </div>
            
            {/* 右侧操作按钮 - 增强版 */}
            <Space size="small">
              {/* 链接按钮 - 加大图标 */}
              {exam.status === ExamStatus.PUBLISHED && exam.public_url && (
                <Tooltip title="复制考试链接">
                  <Button
                    type="text"
                    size="small"
                    icon={<LinkOutlined style={{ fontSize: '16px' }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(exam.public_url);
                    }}
                    style={{ 
                      padding: '4px 6px', 
                      height: '28px',
                      color: '#52c41a',
                      border: '1px solid #52c41a30',
                      borderRadius: '6px'
                    }}
                  />
                </Tooltip>
              )}
              
              {/* 状态操作按钮 */}
              {exam.status === ExamStatus.DRAFT && (
                <>
                  <Tooltip title="编辑考试">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined style={{ fontSize: '14px' }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/exams/${exam.id}/edit`, {
                          state: { 
                            from: 'exam-list',
                            returnToLane: expandedLane,
                            returnToPage: currentPage[expandedLane]
                          }
                        });
                      }}
                      style={{ 
                        color: '#faad14', 
                        padding: '4px 6px', 
                        height: '28px',
                        border: '1px solid #faad1430',
                        borderRadius: '6px'
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="发布考试">
                    <Button
                      type="text"
                      size="small"
                      icon={<PlayCircleOutlined style={{ fontSize: '14px' }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePublish(exam.id);
                      }}
                      style={{ 
                        color: '#1890ff', 
                        padding: '4px 6px', 
                        height: '28px',
                        border: '1px solid #1890ff30',
                        borderRadius: '6px'
                      }}
                    />
                  </Tooltip>
                </>
              )}
              
              {exam.status === ExamStatus.PUBLISHED && (
                <>
                  <Tooltip title="停止考试">
                    <Button
                      type="text"
                      size="small"
                      icon={<StopOutlined style={{ fontSize: '14px' }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePublish(exam.id); // 停止=切换发布状态
                      }}
                      style={{ 
                        color: '#ff4d4f', 
                        padding: '4px 6px', 
                        height: '28px',
                        border: '1px solid #ff4d4f30',
                        borderRadius: '6px'
                      }}
                    />
                  </Tooltip>
                  <Tooltip title="结束考试">
                    <Button
                      type="text"
                      size="small"
                      icon={<CheckCircleOutlined style={{ fontSize: '14px' }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFinishExam(exam.id);
                      }}
                      style={{ 
                        color: '#1890ff', 
                        padding: '4px 6px', 
                        height: '28px',
                        border: '1px solid #1890ff30',
                        borderRadius: '6px'
                      }}
                    />
                  </Tooltip>
                </>
              )}
              
              {(exam.status === ExamStatus.SUCCESS || exam.status === ExamStatus.EXPIRED) && (
                <Tooltip title="归档考试">
                  <Button
                    type="text"
                    size="small"
                    icon={<InboxOutlined style={{ fontSize: '14px' }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleArchiveExam(exam.id);
                    }}
                    style={{ 
                      color: '#8c8c8c', 
                      padding: '4px 6px', 
                      height: '28px',
                      border: '1px solid #8c8c8c30',
                      borderRadius: '6px'
                    }}
                  />
                </Tooltip>
              )}
              
              {/* 删除按钮 */}
              {canDeleteExam(exam) && (
                <Tooltip title={getDeleteTooltip(exam)}>
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined style={{ fontSize: '14px' }} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      showDeleteConfirm(exam);
                    }}
                    style={{ 
                      color: '#ff4d4f', 
                      padding: '4px 6px', 
                      height: '28px',
                      border: '1px solid #ff4d4f30',
                      borderRadius: '6px'
                    }}
                  />
                </Tooltip>
              )}
            </Space>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden' 
    }}>
      {/* 重要：必须添加contextHolder才能显示Modal */}
      {contextHolder}
      
      {/* 页面标题和操作按钮 */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center'
        }}>
          <div>
            <Title level={1} style={{ margin: 0, fontSize: '1.8rem' }}>
              考试管理
            </Title>
            <Typography.Text type="secondary" style={{ fontSize: '14px' }}>
              智能展开收起 • 快捷键：Alt+1-4 切换泳道，←→ 翻页
            </Typography.Text>
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
              onClick={() => navigate('/exams/create', { 
                state: { returnTo: 'exam-list', targetLane: ExamStatus.DRAFT }
              })}
              size="large"
            >
              创建考试
            </Button>
          </Space>
        </div>
      </Card>

      {/* Kanban 看板 - 占满卡片剩余高度 */}
      <Card 
        style={{ 
          marginTop: 24,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        styles={{ body: { padding: 0, flex: 1, display: 'flex', flexDirection: 'column' } }}
      >
        <div style={{ 
          display: 'flex', 
          height: '100%',
          overflowX: 'hidden',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          borderRadius: '12px',
          padding: '20px'
          // 移除gap，使用百分比精确分配宽度
        }}>
        {/* 草稿泳道 */}
        {renderKanbanLane(ExamStatus.DRAFT, '草稿', EditOutlined, '#fa8c16', '#fff9e6')}

        {/* 进行中泳道 */}
        {renderKanbanLane(ExamStatus.PUBLISHED, '进行中', PlayCircleOutlined, '#52c41a', '#f0f9f0')}

        {/* 已停止泳道 */}
        {/* {renderKanbanLane(ExamStatus.EXPIRED, '已停止', StopOutlined, '#ff4d4f', '#fff0f0')} */}

        {/* 已结束泳道 */}
        {renderKanbanLane(ExamStatus.SUCCESS, '已结束', CheckCircleOutlined, '#1890ff', '#f0f5ff')}
        </div>
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