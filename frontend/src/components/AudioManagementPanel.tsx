import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Button,
  Space,
  Typography,
  Table,
  Tooltip,
  Tag,
  message,
} from 'antd';
import {
  ReloadOutlined,
  ThunderboltOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import FullScreenLoading from './FullScreenLoading';
import AudioStatusOverview from './AudioStatusOverview';
import AudioProgressDisplay from './AudioProgressDisplay';
import { audioApi } from '../services/audioApi';
import { useAudioPollingService, type ProgressState } from '../services/audioPollingService';
import { useAudioProgressStream, type AudioProgressEvent } from '../services/audioProgressClient';
import { AudioBatchOperations, AudioSingleOperations } from '../services/audioOperations';
import { 
  createTableColumns, 
  createRowSelectionConfig, 
  DEFAULT_TABLE_CONFIG,
  type QuestionWithAudio 
} from './audioTableConfig';
import type { 
  Question, 
  PaperAudioStatus,
} from '../types';

const { Text } = Typography;

interface AudioManagementPanelProps {
  paperId: string;
  // 可选：不传则仅使用服务端返回的题目状态渲染
  questions?: Question[];
  onQuestionsUpdate?: () => void;
}


const AudioManagementPanel: React.FC<AudioManagementPanelProps> = ({
  paperId,
  questions = [],
  onQuestionsUpdate
}) => {
  // 基础状态
  const [audioStatus, setAudioStatus] = useState<PaperAudioStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [questionsWithAudio, setQuestionsWithAudio] = useState<QuestionWithAudio[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [progressState, setProgressState] = useState<ProgressState>({
    overall: { current: 0, total: 0, progress: 0, status: 'idle' },
    questions: {}
  });
  const [showFullScreenLoading, setShowFullScreenLoading] = useState(false);
  const [isUsingPolling, setIsUsingPolling] = useState(false);


  // 使用聚合接口加载音频状态和题目信息（需先定义，供下方服务初始化使用）
  const loadAudioStatusAndQuestions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await audioApi.getPaperAudioStatus(paperId);
      if (response.success && response.data) {
        const { questions: questionStatus, summary } = response.data;
        
        // 设置音频状态概览
        setAudioStatus({
          paperId: paperId,
          paperTitle: '', 
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
            pending: 0,
            needUpdate: summary.needUpdate
          }
        });
        
        // 合并服务端数据与当前题目信息；如无传入题目，则直接使用服务端返回的题目列表
        const updatedQuestions = (Array.isArray(questions) && questions.length > 0)
          ? questions.map(q => {
              const serverData = questionStatus?.find((qs: any) => qs.id === q.id) || {};
              return {
                ...q,
                audio_status: (serverData as any).audioStatus || 'none',
                audio_url: (serverData as any).audioUrl,
                audioAccessible: (serverData as any).audioAccessible || false,
                audio_duration: (serverData as any).duration,
                audio_needs_update: (serverData as any).needsUpdate || false
              } as QuestionWithAudio;
            })
          : (questionStatus || []).map((qs: any) => ({
              id: qs.id,
              title: qs.title || '未命名题目',
              question_order: qs.order || qs.question_order || 0,
              audio_status: qs.audioStatus || 'none',
              audio_url: qs.audioUrl,
              audioAccessible: qs.audioAccessible || false,
              audio_duration: qs.duration,
              audio_needs_update: qs.needsUpdate || false,
            } as QuestionWithAudio));

        setQuestionsWithAudio(updatedQuestions);
      }
    } catch (error) {
      console.error('加载音频状态失败:', error);
      message.error('加载音频状态失败');
    } finally {
      setLoading(false);
    }
  }, [paperId, questions]);

  // 初始化轮询服务和操作服务（在依赖的回调已定义后再初始化）
  const {
    startProgressPolling,
    stopProgressPolling,
    isPolling: isPollingActive,
    cleanup: cleanupPolling,
    createInitialProgressState
  } = useAudioPollingService(
    paperId,
    setProgressState,
    () => {
      loadAudioStatusAndQuestions();
    }
  );

  const stopStreamRef = useRef<() => void>(() => {});

  const handleProgressEvent = useCallback((event: AudioProgressEvent) => {
    if (!event || !event.type) {
      return;
    }

    if (event.type === 'connected') {
      return;
    }

    if (event.type === 'stage-update') {
      const stageLabels: Record<string, string> = {
        creating_tasks: '创建任务',
        waiting_completion: '等待完成',
        downloading: '下载文件',
        finalizing: '完成处理',
        completed: '已完成',
        error: '错误',
      };
      const stageStatus = stageLabels[event.stage as string] || event.stage || 'generating';
      setIsUsingPolling(false);
      setProgressState(prev => ({
        ...prev,
        overall: {
          current: event.completedTasks ?? prev.overall.current,
          total: event.totalTasks ?? prev.overall.total,
          progress: event.overallProgress ?? prev.overall.progress,
          status: stageStatus,
        },
      }));
      return;
    }

    if (event.type === 'batch-status') {
      const payload = event.payload || {};
      setIsUsingPolling(false);
      setProgressState(prev => ({
        ...prev,
        overall: {
          current: payload.completedTasks ?? prev.overall.current,
          total: payload.totalTasks ?? prev.overall.total,
          progress: payload.overallProgress ?? prev.overall.progress,
          status: prev.overall.status,
        },
      }));
      return;
    }

    if (event.type === 'batch-progress') {
      if (isPollingActive()) {
        stopProgressPolling();
        setIsUsingPolling(false);
      }
      const current = event.current ?? 0;
      const total = event.total ?? 0;
      setProgressState(prev => ({
        ...prev,
        overall: {
          current,
          total,
          progress: total > 0 ? Math.round((current / total) * 100) : prev.overall.progress,
          status: '生成中',
        },
      }));
      return;
    }

    if (event.type === 'question-progress' && event.questionId) {
      setProgressState(prev => ({
        overall: prev.overall,
        questions: {
          ...prev.questions,
          [event.questionId]: {
            title: event.questionTitle || prev.questions[event.questionId]?.title || '',
            status: event.status || prev.questions[event.questionId]?.status || 'pending',
            progress: typeof event.progress === 'number'
              ? event.progress
              : event.status === 'completed'
                ? 100
                : event.status === 'start'
                  ? 0
                  : prev.questions[event.questionId]?.progress ?? 0,
            error: event.error,
          },
        },
      }));
      return;
    }

    if (event.type === 'batch-completed') {
      stopStreamRef.current();
      stopProgressPolling();
      setIsUsingPolling(false);
      setProgressState(prev => ({
        overall: {
          current: event.result?.successCount ?? prev.overall.current,
          total: (event.result?.successCount ?? 0) + (event.result?.failedCount ?? 0) || prev.overall.total,
          progress: 100,
          status: '已完成',
        },
        questions: prev.questions,
      }));
      if (event.result?.errors?.length) {
        message.warning(`部分题目生成失败，共 ${event.result.errors.length} 项`);
      }
      loadAudioStatusAndQuestions();
      onQuestionsUpdate?.();
      setTimeout(() => {
        setProgressState(createInitialProgressState());
      }, 2000);
      return;
    }

    if (event.type === 'error') {
      stopStreamRef.current();
      stopProgressPolling();
      setIsUsingPolling(false);
      setProgressState(prev => ({
        ...prev,
        overall: {
          ...prev.overall,
          status: 'error',
        },
      }));
      message.error(event.message || '语音生成失败');
    }
  }, [createInitialProgressState, isPollingActive, loadAudioStatusAndQuestions, onQuestionsUpdate, setProgressState, stopProgressPolling]);

  const handleProgressError = useCallback((error: Event) => {
    console.warn('音频进度SSE错误，回退到轮询模式', error);
    if (!isPollingActive()) {
      startProgressPolling();
    }
    setIsUsingPolling(true);
  }, [isPollingActive, startProgressPolling]);

  const { start: startProgressStream, stop: stopProgressStream, isConnected: isSSEConnected } = useAudioProgressStream(
    paperId,
    handleProgressEvent,
    handleProgressError
  );
  stopStreamRef.current = stopProgressStream;

  const batchOperations = new AudioBatchOperations(
    paperId,
    loadAudioStatusAndQuestions,
    onQuestionsUpdate
  );
  
  const singleOperations = new AudioSingleOperations(
    loadAudioStatusAndQuestions,
    onQuestionsUpdate
  );

  // 操作处理函数
  const handleBatchGenerate = async (forceRegenerate: boolean = false) => {
    try {
      setBatchGenerating(true);
      setShowFullScreenLoading(true);
      setProgressState(createInitialProgressState());
      
      const sseStarted = startProgressStream();
      if (!sseStarted) {
        startProgressPolling();
        setIsUsingPolling(true);
      }

      await batchOperations.executeBatchGenerate(forceRegenerate);
    } catch (error) {
      setProgressState(prev => ({
        ...prev,
        overall: { ...prev.overall, status: 'error' }
      }));
      stopProgressStream();
      stopProgressPolling();
      setIsUsingPolling(false);
    } finally {
      setBatchGenerating(false);
      setShowFullScreenLoading(false);
    }
  };

  const handleCancelBatchGeneration = () => {
    stopProgressStream();
    stopProgressPolling();
    setIsUsingPolling(false);
    setBatchGenerating(false);
    setShowFullScreenLoading(false);
    setProgressState(createInitialProgressState());
    message.warning('语音生成任务已取消');
  };

  // 初始化加载
  useEffect(() => {
    if (paperId) {
      loadAudioStatusAndQuestions();
    }
  }, [paperId, loadAudioStatusAndQuestions]);

  // 清理轮询资源
  useEffect(() => {
    return () => {
      stopProgressStream();
      cleanupPolling();
      setIsUsingPolling(false);
    };
  }, [cleanupPolling, stopProgressStream]);

  // 防离开确认机制
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (batchGenerating) {
        const message = '语音生成正在进行中，离开页面将中断任务。确定要离开吗？';
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
    };

    if (batchGenerating) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [batchGenerating]);

  // 表格操作处理器
  const tableHandlers = {
    onRegenerate: (questionId: string) => singleOperations.generateQuestionAudio(questionId),
    onDownload: (questionId: string, title: string) => singleOperations.downloadQuestionAudio(questionId, title),
    onDelete: (questionId: string, title: string) => singleOperations.deleteQuestionAudio(questionId, title),
  };

  // 创建表格列配置
  const columns = createTableColumns(tableHandlers);
  const rowSelection = createRowSelectionConfig(selectedQuestions, setSelectedQuestions);

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

  const transportMode = isSSEConnected ? 'sse' : (isUsingPolling ? 'polling' : 'sse');

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
          
          <Tag color={transportMode === 'sse' ? 'green' : 'blue'}>
            {transportMode === 'sse' ? '实时推送' : '轮询模式'}
          </Tag>
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

      {/* 音频状态概览 */}
      <AudioStatusOverview 
        audioStatus={audioStatus}
        loading={loading}
      />

      {/* 批量生成进度显示 */}
      <AudioProgressDisplay
        isGenerating={batchGenerating}
        progressState={progressState}
        onCancel={handleCancelBatchGeneration}
        allowCancel={true}
        transportMode={transportMode}
      />

      {/* 题目列表表格 */}
      <Table
        {...DEFAULT_TABLE_CONFIG}
        columns={columns}
        dataSource={questionsWithAudio}
        loading={loading}
        rowSelection={rowSelection}
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
