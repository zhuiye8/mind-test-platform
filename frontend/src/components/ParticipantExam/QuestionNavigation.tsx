import React, { useCallback, useMemo } from 'react';
import { Card, Button, Space, Typography, Progress, Badge, Tag, Tooltip, Row, Col } from 'antd';
import { 
  ArrowLeftOutlined, 
  ArrowRightOutlined, 
  CheckCircleOutlined, 
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  MenuOutlined
} from '@ant-design/icons';
import type { Question } from '../../types';
import { cardStyles, buttonStyles } from './ParticipantExam.styles';

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
  onQuestionChange
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
            gridTemplateColumns: 'repeat(4, 1fr)',
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
    </div>
  );
};

export default QuestionNavigation;