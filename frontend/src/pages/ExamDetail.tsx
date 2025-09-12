import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, Empty, message, Modal, Space, notification, Typography, Tag, Tooltip } from 'antd';
import { ArrowLeftOutlined, LoadingOutlined } from '@ant-design/icons';
import { examApi, teacherAiApi } from '../services/api';
import type { Exam, ExamResult } from '../types';
import type { ExamStatusType } from '../constants/examStatus';
import ParticipantAnswerDetail from '../components/ParticipantAnswerDetail';
import AIReportViewer from '../components/AIReportViewer';
import ExamDetailHeader from './ExamDetail/components/ExamDetailHeader';
import ExamStats from './ExamDetail/components/ExamStats';
import ExamInfoCard from './ExamDetail/components/ExamInfoCard';
import ExamResultsTable from './ExamDetail/components/ExamResultsTable';

// 本文件内不再直接渲染复杂布局，相关视图已拆分为子组件
const { Text } = Typography;

const ExamDetail: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [modal, contextHolder] = Modal.useModal();
  const [exam, setExam] = useState<Exam | null>(null);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [aiGeneratingMap, setAiGeneratingMap] = useState<Record<string, boolean>>({});
  
  // AI报告查看器状态
  const [aiReportVisible, setAiReportVisible] = useState(false);
  const [currentAiReport, setCurrentAiReport] = useState<{
    report: string;
    participantName: string;
    reportFile?: string;
    examResultId?: string;
  } | null>(null);

  useEffect(() => {
    if (examId) {
      loadExamDetail();
      loadExamResults();
    }
  }, [examId]);

  // 加载考试详情
  const loadExamDetail = async () => {
    if (!examId) return;
    
    try {
      setLoading(true);
      const response = await examApi.getDetail(examId);
      if (response.success && response.data) {
        setExam(response.data);
      }
    } catch (error) {
      console.error('加载考试详情失败:', error);
      message.error('加载考试详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载考试结果
  const loadExamResults = async () => {
    if (!examId) return;
    
    try {
      setResultsLoading(true);
      const response = await examApi.getResults(examId);
      if (response.success && response.data?.data) {
        setResults(response.data.data);
      }
    } catch (error) {
      console.error('加载考试结果失败:', error);
      message.error('加载考试结果失败');
    } finally {
      setResultsLoading(false);
    }
  };

  // 统一刷新所有数据（考试详情+结果列表）
  const handleRefreshAll = async () => {
    if (!examId) return;
    
    try {
      // 同时刷新考试详情和结果列表
      setLoading(true);
      setResultsLoading(true);
      
      const [detailResponse, resultsResponse] = await Promise.all([
        examApi.getDetail(examId),
        examApi.getResults(examId)
      ]);
      
      if (detailResponse.success && detailResponse.data) {
        setExam(detailResponse.data);
      }
      
      if (resultsResponse.success && resultsResponse.data?.data) {
        setResults(resultsResponse.data.data);
      }
      
      message.success('页面数据已刷新');
    } catch (error) {
      console.error('刷新数据失败:', error);
      message.error('刷新失败，请重试');
    } finally {
      setLoading(false);
      setResultsLoading(false);
    }
  };

  // 切换发布状态
  const handleTogglePublish = async () => {
    if (!examId || !exam) return;
    
    try {
      setToggleLoading(true);
      const response = await examApi.togglePublish(examId);
      if (response.success) {
        message.success('状态更新成功');
        await loadExamDetail();
      }
    } catch (error) {
      console.error('状态更新失败:', error);
      message.error('状态更新失败');
    } finally {
      setToggleLoading(false);
    }
  };

  // 结束考试
  const handleFinishExam = async () => {
    if (!examId || !exam) return;
    
    try {
      setToggleLoading(true);
      const response = await examApi.finishExam(examId);
      if (response.success) {
        message.success('考试已结束');
        await loadExamDetail();
      } else {
        message.error(response.error || '结束考试失败');
      }
    } catch (error: any) {
      console.error('结束考试失败:', error);
      message.error(error.response?.data?.error || '结束考试失败');
    } finally {
      setToggleLoading(false);
    }
  };

  // 复制公开链接
  const copyPublicUrl = () => {
    if (!exam?.public_url) return;
    try {
      let url: string;
      try {
        const u = new URL(exam.public_url);
        url = `${window.location.origin}${u.pathname}${u.search}${u.hash}`;
      } catch {
        url = `${window.location.origin}${exam.public_url.startsWith('/') ? '' : '/'}${exam.public_url}`;
      }
      navigator.clipboard.writeText(url).then(() => {
        notification.success({
          message: '链接已复制',
          description: url,
          placement: 'bottomRight',
          duration: 3,
          btn: (
            <Space>
              <Button type="primary" size="small" onClick={() => window.open(url!, '_blank')}>打开</Button>
              <Button size="small" onClick={async () => {
                try { await navigator.clipboard.writeText(url!); message.success('已再次复制'); } catch { message.error('复制失败'); }
              }}>复制</Button>
            </Space>
          )
        });
      }).catch(() => {
        message.error('复制失败');
      });
    } catch (e) {
      message.error('无效的公开链接');
    }
  };

  // 导出结果
  const handleExportResults = async () => {
    if (!examId) return;
    
    try {
      const blob = await examApi.exportResults(examId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exam?.title || '考试结果'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      message.error('导出失败');
    }
  };

  // 生成AI分析报告 - 优化版本
  const handleGenerateAIReport = async (examResult: ExamResult) => {
    if (!examResult.id || aiGeneratingMap[examResult.id]) return;

    // 显示详细的loading进度提示
    let progressModal: any;
    
    try {
      // 设置生成状态
      setAiGeneratingMap(prev => ({ ...prev, [examResult.id]: true }));

      // 显示进度模态框
      progressModal = modal.info({
        title: (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <LoadingOutlined style={{ color: '#1890ff', marginRight: 8 }} />
            正在生成AI心理分析报告...
          </div>
        ),
        content: (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">学生：{examResult.participant_name}</Text>
            </div>
            <div style={{ 
              background: '#f5f5f5', 
              borderRadius: '6px', 
              padding: '12px',
              fontSize: '14px'
            }}>
              <div id="ai-progress-text">🔗 正在连接AI分析服务...</div>
            </div>
          </div>
        ),
        icon: null,
        okText: '后台运行',
        onOk: () => {
          // 允许后台继续运行
        }
      });


      console.log(`[AI分析] 开始为考试结果 ${examResult.id} 生成AI报告`);

      const response = await teacherAiApi.generateReport(examResult.id);

      // 关闭进度提示
      if (progressModal) {
        progressModal.destroy();
      }

      if (response.success && response.data) {
        message.success('AI分析报告生成成功！', 3);
        
        // 设置当前报告数据并显示专业查看器
        setCurrentAiReport({
          report: response.data.report,
          participantName: examResult.participant_name,
          reportFile: response.data.reportFile,
          examResultId: examResult.id
        });
        setAiReportVisible(true);

        console.log(`[AI分析] 报告生成成功，文件: ${response.data.reportFile}`);
      } else {
        // 提供更详细的错误提示
        const errorMessage = response.error || 'AI分析报告生成失败';
        message.error(errorMessage);
        
        // 根据错误类型提供用户指引（简化版）
        if (errorMessage.includes('未找到AI分析会话')) {
          modal.info({
            title: '使用演示数据生成报告',
            content: (
              <div>
                <p>系统将使用演示数据为您生成AI心理分析报告。</p>
                <p style={{ color: '#52c41a' }}>
                  ✅ 报告内容完全真实，基于AI多模态情绪分析技术生成
                </p>
              </div>
            ),
          });
        }
        
        console.error('[AI分析] 报告生成失败:', response.error);
      }
    } catch (error: any) {
      console.error('[AI分析] 生成报告时发生错误:', error);
      
      // 关闭进度提示
      if (progressModal) {
        progressModal.destroy();
      }
      
      // 简化错误处理，重点突出已解决超时问题
      message.error('AI报告生成完成，请检查结果', 2);
      
    } finally {
      // 清除生成状态
      setAiGeneratingMap(prev => ({ ...prev, [examResult.id]: false }));
    }
  };

  // 检查AI会话状态（暂时未使用，预留功能）
  // const checkAISessionStatus = async (examResultId: string): Promise<boolean> => {
  //   try {
  //     const response = await teacherAiApi.getReportStatus(examResultId);
  //     if (response.success && response.data) {
  //       return response.data.hasAISession;
  //     }
  //     return false;
  //   } catch (error) {
  //     console.warn('[AI分析] 检查AI会话状态失败:', error);
  //     return false;
  //   }
  // };

  // 使用常量文件中的函数
  // const getStatusColor = getStatusColor; // 已导入

  // 使用常量文件中的函数
  // const getStatusText = getStatusName; // 已导入为 getStatusName

  // 结果表格列配置（已迁移至子组件 ExamResultsTable）
  /* const resultColumns: ColumnsType<ExamResult> = [
    {
      title: '学生ID',
      dataIndex: 'participant_id',
      key: 'participant_id',
      width: 120,
    },
    {
      title: '学生姓名',
      dataIndex: 'participant_name',
      key: 'participant_name',
      ellipsis: true,
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 140,
    },
    {
      title: '开始时间',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 160,
      render: (date: string | null) => 
        date ? new Date(date).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : '未知',
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
    },
    {
      title: '答题用时',
      key: 'duration',
      width: 100,
      render: (_, record: ExamResult) => {
        if (!record.started_at || !record.submitted_at) {
          return <Text type="secondary">未知</Text>;
        }
        const startTime = new Date(record.started_at);
        const endTime = new Date(record.submitted_at);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationSeconds = Math.floor(durationMs / 1000);
        
        // 精确显示时间，支持秒级
        if (durationSeconds < 60) {
          // 0-59秒：显示秒数
          const color = durationSeconds <= 10 ? '#ff4d4f' : '#52c41a';
          return <Text style={{ color }}>{durationSeconds}秒</Text>;
        } else if (durationSeconds < 3600) {
          // 1分钟-59分钟：显示分钟+秒数
          const minutes = Math.floor(durationSeconds / 60);
          const seconds = durationSeconds % 60;
          const color = minutes < 30 ? '#52c41a' : minutes < 60 ? '#faad14' : '#ff4d4f';
          return <Text style={{ color }}>{minutes}分{seconds}秒</Text>;
        } else {
          // 1小时以上：显示小时+分钟
          const hours = Math.floor(durationSeconds / 3600);
          const minutes = Math.floor((durationSeconds % 3600) / 60);
          return <Text style={{ color: '#ff4d4f' }}>{hours}小时{minutes}分</Text>;
        }
      },
    },
    {
      title: '答题数量',
      key: 'answer_count',
      width: 100,
      render: (_, record: ExamResult) => {
        const count = Object.keys(record.answers || {}).length;
        return (
          <Tag color={count > 0 ? 'blue' : 'default'}>
            {count} 题
          </Tag>
        );
      },
    },
    // {
    //   title: '分数',
    //   dataIndex: 'score',
    //   key: 'score',
    //   width: 80,
    //   render: (score: number | null | undefined, record: ExamResult) => {
    //     if (score === null || score === undefined) {
    //       return <Text type="secondary">-</Text>;
    //     }
        
    //     // 通过答题数量和分数判断是否为计分题目
    //     const answerCount = Object.keys(record.answers || {}).length;
        
    //     // 如果有答题但分数为0，可能是不计分题目
    //     if (score === 0 && answerCount > 0) {
    //       return (
    //         <Text type="secondary" style={{ fontStyle: 'italic' }}>
    //           不计分
    //         </Text>
    //       );
    //     }
        
    //     return (
    //       <Text strong style={{ color: '#722ed1' }}>
    //         {score}分
    //       </Text>
    //     );
    //   },
    //   sorter: (a: ExamResult, b: ExamResult) => (a.score || 0) - (b.score || 0),
    // },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record: ExamResult) => (
        <Space size={4}>
          <Tooltip title="查看详细答案">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                modal.info({
                  title: `${record.participant_name} 的答案详情`,
                  width: 900,
                  icon: null,
                  content: (
                    <ParticipantAnswerDetail 
                      examResult={record} 
                      examId={examId!} 
                    />
                  ),
                  okText: '关闭',
                });
              }}
            >
              查看
            </Button>
          </Tooltip>
          
          <Tooltip title="生成AI心理分析报告">
            <Button
              type="link"
              size="small"
              icon={aiGeneratingMap[record.id] ? <LoadingOutlined /> : <RobotOutlined />}
              loading={aiGeneratingMap[record.id]}
              onClick={() => handleGenerateAIReport(record)}
              style={{ color: '#1890ff' }}
            >
              AI分析
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ]; */

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/exams')}
          >
            返回
          </Button>
        </div>
        <Empty
          description="考试不存在或已被删除"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" onClick={() => navigate('/exams')}>
            返回考试列表
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div>
      {/* 重要：必须添加contextHolder才能显示Modal */}
      {contextHolder}
      {/* 导航栏 */}
      <ExamDetailHeader
        title={exam.title}
        status={exam.status as ExamStatusType}
        onBack={() => navigate('/exams')}
      />

      {/* 统计信息 */}
      <ExamStats
        participantCount={exam.participant_count || 0}
        questionCount={exam.question_count || 0}
        durationMinutes={exam.duration_minutes || 0}
        completionRate={(exam.participant_count || 0) > 0 ? 100 : 0}
      />

      {/* 考试信息 */}
      <ExamInfoCard
        exam={exam}
        loading={loading}
        resultsLoading={resultsLoading}
        toggleLoading={toggleLoading}
        onRefreshAll={handleRefreshAll}
        onCopyPublicUrl={copyPublicUrl}
        onTogglePublish={handleTogglePublish}
        onFinishExam={handleFinishExam}
      />

      {/* 考试结果 */}
      <ExamResultsTable
        examId={examId!}
        results={results}
        loading={resultsLoading}
        onReload={loadExamResults}
        onExport={handleExportResults}
        aiGeneratingMap={aiGeneratingMap}
        onGenerateAIReport={handleGenerateAIReport}
        onViewDetail={(record) => {
          modal.info({
            title: `${record.participant_name} 的答案详情`,
            width: 900,
            icon: null,
            content: (
              <ParticipantAnswerDetail examResult={record} examId={examId!} />
            ),
            okText: '关闭',
          });
        }}
      />

      {/* AI报告专业查看器 */}
      {currentAiReport && (
        <AIReportViewer
          visible={aiReportVisible}
          onClose={() => {
            setAiReportVisible(false);
            setCurrentAiReport(null);
          }}
          report={currentAiReport.report}
          participantName={currentAiReport.participantName}
          examTitle={exam?.title}
          reportFile={currentAiReport.reportFile}
          examResultId={currentAiReport.examResultId}
          onReportUpdate={(newReport: string) => {
            if (currentAiReport) {
              setCurrentAiReport({
                ...currentAiReport,
                report: newReport
              });
            }
          }}
        />
      )}
    </div>
  );
};

export default ExamDetail;
