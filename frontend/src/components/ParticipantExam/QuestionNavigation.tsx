import React, { useCallback, useMemo } from 'react';
import { Card, Button, Space, Typography, Progress, Badge, Tag, Tooltip, Row, Col, Alert } from 'antd';
import { 
  ArrowLeftOutlined, 
  ArrowRightOutlined, 
  CheckCircleOutlined, 
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MenuOutlined,
  SendOutlined
} from '@ant-design/icons';
import type { Question } from '../../types';
import { cardStyles, buttonStyles } from './ParticipantExam.styles';
import { validateRequiredQuestions } from '../../utils/validation';

const { Title, Text } = Typography;

interface QuestionNavigationProps {
  questions: Question[];
  currentQuestionIndex: number;
  setCurrentQuestionIndex: (index: number) => void;
  answers: Record<string, any>;
  timeRemaining: number;
  examDurationMinutes: number;
  showQuestionNav: boolean;
  setShowQuestionNav: (show: boolean) => void;
  onQuestionChange?: (newIndex: number) => void;
  onSubmitExam?: () => void;
  justSaved?: boolean;
}

const QuestionNavigation: React.FC<QuestionNavigationProps> = ({
  questions,
  currentQuestionIndex,
  setCurrentQuestionIndex,
  answers,
  timeRemaining,
  examDurationMinutes,
  showQuestionNav,
  setShowQuestionNav,
  onQuestionChange,
  onSubmitExam
}) => {
  // 计算答题进度
  const progress = useMemo(() => {
    const answeredCount = Object.keys(answers).length;
    return Math.round((answeredCount / questions.length) * 100);
  }, [answers, questions.length]);

  // 计算时间进度
  const timeProgress = useMemo(() => {
    const totalSeconds = examDurationMinutes * 60;
    const elapsedSeconds = totalSeconds - timeRemaining;
    return Math.round((elapsedSeconds / totalSeconds) * 100);
  }, [timeRemaining, examDurationMinutes]);

  // 格式化时间显示
  const formatTime = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // 题目跳转处理
  const handleQuestionChange = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < questions.length) {
      setCurrentQuestionIndex(newIndex);
      onQuestionChange?.(newIndex);
    }
  }, [questions.length, setCurrentQuestionIndex, onQuestionChange]);

  // 上一题
  const handlePreviousQuestion = useCallback(() => {
    if (currentQuestionIndex > 0) {
      handleQuestionChange(currentQuestionIndex - 1);
    }
  }, [currentQuestionIndex, handleQuestionChange]);

  // 下一题
  const handleNextQuestion = useCallback(() => {
    if (currentQuestionIndex < questions.length - 1) {
      handleQuestionChange(currentQuestionIndex + 1);
    }
  }, [currentQuestionIndex, questions.length, handleQuestionChange]);

  // 获取题目状态
  const getQuestionStatus = useCallback((questionId: string) => {
    return answers[questionId] ? 'answered' : 'unanswered';
  }, [answers]);

  // 计算提交按钮状态
  const submitButtonState = useMemo(() => {
    const isLastQuestion = currentQuestionIndex === questions.length - 1;
    const currentQuestion = questions[currentQuestionIndex];
    const currentAnswered = currentQuestion ? !!answers[currentQuestion.id] : false;
    const validation = validateRequiredQuestions(questions, answers);
    const timeUrgent = timeRemaining < (examDurationMinutes * 0.1 * 60); // 剩余10%时间
    
    // 显示条件：
    // 1. 最后一题且已回答
    // 2. 或者时间紧急且有答案
    const shouldShow = (isLastQuestion && currentAnswered) || (timeUrgent && Object.keys(answers).length > 0);
    
    return {
      show: shouldShow,
      canSubmit: validation.isValid,
      urgent: timeUrgent,
      missingRequired: validation.unansweredRequired,
      answeredCount: Object.keys(answers).length,
      totalCount: questions.length
    };
  }, [currentQuestionIndex, questions, answers, timeRemaining, examDurationMinutes]);

  return (
    <div>
      {/* 导航切换按钮 */}
      <Card
        style={{
          ...cardStyles.sidebar,
          marginBottom: 16,
          position: 'sticky',
          top: 104
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Typography.Text strong>答题进度</Typography.Text>
          <Button
            type="text"
            size="small"
            icon={<MenuOutlined />}
            onClick={() => setShowQuestionNav(!showQuestionNav)}
            style={{
              background: 'rgba(79, 70, 229, 0.1)',
              border: '1px solid rgba(79, 70, 229, 0.2)',
              borderRadius: 8
            }}
          >
            题目导航
          </Button>
        </div>

        {/* 进度显示 */}
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {typeof justSaved !== 'undefined' && justSaved && (
            <Typography.Text type="success" style={{ fontSize: 12 }}>已自动保存</Typography.Text>
          )}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>答题进度</Typography.Text>
              <Typography.Text strong style={{ fontSize: 13 }}>{Object.keys(answers).length}/{questions.length}</Typography.Text>
            </div>
            <Progress 
              percent={progress} 
              size="small" 
              strokeColor={{
                '0%': '#4F46E5',
                '100%': '#10B981'
              }}
              showInfo={false}
            />
          </div>
          
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>时间进度</Typography.Text>
              <Typography.Text strong style={{ fontSize: 13 }}>{formatTime(timeRemaining)}</Typography.Text>
            </div>
            <Progress 
              percent={timeProgress} 
              size="small" 
              strokeColor={timeRemaining < 300 ? '#EF4444' : '#F59E0B'}
              showInfo={false}
            />
          </div>

          {/* 快速导航 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size="small"
              disabled={currentQuestionIndex === 0}
              onClick={handlePreviousQuestion}
              icon={<ArrowLeftOutlined />}
              style={{
                ...buttonStyles.navigation,
                fontSize: 12,
                height: 32
              }}
            >
              上一题
            </Button>

            {currentQuestionIndex === questions.length - 1 ? (
              <Button
                type="primary"
                size="small"
                onClick={onSubmitExam}
                disabled={!submitButtonState.canSubmit}
                icon={<SendOutlined />}
                style={{
                  borderRadius: 8,
                  height: 32,
                  fontSize: 12,
                }}
              >
                提交试卷
              </Button>
            ) : (
              <Button
                size="small"
                disabled={currentQuestionIndex === questions.length - 1}
                onClick={handleNextQuestion}
                style={{
                  ...buttonStyles.navigation,
                  fontSize: 12,
                  height: 32
                }}
              >
                下一题
                <ArrowRightOutlined />
              </Button>
            )}
          </div>
        </Space>
      </Card>

      {/* 题目导航面板 */}
      {showQuestionNav && (
        <Card
          title="题目导航"
          style={{
            ...cardStyles.sidebar,
            animation: 'fadeInUp 0.3s ease-out'
          }}
          extra={
            <Button
              size="small"
              type="text"
              onClick={() => setShowQuestionNav(false)}
            >
              收起
            </Button>
          }
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${questions.length > 30 ? 5 : 4}, 1fr)`,
            gap: 8
          }}>
            {questions.map((question, index) => {
              const isRequired = question.is_required !== false;
              const isAnswered = answers[question.id] !== undefined && answers[question.id] !== null && answers[question.id] !== '';
              const isCurrent = index === currentQuestionIndex;
              
              return (
                <Tooltip
                  key={index}
                  title={`第${index + 1}题${isRequired ? ' (必答)' : ''}${isAnswered ? ' ✓' : ''}`}
                >
                  <Button
                    type={isCurrent ? 'primary' : 'default'}
                    size="small"
                    onClick={() => {
                      handleQuestionChange(index);
                      setShowQuestionNav(false);
                    }}
                    style={{
                      ...buttonStyles.questionNav,
                      position: 'relative',
                      background: isAnswered ? 
                        (isCurrent ? undefined : 'rgba(16, 185, 129, 0.1)') :
                        (isRequired ? 'rgba(239, 68, 68, 0.05)' : undefined),
                      borderColor: isAnswered ? '#10B981' : (isRequired && !isAnswered ? '#EF4444' : undefined),
                      borderWidth: isRequired && !isAnswered ? 2 : 1
                    }}
                  >
                    {index + 1}
                    {isAnswered && (
                      <CheckCircleOutlined 
                        style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          fontSize: 12,
                          color: '#10B981',
                          background: 'white',
                          borderRadius: '50%'
                        }}
                      />
                    )}
                    {isRequired && !isAnswered && (
                      <div
                        style={{
                          position: 'absolute',
                          top: -4,
                          left: -4,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#EF4444'
                        }}
                      />
                    )}
                  </Button>
                </Tooltip>
              );
            })}
          </div>
          
          {/* 状态说明 */}
          <div style={{ marginTop: 16, padding: 12, background: 'rgba(79, 70, 229, 0.05)', borderRadius: 8 }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
                <Typography.Text type="secondary">已回答</Typography.Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                <Typography.Text type="secondary">必答题（未答）</Typography.Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F46E5' }} />
                <Typography.Text type="secondary">当前题目</Typography.Text>
              </div>
            </Space>
          </div>
        </Card>
      )}

      {/* 智能提交按钮区域 */}
      {submitButtonState.show && (
        <Card
          style={{
            ...cardStyles.sidebar,
            marginTop: 16,
            animation: 'fadeInUp 0.3s ease-out',
            border: submitButtonState.urgent ? '2px solid #EF4444' : '2px solid #10B981'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            {submitButtonState.urgent && (
              <Alert
                message="时间即将结束！"
                type="warning"
                showIcon
                style={{ marginBottom: 16, fontSize: 13 }}
              />
            )}

            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong style={{ fontSize: 16 }}>
                {submitButtonState.canSubmit ? '可以提交了！' : '还有必答题未完成'}
              </Typography.Text>
              <div style={{ marginTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  已完成 {submitButtonState.answeredCount}/{submitButtonState.totalCount} 题
                </Typography.Text>
              </div>
            </div>

            {!submitButtonState.canSubmit && (
              <Alert
                message="请完成以下必答题："
                description={
                  <div style={{ marginTop: 8 }}>
                    {submitButtonState.missingRequired.slice(0, 3).map((q, idx) => (
                      <Tag
                        key={idx}
                        color="error"
                        style={{ margin: '2px', cursor: 'pointer' }}
                        onClick={() => {
                          const ix = questions.findIndex(item => item.id === q.id);
                          if (ix >= 0) {
                            handleQuestionChange(ix);
                          }
                        }}
                      >
                        {q.title}
                      </Tag>
                    ))}
                    {submitButtonState.missingRequired.length > 3 && (
                      <Tag color="default">还有{submitButtonState.missingRequired.length - 3}题...</Tag>
                    )}
                  </div>
                }
                type="warning"
                style={{ marginBottom: 16, textAlign: 'left' }}
              />
            )}

            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              onClick={onSubmitExam}
              disabled={!submitButtonState.canSubmit}
              style={{
                background: submitButtonState.canSubmit
                  ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                  : undefined,
                border: 'none',
                borderRadius: 12,
                height: 48,
                fontSize: 16,
                fontWeight: 600,
                width: '100%'
              }}
            >
              {submitButtonState.canSubmit ? '提交考试' : '完成必答题后可提交'}
            </Button>

            <div style={{ marginTop: 8 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                快捷键: Ctrl+Enter
              </Typography.Text>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default QuestionNavigation;
