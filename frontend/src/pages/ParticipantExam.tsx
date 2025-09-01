import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Card, Row, Col, FloatButton, BackTop, Button, Progress, Typography, Avatar, Space } from 'antd';
import { 
  SendOutlined, 
  MenuOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  EyeOutlined
} from '@ant-design/icons';
import type { Question } from '../types';
import { useTimelineRecorder } from '../utils/timelineRecorder';
import aiSessionWebRTC from '../services/aiSessionWebRTC';
import { publicApi } from '../services/api';

// 导入拆分的子组件
import {
  ExamStateManager,
  QuestionNavigation,
  ExamSubmissionManager,
  QuestionRenderer,
  type ExamInfo,
  type ParticipantInfo,
  type ExamStep
} from '../components/ParticipantExam';
import { gradientThemes, statusBarStyle, createTimerStyle } from '../components/ParticipantExam/ParticipantExam.styles';
import '../components/ParticipantExam/ParticipantExam.animations.css';

const ParticipantExam: React.FC = () => {
  const { examUuid } = useParams<{ examUuid: string }>();
  const location = useLocation();
  
  // 考试基础状态
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<ExamStep>('password');
  const [participantInfo, setParticipantInfo] = useState<ParticipantInfo | null>(null);
  
  // 答题状态
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [examStartTime, setExamStartTime] = useState<Date | null>(null);
  
  // UI状态
  const [showQuestionNav, setShowQuestionNav] = useState(false);
  const [questionTransition, setQuestionTransition] = useState(false);
  
  // AI和媒体状态
  const [deviceTestResults, setDeviceTestResults] = useState<any>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [aiConfigLoading, setAiConfigLoading] = useState<boolean>(false);
  
  // WebRTC状态
  const [webrtcConnectionState, setWebrtcConnectionState] = useState<any>(null);
  const [emotionAnalysis, setEmotionAnalysis] = useState<any>(null);
  const [heartRate, setHeartRate] = useState<number>(0);
  
  // 时间线记录器
  const timelineRecorder = useTimelineRecorder();
  
  // 定时器引用
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submissionManagerRef = useRef<any>(null);

  // 预取AI服务可用性（用于UI提示与预期管理）
  useEffect(() => {
    let mounted = true;
    const loadAIConfig = async () => {
      try {
        setAiConfigLoading(true);
        const res = await publicApi.getAIServiceConfig();
        if (!mounted) return;
        if (res.success && res.data) {
          setAiAvailable(!!res.data.available);
        } else {
          setAiAvailable(false);
        }
      } catch {
        if (mounted) setAiAvailable(false);
      } finally {
        if (mounted) setAiConfigLoading(false);
      }
    };
    loadAIConfig();
    return () => { mounted = false; };
  }, []);

  // 获取可见题目列表
  const getVisibleQuestions = useCallback((): Question[] => {
    if (!exam?.questions) return [];
    
    return exam.questions.filter(question => {
      // 如果没有显示条件，直接显示
      if (!question.display_condition) return true;
      
      // 这里应该实现条件逻辑判断
      // 简化版本：总是返回true
      return true;
    });
  }, [exam?.questions]);

  const visibleQuestions = getVisibleQuestions();

  // 进度与时间格式
  const progressPercent = visibleQuestions.length > 0 
    ? Math.min(100, Math.round(((currentQuestionIndex + 1) / visibleQuestions.length) * 100)) 
    : 0;
  const formatTime = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    const mm = m.toString().padStart(2, '0');
    const ss = r.toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  // 开始考试
  const handleExamStart = useCallback(async () => {
    if (!exam || !participantInfo) return;

    setExamStartTime(new Date());
    setTimeRemaining(exam.duration_minutes * 60);
    
    // 记录第一题显示事件
    if (visibleQuestions.length > 0) {
      timelineRecorder.recordQuestionDisplay(visibleQuestions[0].id);
    }

    // 初始化AI会话和WebRTC连接
    try {
      // 先调用publicApi.createAISession获取aiSessionId
      const aiSessionResult = await publicApi.createAISession(examUuid!, {
        participant_id: participantInfo.participantId,
        participant_name: participantInfo.participantName,
        started_at: new Date().toISOString()
      });
      
      if (aiSessionResult.success && aiSessionResult.data?.aiSessionId) {
        // 使用服务器返回的aiSessionId初始化WebRTC
        await aiSessionWebRTC.initialize(
          {
            sessionId: aiSessionResult.data.aiSessionId,
            examId: examUuid,
            examResultId: aiSessionResult.data.examResultId,
            candidateId: participantInfo.participantId,
          },
          {
            iceServers: [], // Host-only模式
            audio: true,
            video: true,
          },
          {
            onConnectionStateChange: handleWebRTCConnectionChange,
            onError: handleWebRTCError,
          }
        );
        
        console.log('AI session and WebRTC initialized successfully with sessionId:', aiSessionResult.data.aiSessionId);
      } else {
        console.warn('AI session creation failed, continuing without AI analysis:', aiSessionResult.error);
      }
    } catch (error) {
      console.warn('AI session initialization failed, continuing in degraded mode:', error);
      // 继续考试，但不进行AI分析
    }

    // 启动计时器
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // 时间到，自动提交
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [exam, examUuid, visibleQuestions.length, timelineRecorder, participantInfo]);

  // 时间到处理
  const handleTimeUp = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // 触发自动提交
    submissionManagerRef.current?.showSubmissionConfirm?.(true);
  }, []);

  // 答案变化处理
  const handleAnswerChange = useCallback((questionId: string, value: any) => {
    setAnswers(prev => {
      const previousAnswer = prev[questionId];
      const newAnswers = { ...prev, [questionId]: value };
      
      // 自动保存到localStorage
      if (examUuid) {
        localStorage.setItem(`exam_answers_${examUuid}`, JSON.stringify(newAnswers));
      }
      
      // 记录答题事件 - 区分首次选择和修改
      if (previousAnswer === undefined || previousAnswer === null || previousAnswer === '') {
        // 首次选择
        timelineRecorder.recordOptionSelect(questionId, String(value), 'click');
      } else {
        // 修改答案
        timelineRecorder.recordOptionChange(questionId, String(previousAnswer), String(value), 'click');
      }
      
      return newAnswers;
    });
  }, [examUuid, currentQuestionIndex, timelineRecorder]);

  // 题目切换处理
  const handleQuestionChange = useCallback((newIndex: number) => {
    const fromQuestion = visibleQuestions[currentQuestionIndex];
    const toQuestion = visibleQuestions[newIndex];
    
    setQuestionTransition(true);
    
    // 记录题目导航事件
    if (fromQuestion && toQuestion) {
      timelineRecorder.recordQuestionNavigation(fromQuestion.id, toQuestion.id);
    }
    
    setTimeout(() => {
      setCurrentQuestionIndex(newIndex);
      setQuestionTransition(false);
      
      // 记录新题目显示事件
      if (toQuestion) {
        timelineRecorder.recordQuestionDisplay(toQuestion.id);
      }
    }, 150);
  }, [currentQuestionIndex, visibleQuestions, timelineRecorder]);

  // 设备测试完成处理
  const handleDeviceTestComplete = useCallback((results: any) => {
    setDeviceTestResults(results);
    // 记录事件
    timelineRecorder.recordEvent('device_test_completed', { results });
    // 跳转下一步：有描述则进入说明，否则直接开始考试
    if (exam?.description) {
      setCurrentStep('description');
    } else {
      setCurrentStep('exam');
      // 直接启动考试（计时/WebRTC等）
      handleExamStart();
    }
  }, [timelineRecorder, exam, handleExamStart]);


  // 考试提交成功处理
  const handleSubmissionSuccess = useCallback(async (result: any) => {
    try {
      // 停止计时器
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // 考试提交不是答题行为，保留旧的记录方式用于兼容
      timelineRecorder.recordEvent('exam_submitted', {
        result,
        final_answers: answers
      });
      
      // 断开WebRTC连接
      await aiSessionWebRTC.disconnect();
      console.log('WebRTC disconnected after submission');
      
    } catch (error) {
      console.warn('Error during submission cleanup:', error);
    } finally {
      setCurrentStep('completed');
    }
  }, [answers, timelineRecorder]);

  // WebRTC 事件处理器
  const handleEmotionAnalysis = useCallback((result: any) => {
    setEmotionAnalysis(result);
    // AI分析结果不是答题行为，保留旧的记录方式
    timelineRecorder.recordEvent('emotion_analysis_received', {
      result,
      question_index: currentQuestionIndex
    });
  }, [timelineRecorder, currentQuestionIndex]);

  const handleHeartRateDetected = useCallback((rate: number) => {
    setHeartRate(rate);
    // 心率检测不是答题行为，保留旧的记录方式
    timelineRecorder.recordEvent('heart_rate_detected', {
      rate,
      question_index: currentQuestionIndex
    });
  }, [timelineRecorder, currentQuestionIndex]);

  // 页面卸载时断开WebRTC连接（兜底处理）
  useEffect(() => {
    const handlePageUnload = () => {
      aiSessionWebRTC.disconnect().catch(console.error);
    };

    const handleBeforeUnload = () => {
      aiSessionWebRTC.disconnect().catch(console.error);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageUnload);
    };
  }, []);

  const handleWebRTCConnectionChange = useCallback((state: any) => {
    setWebrtcConnectionState(state);
    // WebRTC连接状态不是答题行为，保留旧的记录方式
    timelineRecorder.recordEvent('webrtc_connection_changed', {
      state,
      status: state.status
    });
    
    // 更新UI显示
    console.log('WebRTC connection state changed:', state);
  }, [timelineRecorder]);

  const handleWebRTCError = useCallback((error: Error) => {
    console.error('WebRTC错误:', error);
    // WebRTC错误不是答题行为，保留旧的记录方式
    timelineRecorder.recordEvent('webrtc_error', {
      error: error.message,
      stack: error.stack
    });
  }, [timelineRecorder]);

  // 恢复答案数据
  useEffect(() => {
    if (examUuid && currentStep === 'exam') {
      const savedAnswers = localStorage.getItem(`exam_answers_${examUuid}`);
      if (savedAnswers) {
        try {
          setAnswers(JSON.parse(savedAnswers));
        } catch (error) {
          console.error('恢复答案数据失败:', error);
        }
      }
    }
  }, [examUuid, currentStep]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (currentStep !== 'exam' || visibleQuestions.length === 0) return;

      switch (event.key) {
        case 'ArrowLeft':
          if (currentQuestionIndex > 0) {
            event.preventDefault();
            handleQuestionChange(currentQuestionIndex - 1);
          }
          break;
        case 'ArrowRight':
          if (currentQuestionIndex < visibleQuestions.length - 1) {
            event.preventDefault();
            handleQuestionChange(currentQuestionIndex + 1);
          }
          break;
        case 'Enter':
          if (event.ctrlKey) {
            event.preventDefault();
            submissionManagerRef.current?.showSubmissionConfirm?.(false);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, currentQuestionIndex, visibleQuestions.length, handleQuestionChange]);

  // 清理资源和页面卸载处理
  useEffect(() => {
    const cleanup = async () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      // 断开WebRTC连接（尽力而为）
      try {
        await aiSessionWebRTC.disconnect();
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
    };
    
    // 页面卸载事件监听
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // 同步断开连接（异步操作在beforeunload中不可靠）
      aiSessionWebRTC.disconnect();
    };
    
    const handlePageHide = () => {
      // pagehide事件更可靠
      aiSessionWebRTC.disconnect();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    
    return () => {
      cleanup();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  // 如果正在加载或者不在考试步骤，显示状态管理组件
  if (currentStep !== 'exam') {
    return (
      <>
        <ExamStateManager
          currentStep={currentStep}
          setCurrentStep={setCurrentStep}
          exam={exam}
          setExam={setExam}
          participantInfo={participantInfo}
          setParticipantInfo={setParticipantInfo}
          loading={loading}
          setLoading={setLoading}
          onExamStart={handleExamStart}
          // 将设备检测结果上报至父组件，便于提交时附带
          onDeviceTestComplete={(results) => setDeviceTestResults(results)}
        />
        
        {/* 设备测试组件 */}
        {/* 设备检测已内嵌到信息页，此处不再单独覆盖显示 */}
      </>
    );
  }

  // 考试进行中的主界面
  const currentQuestion = visibleQuestions[currentQuestionIndex];

  return (
    <div style={{
      minHeight: '100vh',
      background: gradientThemes.exam
    }}>


      {/* 考试提交管理器 */}
      {examUuid && participantInfo && (
        <ExamSubmissionManager
          ref={submissionManagerRef}
          examUuid={examUuid}
          participantInfo={participantInfo}
          answers={answers}
          questions={visibleQuestions}
          examStartTime={examStartTime}
          deviceTestResults={deviceTestResults}
          timelineData={timelineRecorder.getTimeline()}
          onSubmissionSuccess={handleSubmissionSuccess}
        />
      )}
      {/* 顶部状态栏（固定） - 毛玻璃效果 */}
      <div style={statusBarStyle}>
        <div style={{ 
          maxWidth: 1200, 
          margin: '0 auto',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Avatar 
              style={{ 
                background: 'linear-gradient(135deg, #4F46E5, #10B981)',
                marginRight: 12
              }}
              icon={<EyeOutlined />}
            />
            <div>
              <Typography.Text strong style={{ fontSize: 16, display: 'block' }}>{exam?.title || '考试'}</Typography.Text>
              {participantInfo && (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {participantInfo.participantName} · {participantInfo.participantId}
                </Typography.Text>
              )}
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* AI可用性提示 */}
            <div style={{
              padding: '2px 8px',
              borderRadius: 999,
              background: aiAvailable ? 'rgba(16,185,129,0.12)' : 'rgba(156,163,175,0.2)',
              color: aiAvailable ? '#065f46' : '#374151',
              fontSize: 12,
              fontWeight: 600
            }}>
              {aiConfigLoading ? 'AI状态: 检测中…' : aiAvailable ? 'AI状态: 可用' : 'AI状态: 未启用'}
            </div>
            {/* 进度指示器 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 120 }}>
                <Progress 
                  percent={progressPercent} 
                  size="small"
                  showInfo={false}
                  strokeColor={{ 
                    '0%': '#4F46E5', 
                    '100%': '#10B981' 
                  }}
                  style={{ marginBottom: 4 }}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  题目 {currentQuestionIndex + 1} / {visibleQuestions.length}
                </Typography.Text>
              </div>
            </div>
            
            {/* 计时器 */}
            <div style={createTimerStyle(timeRemaining)}>
              <ClockCircleOutlined style={{ 
                color: timeRemaining < 300 ? '#EF4444' : '#4F46E5',
                fontSize: 16
              }} />
              <Typography.Text strong style={{ 
                color: timeRemaining < 300 ? '#EF4444' : '#4F46E5',
                fontSize: 16,
                fontFamily: 'monospace'
              }}>
                {formatTime(timeRemaining)}
              </Typography.Text>
            </div>
            
            {/* 提交按钮 */}
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => submissionManagerRef.current?.showSubmissionConfirm?.(false)}
              style={{
                borderRadius: 12,
                height: 44,
                background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
              }}
            >
              提交考试
            </Button>
          </div>
        </div>
      </div>

      <div style={{ 
        paddingTop: 100,
        paddingBottom: 40,
        minHeight: '100vh'
      }}>
        <div style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '0 24px'
        }}>
        <Row gutter={[24, 24]}>
          {/* 题目区域 */}
          <Col xs={24} lg={16}>
            <div style={{ 
              transition: 'opacity 0.3s ease',
              opacity: questionTransition ? 0.5 : 1,
              animation: questionTransition ? 'none' : 'questionSlide 0.3s ease-out'
            }}>
              {currentQuestion ? (
                <QuestionRenderer
                  question={currentQuestion}
                  questionIndex={currentQuestionIndex}
                  totalQuestions={visibleQuestions.length}
                  answer={answers[currentQuestion.id]}
                  onAnswerChange={handleAnswerChange}
                  showAudioPlayer={true}
                  showVoiceInteraction={true}
                  timelineRecorder={timelineRecorder}
                />
              ) : (
                <Card>
                  <div style={{ textAlign: 'center', padding: '48px 0' }}>
                    <Typography.Text>没有可显示的题目</Typography.Text>
                  </div>
                </Card>
              )}
            </div>
          </Col>

          {/* 导航区域 */}
          <Col xs={24} lg={8}>
            {/* AI监测状态指示器 */}
            {currentStep === 'exam' && (
              <Card 
                style={{ 
                  marginBottom: 16,
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: 16
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography.Text strong style={{ fontSize: 14 }}>AI监测状态</Typography.Text>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 500,
                      background: webrtcConnectionState?.status === 'connected' 
                        ? '#f0f9ff' 
                        : webrtcConnectionState?.status === 'connecting'
                        ? '#fef3c7'
                        : '#f3f4f6',
                      color: webrtcConnectionState?.status === 'connected' 
                        ? '#1e40af' 
                        : webrtcConnectionState?.status === 'connecting'
                        ? '#92400e'
                        : '#6b7280'
                    }}>
                      {webrtcConnectionState?.status === 'connected' && '已连接'}
                      {webrtcConnectionState?.status === 'connecting' && '连接中'}
                      {webrtcConnectionState?.status === 'failed' && '连接失败'}
                      {!webrtcConnectionState?.status && '未连接'}
                    </span>
                  </div>
                  
                  {!aiAvailable && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      AI服务未启用，本次不进行实时分析
                    </Typography.Text>
                  )}

                  {emotionAnalysis && (
                    <div style={{ fontSize: 13 }}>
                      <Typography.Text type="secondary">情绪状态:</Typography.Text>
                      <Typography.Text strong style={{ marginLeft: 8 }}>
                        {typeof emotionAnalysis === 'string' ? emotionAnalysis : '分析中...'}
                      </Typography.Text>
                    </div>
                  )}
                  
                  {heartRate > 0 && (
                    <div style={{ fontSize: 13 }}>
                      <Typography.Text type="secondary">心率:</Typography.Text>
                      <Typography.Text strong style={{ marginLeft: 8, color: '#dc2626' }}>
                        {heartRate} BPM
                      </Typography.Text>
                    </div>
                  )}
                </Space>
              </Card>
            )}
            
            <QuestionNavigation
              questions={visibleQuestions}
              currentQuestionIndex={currentQuestionIndex}
              setCurrentQuestionIndex={setCurrentQuestionIndex}
              answers={answers}
              timeRemaining={timeRemaining}
              examDurationMinutes={exam?.duration_minutes || 0}
              showQuestionNav={showQuestionNav}
              setShowQuestionNav={setShowQuestionNav}
              onQuestionChange={handleQuestionChange}
            />
          </Col>
        </Row>
        </div>
      </div>

      {/* 浮动按钮 */}
      <FloatButton.Group 
        trigger="click" 
        type="primary"
        icon={<MenuOutlined />}
        tooltip="快捷操作"
      >
        <FloatButton
          icon={<SendOutlined />}
          tooltip="提交考试 (Ctrl+Enter)"
          onClick={() => submissionManagerRef.current?.showSubmissionConfirm?.(false)}
        />
        <FloatButton
          icon={<ClockCircleOutlined />}
          tooltip="显示/隐藏题目导航"
          onClick={() => setShowQuestionNav(!showQuestionNav)}
        />
        <FloatButton
          icon={<BulbOutlined />}
          tooltip="考试说明"
          onClick={() => {
            // 显示考试说明
          }}
        />
      </FloatButton.Group>

      {/* 回到顶部 */}
      <BackTop />
    </div>
  );
};

export default ParticipantExam;
