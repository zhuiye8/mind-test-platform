import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Card, Row, Col, FloatButton, BackTop, Progress, Typography, Avatar, Spin, Button } from 'antd';
import {
  MenuOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { MediaStreamProvider } from '../contexts/MediaStreamContext';
import type { Question } from '../types';
import type { DeviceCheckResults } from '../components/DeviceCheck/types';
import { useTimelineRecorder } from '../utils/timelineRecorder';
import {
  ExamStateManager,
  QuestionNavigation,
  ExamSubmissionManager,
  QuestionRenderer,
  AIStatusPanel,
  useExamFlow,
  useAIWebRTC,
  type ExamInfo,
  type ParticipantInfo,
  type ExamStep,
  type ExamSubmissionManagerRef,
} from '../components/ParticipantExam';
import { gradientThemes, statusBarStyle, createTimerStyle } from '../components/ParticipantExam/ParticipantExam.styles';
import '../components/ParticipantExam/ParticipantExam.animations.css';

const ParticipantExamContent: React.FC = () => {
  const { examUuid } = useParams<{ examUuid: string }>();
  const location = useLocation();

  // 考试基础状态
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<ExamStep>('password');
  const [participantInfo, setParticipantInfo] = useState<ParticipantInfo | null>(null);

  // 设备检测结果
  const [deviceTestResults, setDeviceTestResults] = useState<DeviceCheckResults | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);

  // 时间线记录器
  const timelineRecorder = useTimelineRecorder();

  // 获取可见题目
  const getVisibleQuestions = useCallback((): Question[] => {
    if (!exam?.questions) return [];
    return exam.questions.filter(question => {
      if (!question.display_condition) return true;
      // 简化条件：默认显示
      return true;
    });
  }, [exam?.questions]);

  const visibleQuestions = getVisibleQuestions();

  // 离线提示与离开提醒
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // 推流初始化状态
  const [streamInitializing, setStreamInitializing] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [timeoutInvalid, setTimeoutInvalid] = useState(false);

  // 考试流程 Hook
  const {
    answers,
    setCurrentQuestionIndex,
    currentQuestionIndex,
    timeRemaining,
    examStartTime,
    showQuestionNav,
    setShowQuestionNav,
    questionTransition,
    startExam,
    handleAnswerChange,
    handleQuestionChange,
    stopTimer,
  } = useExamFlow(examUuid, visibleQuestions, timelineRecorder, () => {
    submissionManagerRef.current?.showSubmissionConfirm?.(true);
  }, participantInfo);

  // 已自动保存轻提示
  const [justSaved, setJustSaved] = useState(false);
  const onAnswerChangeWrapped = useCallback((questionId: string, value: any) => {
    handleAnswerChange(questionId, value);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
  }, [handleAnswerChange]);

  // AI 与 WebRTC Hook
  const {
    aiAvailable,
    aiConfigLoading,
    webrtcConnectionState,
    emotionAnalysis,
    heartRate,
    initAISession,
    disconnect,
  } = useAIWebRTC(timelineRecorder, currentQuestionIndex, aiEnabled);

  const submissionManagerRef = useRef<ExamSubmissionManagerRef>(null);
  const questionTopRef = useRef<HTMLDivElement | null>(null);

  // 开始考试：初始化 AI 并启动流程
  const handleExamStart = useCallback(async () => {
    if (!exam || !participantInfo) return;

    if (!aiEnabled) {
      startExam(exam.duration_minutes);
      timelineRecorder.recordEvent('exam_started', { mode: 'no_ai' });
      setStreamReady(true);
      return;
    }

    let started = false;
    try {
      setStreamInitializing(true);
      // 初始化AI会话和WebRTC推流
      await initAISession(examUuid!, participantInfo);
      setStreamReady(true);
      // 推流就绪后启动考试计时器
      startExam(exam.duration_minutes);
      started = true;
    } catch (error) {
      console.warn('AI session initialization failed, continuing in degraded mode:', error);
      // 即使推流失败，也允许用户答题（降级模式）
      startExam(exam.duration_minutes);
      started = true;
    } finally {
      setStreamInitializing(false);
      if (started) {
        timelineRecorder.recordEvent('exam_started', { mode: 'with_ai' });
      }
    }
  }, [aiEnabled, exam, participantInfo, examUuid, initAISession, startExam, timelineRecorder]);

  // 设备检测完成
  const handleDeviceTestComplete = useCallback((results: DeviceCheckResults) => {
    setDeviceTestResults(results);
    setAiEnabled(!results?.ai_opt_out);
    timelineRecorder.recordEvent('device_test_completed', {
      results,
      ai_enabled: !results?.ai_opt_out,
    });
  }, [timelineRecorder]);

  // 提交成功
  const handleSubmissionSuccess = useCallback(async (result: any) => {
    try {
      stopTimer();
      timelineRecorder.recordEvent('exam_submitted', {
        result,
        final_answers: answers,
      });
      await disconnect();
    } catch (error) {
      console.warn('Error during submission cleanup:', error);
    } finally {
      setCurrentStep('completed');
      setParticipantInfo(null);
      setDeviceTestResults(null);
      setTimeoutInvalid(false);
      setAiEnabled(true);
    }
  }, [answers, timelineRecorder, disconnect, stopTimer, setParticipantInfo]);

  const handleTimeoutInvalid = useCallback((details?: { validationErrors: string[] }) => {
    stopTimer();
    setTimeoutInvalid(true);
    timelineRecorder.recordEvent('exam_timeout_invalidated', {
      validation_errors: details?.validationErrors,
      answered_count: Object.keys(answers).length,
      total_questions: visibleQuestions.length,
    });
    disconnect().catch(error => {
      console.warn('Error disconnecting after timeout invalidation:', error);
    });
  }, [answers, visibleQuestions.length, timelineRecorder, disconnect, stopTimer]);

  // 页面关闭/刷新提醒（仅在考试进行中）
  useEffect(() => {
    if (currentStep !== 'exam') return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [currentStep]);

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

  // 切题滚动定位
  useEffect(() => {
    if (currentStep !== 'exam') return;
    if (questionTopRef.current) {
      questionTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // 适配固定头部的偏移
      window.setTimeout(() => window.scrollBy({ top: -90, behavior: 'auto' }), 200);
    }
  }, [currentQuestionIndex, currentStep]);

  // 未进入考试主界面
  if (currentStep !== 'exam') {
    return (
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
          onDeviceTestComplete={handleDeviceTestComplete}
        />
    );
  }

  const currentQuestion = visibleQuestions[currentQuestionIndex];

  // 进度与时间格式化
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

  const aiStatusLabel = !aiEnabled
    ? 'AI状态: 已跳过'
    : aiConfigLoading
    ? 'AI状态: 检测中…'
    : aiAvailable
    ? 'AI状态: 可用'
    : 'AI状态: 服务异常';

  const aiStatusVisual = !aiEnabled
    ? { bg: 'rgba(156,163,175,0.2)', color: '#4b5563' }
    : aiConfigLoading
    ? { bg: 'rgba(245, 158, 11, 0.12)', color: '#92400e' }
    : aiAvailable
    ? { bg: 'rgba(16,185,129,0.12)', color: '#065f46' }
    : { bg: 'rgba(248,113,113,0.15)', color: '#991b1b' };

  return (
    <div style={{ minHeight: '100vh', background: gradientThemes.exam }}>
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
          onTimeoutInvalid={handleTimeoutInvalid}
        />
      )}

      {/* 推流初始化Loading遮罩 */}
      {streamInitializing && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255, 255, 255, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)'
        }}>
          <Spin 
            size="large" 
            indicator={<LoadingOutlined style={{ fontSize: 48, color: '#4F46E5' }} spin />}
          />
          <div style={{ 
            marginTop: 24, 
            textAlign: 'center',
            maxWidth: 400,
            padding: '0 20px'
          }}>
            <Typography.Title level={4} style={{ color: '#4F46E5', marginBottom: 8 }}>
              正在连接考试系统
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 16 }}>
              正在建立视频分析连接，请稍候...
            </Typography.Text>
            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              background: 'rgba(79, 70, 229, 0.1)', 
              borderRadius: 8,
              fontSize: 14,
              color: '#6B7280'
            }}>
              💡 系统正在为您启动AI心理分析功能，这将帮助更好地了解您的答题状态
            </div>
          </div>
        </div>
      )}

      {/* 顶部状态栏 */}
      <div style={statusBarStyle}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Avatar
              style={{
                background: 'linear-gradient(135deg, #4F46E5, #10B981)',
                marginRight: 12,
              }}
              icon={<EyeOutlined />}
            />
            <div>
              <Typography.Text strong style={{ fontSize: 16, display: 'block' }}>
                {exam?.title || '考试'}
              </Typography.Text>
              {participantInfo && (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {participantInfo.participantName} · {participantInfo.participantId}
                </Typography.Text>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                background: aiStatusVisual.bg,
                color: aiStatusVisual.color,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {aiStatusLabel}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 120 }}>
                <Progress
                  percent={progressPercent}
                  size="small"
                  showInfo={false}
                  strokeColor={{ '0%': '#4F46E5', '100%': '#10B981' }}
                  style={{ marginBottom: 4 }}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  题目 {currentQuestionIndex + 1} / {visibleQuestions.length}
                </Typography.Text>
              </div>
              <div style={{ ...createTimerStyle(timeRemaining) }}>
                {formatTime(timeRemaining)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 离线提示 */}
      {isOffline && (
        <div style={{
          position: 'fixed', top: 64, left: 0, right: 0, zIndex: 1000,
          background: 'rgba(255, 243, 205, 0.95)', borderBottom: '1px solid #F59E0B', color: '#92400e',
          textAlign: 'center', padding: '8px 12px', fontSize: 12
        }}>
          网络连接异常，答案已本地保存，将自动重试提交。
        </div>
      )}

      <div
        style={{
          paddingTop: isOffline ? 132 : 100,
          paddingBottom: 40,
          minHeight: '100vh',
        }}
      >
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px' }}>
          <Row gutter={[24, 24]}>
            {/* 题目区域 */}
            <Col xs={24} lg={16}>
              <div
                style={{
                  transition: 'opacity 0.3s ease',
                  opacity: questionTransition ? 0.5 : 1,
                  animation: questionTransition ? 'none' : 'questionSlide 0.3s ease-out',
                  pointerEvents: streamInitializing ? 'none' : 'auto', // 推流初始化时禁用交互
                  filter: streamInitializing ? 'grayscale(0.3)' : 'none', // 推流初始化时显示视觉提示
                }}
              >
                <div ref={questionTopRef} />
                {currentQuestion ? (
                  <QuestionRenderer
                    question={currentQuestion}
                    questionIndex={currentQuestionIndex}
                    totalQuestions={visibleQuestions.length}
                    answer={answers[currentQuestion.id]}
                    onAnswerChange={onAnswerChangeWrapped}
                    showAudioPlayer={true}
                    timelineRecorder={timelineRecorder}
                    disabled={streamInitializing} // 传递禁用状态
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
              <div style={{
                pointerEvents: streamInitializing ? 'none' : 'auto', // 推流初始化时禁用交互
                filter: streamInitializing ? 'grayscale(0.3)' : 'none', // 推流初始化时显示视觉提示
              }}>
                <AIStatusPanel
                  aiEnabled={aiEnabled}
                  aiAvailable={aiAvailable}
                  aiConfigLoading={aiConfigLoading}
                  webrtcConnectionState={webrtcConnectionState}
                  emotionAnalysis={emotionAnalysis}
                  heartRate={heartRate}
                />

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
                  onSubmitExam={() => submissionManagerRef.current?.showSubmissionConfirm?.(false)}
                  justSaved={justSaved}
                />
              </div>
            </Col>
          </Row>
        </div>
      </div>

      {/* 浮动按钮 */}
      <FloatButton.Group trigger="click" type="primary" icon={<MenuOutlined />} tooltip="快捷操作">
        <FloatButton
          icon={<ClockCircleOutlined />}
          tooltip="显示/隐藏题目导航"
          onClick={() => setShowQuestionNav(!showQuestionNav)}
        />
        <FloatButton icon={<BulbOutlined />} tooltip="考试说明" onClick={() => {}} />
      </FloatButton.Group>

      {/* 回到顶部 */}
      <BackTop />

      {timeoutInvalid && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(17, 24, 39, 0.78)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Card
            style={{
              maxWidth: 420,
              width: '100%',
              textAlign: 'center',
              borderRadius: 16,
            }}
          >
            <Typography.Title level={3} style={{ marginBottom: 12 }}>
              本次考试已作废
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
              因存在未完成的必答题，本次作答记录无效。请联系监考老师重新预约考试。
            </Typography.Paragraph>
            <Button type="primary" block size="large" onClick={() => window.location.reload()}>
              重新进入考试
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};

const ParticipantExam: React.FC = () => {
  return (
    <MediaStreamProvider>
      <ParticipantExamContent />
    </MediaStreamProvider>
  );
};

export default ParticipantExam;
