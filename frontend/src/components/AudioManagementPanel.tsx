import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Button,
  Space,
  Typography,
  Table,
  Tag,
  Tooltip,
  Modal,
  Alert,
  Statistic,
  Row,
  Col,
  message,
  Dropdown,
  Progress,
  type MenuProps,
} from 'antd';
import {
  SoundOutlined,
  ReloadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  MoreOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import AudioFilePlayer from './AudioFilePlayer';
import FullScreenLoading from './FullScreenLoading';
import { audioApi, audioSettings } from '../services/audioApi';
import type { 
  Question, 
  PaperAudioStatus, 
  BatchAudioGenerateRequest,
} from '../types';

const { Text } = Typography;

interface AudioManagementPanelProps {
  paperId: string;
  questions: Question[];
  onQuestionsUpdate?: () => void;
}

interface QuestionWithAudio extends Question {
  audioAccessible?: boolean;
}

interface ProgressState {
  overall: {
    current: number;
    total: number;
    progress: number;
    status: string;
  };
  questions: Record<string, {
    title: string;
    status: 'pending' | 'start' | 'progress' | 'completed' | 'error';
    progress: number;
    error?: string;
  }>;
}


const AudioManagementPanel: React.FC<AudioManagementPanelProps> = ({
  paperId,
  questions,
  onQuestionsUpdate
}) => {
  const [audioStatus, setAudioStatus] = useState<PaperAudioStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [questionsWithAudio, setQuestionsWithAudio] = useState<QuestionWithAudio[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  
  // 轮询进度状态（替代WebSocket）
  const [progressState, setProgressState] = useState<ProgressState>({
    overall: { current: 0, total: 0, progress: 0, status: 'idle' },
    questions: {}
  });
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  // 全屏加载状态
  const [showFullScreenLoading, setShowFullScreenLoading] = useState(false);


  // 使用新的聚合接口加载音频状态和题目信息
  const loadAudioStatusAndQuestions = async () => {
    try {
      setLoading(true);
      const response = await audioApi.getPaperAudioStatus(paperId);
      if (response.success && response.data) {
        const { questions: questionStatus, summary } = response.data;
        
        // 设置音频状态概览
        setAudioStatus({
          paperId: paperId,
          paperTitle: '', // 后端没有返回此字段，暂时留空
          totalQuestions: summary.total,
          completionRate: summary.completionRate,
          totalDuration: questionStatus.reduce((sum: number, q: any) => sum + (q.duration || 0), 0),
          averageDuration: summary.total > 0 ? 
            questionStatus.reduce((sum: number, q: any) => sum + (q.duration || 0), 0) / summary.total : 0,
          statusCount: {
            ready: summary.ready,
            generating: summary.generating,
            error: summary.error,
            none: summary.none,
            pending: 0, // 新接口中没有pending状态，设为0
            needUpdate: summary.needUpdate
          }
        });
        
        // 设置题目列表（合并服务端数据和当前题目信息）
        const updatedQuestions = questions.map(q => {
          const serverData = questionStatus.find((qs: any) => qs.id === q.id);
          return {
            ...q,
            audio_status: serverData?.audioStatus || 'none',
            audio_url: serverData?.audioUrl,
            audioAccessible: serverData?.audioAccessible || false,
            audio_duration: serverData?.duration,
            audio_needs_update: serverData?.needsUpdate || false
          };
        });
        
        setQuestionsWithAudio(updatedQuestions);
      }
    } catch (error) {
      console.error('加载音频状态失败:', error);
      message.error('加载音频状态失败');
    } finally {
      setLoading(false);
    }
  };

  // 轮询机制替代WebSocket
  const startProgressPolling = useCallback(() => {
    if (pollingRef.current) return; // 防止重复启动

    console.log('📊 启动进度轮询机制');
    
    const poll = async () => {
      try {
        const response = await audioApi.getPaperAudioStatus(paperId);
        if (response.success && response.data) {
          const { summary } = response.data;
          
          // 更新进度状态
          setProgressState(prev => ({
            ...prev,
            overall: {
              current: summary.ready,
              total: summary.total,
              progress: Math.round((summary.ready / summary.total) * 100),
              status: summary.generating > 0 ? 'generating' : 'idle'
            }
          }));

          // 如果还有正在生成的任务，继续轮询
          if (summary.generating > 0) {
            pollingRef.current = setTimeout(poll, 2000); // 2秒轮询一次
          } else {
            // 生成完成，停止轮询并刷新页面数据
            stopProgressPolling();
            loadAudioStatusAndQuestions();
          }
        }
      } catch (error) {
        console.error('❌ 轮询进度失败:', error);
        // 出错时继续尝试轮询，但间隔更长
        pollingRef.current = setTimeout(poll, 5000); // 5秒后重试
      }
    };

    // 立即执行一次，然后开始轮询
    poll();
  }, [paperId]);

  // 停止轮询
  const stopProgressPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
      console.log('📊 停止进度轮询机制');
    }
  }, []);


  // 重置进度状态
  const resetProgressState = useCallback(() => {
    setProgressState({
      overall: { current: 0, total: 0, progress: 0, status: 'idle' },
      questions: {}
    });
  }, []);

  // 初始化加载
  useEffect(() => {
    if (paperId && questions.length > 0) {
      loadAudioStatusAndQuestions();
    }
  }, [paperId, questions]);

  // 清理轮询
  useEffect(() => {
    return () => {
      stopProgressPolling();
    };
  }, [stopProgressPolling]);

  // 防离开确认机制
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (batchGenerating) {
        const message = '语音生成正在进行中，离开页面将中断任务。确定要离开吗？';
        event.preventDefault();
        event.returnValue = message; // 标准方法
        return message; // 兼容老浏览器
      }
    };

    if (batchGenerating) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [batchGenerating]);

  // 批量生成语音文件
  const handleBatchGenerate = async (forceRegenerate: boolean = false) => {
    try {
      setBatchGenerating(true);
      setShowFullScreenLoading(true); // 显示全屏加载
      resetProgressState();
      
      // 启动轮询以获取实时进度
      startProgressPolling();
      
      const request: BatchAudioGenerateRequest = {
        voiceSettings: audioSettings.load(),
        forceRegenerate
      };

      const response = await audioApi.batchGenerateAudio(paperId, request);
      
      if (response.success && response.data) {
        const data = response.data;
        
        // 批量生成完成消息
        message.success(
          `批量生成完成！成功: ${data.successCount}, 失败: ${data.failedCount}`
        );
        
        if (data.errors && data.errors.length > 0) {
          Modal.error({
            title: '部分语音生成失败',
            content: (
              <div>
                <p>以下题目生成失败：</p>
                <ul>
                  {data.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )
          });
        }
        
        // 刷新页面数据
        await loadAudioStatusAndQuestions();
        onQuestionsUpdate?.();
      }
    } catch (error: any) {
      console.error('批量生成失败:', error);
      message.error(error?.message || '批量生成失败');
      
      // 更新进度状态为错误
      setProgressState(prev => ({
        ...prev,
        overall: {
          ...prev.overall,
          status: 'error'
        }
      }));
    } finally {
      setBatchGenerating(false);
      setShowFullScreenLoading(false); // 隐藏全屏加载
      stopProgressPolling(); // 停止轮询
      
      // 延迟重置进度状态
      setTimeout(() => {
        resetProgressState();
      }, 2000);
    }
  };

  // 生成单个题目的语音
  const handleGenerateQuestion = async (questionId: string) => {
    try {
      const response = await audioApi.generateQuestionAudio(
        questionId, 
        audioSettings.load()
      );
      
      if (response.success) {
        message.success('语音生成成功');
        await loadAudioStatusAndQuestions();
        onQuestionsUpdate?.();
      }
    } catch (error: any) {
      console.error('生成语音失败:', error);
      message.error(error?.message || '生成语音失败');
    }
  };

  // 删除语音文件
  const handleDeleteAudio = async (questionId: string) => {
    try {
      const response = await audioApi.deleteQuestionAudio(questionId);
      
      if (response.success) {
        message.success('语音文件已删除');
        await loadAudioStatusAndQuestions();
        onQuestionsUpdate?.();
      }
    } catch (error: any) {
      console.error('删除语音失败:', error);
      message.error(error?.message || '删除语音失败');
    }
  };

  // 下载音频文件
  const handleDownloadAudio = async (questionId: string, title: string) => {
    try {
      const blob = await audioApi.downloadAudio(questionId, 'question_audio.mp3');
      
      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.slice(0, 20)}_语音.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      message.success('开始下载语音文件');
    } catch (error) {
      console.error('下载失败:', error);
      message.error('下载失败');
    }
  };

  // 获取音频状态标签
  const getAudioStatusTag = (question: QuestionWithAudio) => {
    const status = question.audio_status || 'none';
    const needsUpdate = question.audio_needs_update;
    
    if (needsUpdate) {
      return <Tag color="orange" icon={<ExclamationCircleOutlined />}>需要更新</Tag>;
    }
    
    switch (status) {
      case 'ready':
        return <Tag color="green" icon={<CheckCircleOutlined />}>已完成</Tag>;
      case 'generating':
        return <Tag color="blue" icon={<LoadingOutlined />}>生成中</Tag>;
      case 'pending':
        return <Tag color="gold">等待中</Tag>;
      case 'error':
        return <Tag color="red" icon={<ExclamationCircleOutlined />}>生成失败</Tag>;
      default:
        return <Tag>无语音</Tag>;
    }
  };

  // 表格列定义
  const columns: ColumnsType<QuestionWithAudio> = [
    {
      title: '题目序号',
      dataIndex: 'question_order',
      key: 'question_order',
      width: 80,
      sorter: (a, b) => a.question_order - b.question_order,
    },
    {
      title: '题目内容',
      dataIndex: 'title',
      key: 'title',
      ellipsis: { showTitle: false },
      render: (title: string) => (
        <Tooltip title={title}>
          <Text ellipsis style={{ maxWidth: 200 }}>
            {title}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '语音状态',
      key: 'audio_status',
      width: 120,
      render: (_, question) => getAudioStatusTag(question),
    },
    {
      title: '时长',
      dataIndex: 'audio_duration',
      key: 'audio_duration',
      width: 80,
      render: (duration: number | null) => 
        duration ? `${Math.round(duration)}秒` : '-',
    },
    {
      title: '播放',
      key: 'play',
      width: 200,
      render: (_, question) => {
        // 构建正确的音频URL
        const audioUrl = question.audioAccessible && question.audio_status === 'ready' 
          ? audioApi.getPreviewUrl(question.id)
          : null;
          
        return (
          <AudioFilePlayer
            audioUrl={audioUrl}
            audioStatus={question.audio_status}
            size="small"
            showProgress={false}
            showControls={true}
          />
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, question) => {
        const menuItems: MenuProps['items'] = [
          {
            key: 'regenerate',
            icon: <ReloadOutlined />,
            label: '重新生成',
            onClick: () => handleGenerateQuestion(question.id),
          },
          {
            key: 'download',
            icon: <DownloadOutlined />,
            label: '下载文件',
            disabled: !question.audioAccessible,
            onClick: () => handleDownloadAudio(question.id, question.title),
          },
          {
            type: 'divider',
          },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: '删除语音',
            danger: true,
            disabled: question.audio_status === 'none',
            onClick: () => {
              Modal.confirm({
                title: '确认删除',
                content: `确定要删除题目"${question.title}"的语音文件吗？`,
                onOk: () => handleDeleteAudio(question.id),
              });
            },
          },
        ];

        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} size="small" />
          </Dropdown>
        );
      },
    },
  ];

  // 取消批量生成任务
  const handleCancelBatchGeneration = useCallback(() => {
    Modal.confirm({
      title: '确认取消任务',
      content: '确定要取消正在进行的语音生成任务吗？已生成的文件将保留。',
      onOk: () => {
        // 停止轮询
        stopProgressPolling();
        
        // 清理状态
        setBatchGenerating(false);
        setShowFullScreenLoading(false);
        resetProgressState();
        
        // 无需清理任务状态（已移除任务管理）
        
        message.warning('语音生成任务已取消');
      },
    });
  }, [stopProgressPolling, resetProgressState]);

  // 获取当前正在处理的题目标题
  const getCurrentQuestionTitle = useCallback((): string => {
    const questionIds = Object.keys(progressState.questions);
    const currentQuestionId = questionIds.find(id => 
      progressState.questions[id].status === 'progress' || 
      progressState.questions[id].status === 'start'
    );
    
    if (currentQuestionId) {
      return progressState.questions[currentQuestionId].title || '未知题目';
    }
    
    return '';
  }, [progressState.questions]);

  return (
    <div>
      {/* 语音管理头部 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 16,
        padding: '12px 0',
        borderBottom: '1px solid #f0f0f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text strong style={{ fontSize: 16 }}>语音文件管理</Text>
          <Tooltip
            title={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>创建或修改题目后，主动生成语音文件</li>
                <li>语音文件包含题目内容和选项内容</li>
                <li>生成失败的文件可以重新生成</li>
                <li>题目内容变化时，系统会提醒更新语音文件</li>
                <li>学生答题时会自动播放相应的语音文件</li>
              </ul>
            }
            placement="bottomLeft"
          >
            <QuestionCircleOutlined style={{ color: '#8c8c8c', cursor: 'help' }} />
          </Tooltip>
          
          {/* 轮询状态指示器 */}
          <Tooltip title="使用轮询机制获取进度更新">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 4,
              backgroundColor: '#f6ffed',
              border: '1px solid #b7eb8f',
              fontSize: 12
            }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#52c41a'
              }} />
              <span style={{ color: '#52c41a' }}>
                轮询模式
              </span>
            </div>
          </Tooltip>
        </div>
        
        <Space>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => handleBatchGenerate(false)}
            loading={batchGenerating}
            size="small"
          >
            批量生成语音
          </Button>
          
          <Button
            icon={<ReloadOutlined />}
            onClick={() => handleBatchGenerate(true)}
            loading={batchGenerating}
            size="small"
          >
            强制重新生成
          </Button>
          
          <Button
            icon={<ReloadOutlined />}
            onClick={async () => {
              try {
                await loadAudioStatusAndQuestions();
                message.success('状态刷新完成');
              } catch (error) {
                message.error('刷新失败，请重试');
              }
            }}
            loading={loading}
            size="small"
          >
            刷新状态
          </Button>

        </Space>
      </div>

      {/* 状态概览 - 扁平化设计 */}
      {audioStatus && (
        <div style={{ 
          marginBottom: 16,
          padding: '16px',
          background: '#fafafa',
          borderRadius: '6px',
          border: '1px solid #f0f0f0'
        }}>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="完成率"
                value={audioStatus.completionRate}
                suffix="%"
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="总时长"
                value={audioStatus.totalDuration}
                suffix="秒"
                prefix={<SoundOutlined style={{ color: '#1890ff' }} />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="平均时长"
                value={audioStatus.averageDuration}
                suffix="秒"
                precision={1}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="总题数"
                value={audioStatus.totalQuestions}
                prefix={<FileTextOutlined />}
              />
            </Col>
          </Row>
          
          <div style={{ marginTop: 16 }}>
            <Space wrap>
              <Tag color="green">已完成: {audioStatus.statusCount.ready}</Tag>
              <Tag color="blue">生成中: {audioStatus.statusCount.generating}</Tag>
              <Tag color="orange">需更新: {audioStatus.statusCount.needUpdate}</Tag>
              <Tag color="red">失败: {audioStatus.statusCount.error}</Tag>
              <Tag>无语音: {audioStatus.statusCount.none}</Tag>
            </Space>
          </div>
        </div>
      )}

      {/* 批量生成进度显示 */}
      {batchGenerating && (
        <div style={{ marginBottom: 16 }}>
          {/* 整体进度 */}
          <Alert
            message={
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>正在批量生成语音文件...</span>
                  <Space>
                    <Tag color="blue">轮询模式</Tag>
                    <Tag color="blue">
                      {progressState.overall.current}/{progressState.overall.total}
                    </Tag>
                  </Space>
                </div>
                {progressState.overall.total > 0 && (
                  <Progress
                    percent={progressState.overall.progress}
                    status={progressState.overall.status === 'error' ? 'exception' : 'active'}
                    strokeColor={{
                      '0%': '#108ee9',
                      '100%': '#87d068'
                    }}
                    format={(percent) => `${percent}% (${progressState.overall.current}/${progressState.overall.total})`}
                  />
                )}
              </div>
            }
            type={progressState.overall.status === 'error' ? 'error' : 'info'}
            showIcon
          />
          
          {/* 题目详细进度 */}
          {Object.keys(progressState.questions).length > 0 && (
            <div style={{
              marginTop: 12,
              padding: '12px',
              background: '#fafafa',
              borderRadius: '6px',
              border: '1px solid #f0f0f0',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              <Typography.Text strong style={{ fontSize: '12px', marginBottom: '8px', display: 'block' }}>
                题目进度详情:
              </Typography.Text>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {Object.entries(progressState.questions)
                  .sort(([, a], [, b]) => {
                    // 正在处理的题目排在前面
                    if (a.status === 'progress' && b.status !== 'progress') return -1;
                    if (b.status === 'progress' && a.status !== 'progress') return 1;
                    if (a.status === 'start' && b.status !== 'start') return -1;
                    if (b.status === 'start' && a.status !== 'start') return 1;
                    return 0;
                  })
                  .slice(0, 10) // 只显示前10个
                  .map(([questionId, questionProgress]) => (
                    <div key={questionId} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      padding: '4px 8px',
                      background: questionProgress.status === 'progress' ? '#e6f7ff' : 'transparent',
                      borderRadius: '4px'
                    }}>
                      <span style={{ 
                        flex: 1, 
                        marginRight: '8px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {questionProgress.title}
                      </span>
                      <Space size="small">
                        <Tag 
                          color={
                            questionProgress.status === 'completed' ? 'green' :
                            questionProgress.status === 'error' ? 'red' :
                            questionProgress.status === 'progress' ? 'blue' :
                            questionProgress.status === 'start' ? 'orange' :
                            'default'
                          }
                        >
                          {questionProgress.status === 'completed' ? '✅' :
                           questionProgress.status === 'error' ? '❌' :
                           questionProgress.status === 'progress' ? '⏳' :
                           questionProgress.status === 'start' ? '🎯' :
                           '⏸️'}
                        </Tag>
                        {questionProgress.status === 'progress' && (
                          <span style={{ minWidth: '30px' }}>
                            {questionProgress.progress}%
                          </span>
                        )}
                      </Space>
                    </div>
                  ))}
                {Object.keys(progressState.questions).length > 10 && (
                  <div style={{ textAlign: 'center', fontSize: '12px', color: '#999' }}>
                    还有 {Object.keys(progressState.questions).length - 10} 个题目...
                  </div>
                )}
              </Space>
            </div>
          )}
        </div>
      )}

      {/* 题目列表 - 直接展示 */}
      <Table
        columns={columns}
        dataSource={questionsWithAudio}
        rowKey="id"
        size="small"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 道题目`,
        }}
        loading={loading}
        rowSelection={{
          selectedRowKeys: selectedQuestions,
          onChange: (selectedRowKeys) => setSelectedQuestions(selectedRowKeys as string[]),
        }}
      />

      {/* 全屏加载组件 */}
      <FullScreenLoading
        visible={showFullScreenLoading}
        progress={progressState.overall.progress}
        currentTask={progressState.overall.status === 'running' ? '正在生成语音文件...' : progressState.overall.status}
        totalTasks={progressState.overall.total}
        completedTasks={progressState.overall.current}
        currentQuestionTitle={getCurrentQuestionTitle()}
        estimatedTimeRemaining={0}
        onCancel={handleCancelBatchGeneration}
        allowCancel={true}
      />
    </div>
  );
};

export default AudioManagementPanel;