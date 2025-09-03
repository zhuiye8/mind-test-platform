import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Card, Row, Col, FloatButton, BackTop, Progress, Typography, Avatar } from 'antd';
import {
  SendOutlined,
  MenuOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { Question } from '../types';
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

  // 设备检测结果
  const [deviceTestResults, setDeviceTestResults] = useState<any>(null);

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
  });

  // AI 与 WebRTC Hook
  const {
    aiAvailable,
    aiConfigLoading,
    webrtcConnectionState,
    emotionAnalysis,
    heartRate,
    initAISession,
    disconnect,
  } = useAIWebRTC(timelineRecorder, currentQuestionIndex);

  const submissionManagerRef = useRef<any>(null);

  // 开始考试：初始化 AI 并启动流程
  const handleExamStart = useCallback(async () => {
    if (!exam || !participantInfo) return;
    await initAISession(examUuid!, participantInfo);
    startExam(exam.duration_minutes);
  }, [exam, participantInfo, examUuid, initAISession, startExam]);

  // 设备检测完成
  const handleDeviceTestComplete = useCallback((results: any) => {
    setDeviceTestResults(results);
    timelineRecorder.recordEvent('device_test_completed', { results });
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
    }
  }, [answers, timelineRecorder, disconnect, stopTimer]);

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

  // 未进入考试主界面
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
          onDeviceTestComplete={handleDeviceTestComplete}
        />
      </>
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
        />
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
                background: aiAvailable ? 'rgba(16,185,129,0.12)' : 'rgba(156,163,175,0.2)',
                color: aiAvailable ? '#065f46' : '#374151',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {aiConfigLoading ? 'AI状态: 检测中…' : aiAvailable ? 'AI状态: 可用' : 'AI状态: 未启用'}
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

      <div
        style={{
          paddingTop: 100,
          paddingBottom: 40,
          minHeight: '100vh',
        }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px' }}>
          <Row gutter={[24, 24]}>
            {/* 题目区域 */}
            <Col xs={24} lg={16}>
              <div
                style={{
                  transition: 'opacity 0.3s ease',
                  opacity: questionTransition ? 0.5 : 1,
                  animation: questionTransition ? 'none' : 'questionSlide 0.3s ease-out',
                }}
              >
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
              <AIStatusPanel
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
              />
            </Col>
          </Row>
        </div>
      </div>

      {/* 浮动按钮 */}
      <FloatButton.Group trigger="click" type="primary" icon={<MenuOutlined />} tooltip="快捷操作">
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
        <FloatButton icon={<BulbOutlined />} tooltip="考试说明" onClick={() => {}} />
      </FloatButton.Group>

      {/* 回到顶部 */}
      <BackTop />
    </div>
  );
};

export default ParticipantExam;
