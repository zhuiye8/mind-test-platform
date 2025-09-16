import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Empty,
  Tag,
  Typography,
  Space,
  Timeline,
  Progress,
  Spin,
  Alert,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  QuestionCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ExamResult, Question } from '../types';
import { examApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;

interface ParticipantAnswerDetailProps {
  examResult: ExamResult;
  examId: string;
}

interface QuestionWithAnswer extends Question {
  answerDisplay: string;
  textAnswer: string;
  selectedOptionKeys: string[];
  isAnswered: boolean;
}

/**
 * 参与者答案详情展示组件 (2025年心理测试最佳实践)
 * 提供现代化的答案查看界面，包含完整的题目信息和可视化答题分析
 */
const ParticipantAnswerDetail: React.FC<ParticipantAnswerDetailProps> = ({
  examResult,
  examId,
}) => {
  const [questions, setQuestions] = useState<QuestionWithAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载题目和答案数据
  const loadQuestionsWithAnswers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 调用真实API获取题目详情
      const response = await examApi.getExamQuestions(examId);
      let questionsData: Question[] = [];
      
      if (response.success && response.data) {
        questionsData = response.data;
      } else {
        throw new Error(response.error || 'API返回数据格式错误');
      }

      // 将答案与题目匹配
      const parseChoiceAnswerKeys = (rawAnswer: unknown): string[] => {
        if (rawAnswer == null) {
          return [];
        }

        if (Array.isArray(rawAnswer)) {
          return rawAnswer.map(value => String(value)).filter(Boolean);
        }

        if (typeof rawAnswer === 'string') {
          const trimmed = rawAnswer.trim();
          if (!trimmed) return [];

          // 解析 JSON 数组格式
          if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                return parsed.map((value: unknown) => String(value)).filter(Boolean);
              }
              if (parsed && typeof parsed === 'object') {
                return Object.keys(parsed).filter(key => parsed[key]);
              }
            } catch {
              // ignore JSON parse errors and fall through
            }
          }

          if (trimmed.includes(',')) {
            return trimmed
              .split(',')
              .map(item => item.trim())
              .filter(Boolean);
          }

          return [trimmed];
        }

        if (typeof rawAnswer === 'object') {
          return Object.keys(rawAnswer as Record<string, unknown>).filter(key => (rawAnswer as Record<string, unknown>)[key]);
        }

        return [String(rawAnswer)];
      };

      const getOptionLabel = (optionValue: string | Question['options'][string]): string => {
        if (typeof optionValue === 'string') {
          return optionValue;
        }

        if (!optionValue) {
          return '';
        }

        if (typeof optionValue === 'object') {
          return optionValue.text || optionValue.label || '';
        }

        return String(optionValue ?? '');
      };

      const formatAnswer = (question: Question, rawAnswer: unknown) => {
        if (question.question_type === 'text') {
          if (rawAnswer == null) {
            return {
              textAnswer: '',
              answerDisplay: '',
              selectedOptionKeys: [] as string[],
              isAnswered: false,
            };
          }

          let textValue = '';

          if (typeof rawAnswer === 'string') {
            textValue = rawAnswer;
          } else if (typeof rawAnswer === 'number' || typeof rawAnswer === 'boolean') {
            textValue = String(rawAnswer);
          } else if (Array.isArray(rawAnswer)) {
            textValue = rawAnswer.join(', ');
          } else if (typeof rawAnswer === 'object') {
            try {
              textValue = JSON.stringify(rawAnswer);
            } catch {
              textValue = String(rawAnswer);
            }
          }

          return {
            textAnswer: textValue,
            answerDisplay: textValue,
            selectedOptionKeys: [] as string[],
            isAnswered: Boolean(textValue && textValue.trim().length > 0),
          };
        }

        const selectedKeys = parseChoiceAnswerKeys(rawAnswer);
        const optionLabels = (selectedKeys || []).map(key => {
          const optionValue = question.options?.[key];
          const label = getOptionLabel(optionValue);
          return label ? `${key}. ${label}` : key;
        });

        return {
          textAnswer: '',
          answerDisplay: optionLabels.join('；'),
          selectedOptionKeys: selectedKeys,
          isAnswered: selectedKeys.length > 0,
        };
      };

      const questionsWithAnswers: QuestionWithAnswer[] = questionsData.map(question => {
        const rawAnswer = examResult.answers?.[question.id];
        const { textAnswer, answerDisplay, selectedOptionKeys, isAnswered } = formatAnswer(question, rawAnswer);

        return {
          ...question,
          textAnswer,
          answerDisplay,
          selectedOptionKeys,
          isAnswered,
        };
      });

      setQuestions(questionsWithAnswers);
    } catch (err) {
      console.error('加载题目答案失败:', err);
      setError('加载题目答案失败，请重试');
    } finally {
      setLoading(false);
    }
  }, [examResult.id, examResult.answers, examId]);

  // 组件初始化时加载数据
  useEffect(() => {
    loadQuestionsWithAnswers();
  }, [loadQuestionsWithAnswers]);

  // 计算答题统计
  const getAnswerStats = () => {
    const totalQuestions = questions.length;
    const answeredQuestions = questions.filter(q => q.isAnswered).length;
    const completionRate = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

    return {
      totalQuestions,
      answeredQuestions,
      completionRate,
      unansweredQuestions: totalQuestions - answeredQuestions,
    };
  };

  const stats = getAnswerStats();

  // 计算答题用时
  const getDurationMetrics = () => {
    const startedAt = examResult.started_at ? new Date(examResult.started_at) : null;
    const submittedAt = examResult.submitted_at ? new Date(examResult.submitted_at) : null;

    if (!startedAt || !submittedAt || Number.isNaN(startedAt.getTime()) || Number.isNaN(submittedAt.getTime())) {
      return {
        totalSeconds: null,
        minutes: null,
        perQuestionMinutes: null,
      };
    }

    const totalSeconds = Math.max(0, Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000));
    const minutes = Math.max(1, Math.round(totalSeconds / 60));
    const perQuestionMinutes = questions.length > 0 ? Math.round((minutes / questions.length) * 10) / 10 : null;

    return {
      totalSeconds,
      minutes,
      perQuestionMinutes,
    };
  };

  const durationMetrics = getDurationMetrics();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin size="large" />
        <p style={{ marginTop: 16, color: '#666' }}>正在加载答题详情...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="加载失败"
        description={error}
        type="error"
        showIcon
        style={{ margin: '20px 0' }}
      />
    );
  }

  return (
    <div style={{ maxHeight: '70vh', overflow: 'auto', padding: '0 8px' }}>
      {/* 学生信息卡片 */}
      <Card 
        size="small" 
        style={{ 
          marginBottom: 16,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
        }}
      >
        <div style={{ color: 'white' }}>
          <Space size="large">
            <div>
              <UserOutlined style={{ fontSize: 16, marginRight: 8 }} />
              <Text style={{ color: 'white', fontWeight: 500 }}>
                {examResult.participant_name}
              </Text>
            </div>
            <div>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                学号: {examResult.participant_id}
              </Text>
            </div>
            <div>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                IP: {examResult.ip_address}
              </Text>
            </div>
          </Space>
        </div>
      </Card>

      {/* 答题统计 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Title level={5} style={{ margin: '0 0 12px 0', color: '#1890ff' }}>
          📊 答题统计
        </Title>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <Text type="secondary">答题进度</Text>
            <div style={{ marginTop: 4 }}>
              <Progress 
                percent={stats.completionRate} 
                size="small"
                format={() => `${stats.answeredQuestions}/${stats.totalQuestions}`}
                strokeColor={stats.completionRate === 100 ? '#52c41a' : '#1890ff'}
              />
            </div>
          </div>
          <div>
            <Text type="secondary">答题用时</Text>
            <div style={{ marginTop: 4 }}>
              <Space>
                <ClockCircleOutlined style={{ color: '#52c41a' }} />
                <Text strong>
                  {durationMetrics.minutes != null ? `${durationMetrics.minutes} 分钟` : '暂无数据'}
                </Text>
              </Space>
            </div>
          </div>
          <div>
            <Text type="secondary">平均用时</Text>
            <div style={{ marginTop: 4 }}>
              <Text strong style={{ color: durationMetrics.perQuestionMinutes != null ? '#1890ff' : '#d9d9d9' }}>
                {durationMetrics.perQuestionMinutes != null 
                  ? `${durationMetrics.perQuestionMinutes} 分钟/题`
                  : '暂无数据'}
              </Text>
            </div>
          </div>
        </div>
        
        {/* 详细统计信息 */}
        <div style={{ marginTop: 16, padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>已答题数</Text>
              <Text strong style={{ color: '#52c41a', fontSize: 16 }}>{stats.answeredQuestions}</Text>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>未答题数</Text>
              <Text strong style={{ color: '#faad14', fontSize: 16 }}>{stats.unansweredQuestions}</Text>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>完成率</Text>
              <Text strong style={{ color: stats.completionRate === 100 ? '#52c41a' : '#1890ff', fontSize: 16 }}>
                {Math.round(stats.completionRate)}%
              </Text>
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>总分</Text>
              <Text strong style={{ color: '#722ed1', fontSize: 16 }}>
                {examResult.score || 0}
              </Text>
            </div>
          </div>
          
          {examResult.submitted_at && (
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                提交时间: {new Date(examResult.submitted_at).toLocaleString('zh-CN')}
              </Text>
            </div>
          )}
        </div>
      </Card>

      {/* 题目答案列表 */}
      <div>
        <Title level={5} style={{ margin: '0 0 12px 0', color: '#1890ff' }}>
          📝 详细答案
        </Title>
        
        {questions.length === 0 ? (
          <Empty
            description="暂无题目数据"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Timeline
            items={questions.map((question) => ({
              dot: question.isAnswered ? (
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
              ) : (
                <QuestionCircleOutlined style={{ color: '#faad14' }} />
              ),
              children: (
                <Card 
                  key={question.id}
                  size="small" 
                  style={{ 
                    marginBottom: 8,
                    border: question.isAnswered 
                      ? '1px solid #b7eb8f' 
                      : '1px solid #ffe7ba',
                    background: question.isAnswered 
                      ? '#f6ffed' 
                      : '#fffbe6',
                  }}
                >
                  <div style={{ marginBottom: 8 }}>
                    <Space>
                      <Tag color="blue">第{question.question_order}题</Tag>
                      <Tag color={question.question_type === 'text' ? 'purple' : 'green'}>
                        {question.question_type === 'single_choice' ? '单选题' : 
                         question.question_type === 'multiple_choice' ? '多选题' : '文本题'}
                      </Tag>
                      {!question.isAnswered && <Tag color="warning">未作答</Tag>}
                    </Space>
                  </div>
                  
                  <Paragraph style={{ margin: '8px 0', fontWeight: 500 }}>
                    {question.title}
                  </Paragraph>

                  {/* 选择题选项展示 */}
                  {question.question_type !== 'text' && Object.keys(question.options).length > 0 && (
                    <div style={{ margin: '12px 0', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: 4 }}>
                      {Object.entries(question.options).map(([key, value]) => (
                        <div 
                          key={key} 
                          style={{ 
                            margin: '4px 0',
                            padding: '4px 8px',
                            borderRadius: 4,
                            background: question.selectedOptionKeys.includes(key) ? '#e6f7ff' : 'transparent',
                            border: question.selectedOptionKeys.includes(key) ? '1px solid #91d5ff' : '1px solid transparent',
                          }}
                        >
                          <Space>
                            <Text strong style={{ color: question.selectedOptionKeys.includes(key) ? '#1890ff' : '#666' }}>
                              {key}.
                            </Text>
                            <Text style={{ color: question.selectedOptionKeys.includes(key) ? '#1890ff' : '#333' }}>
                              {typeof value === 'string' ? value : value?.text || value?.label || ''}
                            </Text>
                            {question.selectedOptionKeys.includes(key) && (
                              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                            )}
                          </Space>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 学生答案 */}
                  <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      学生回答:
                    </Text>
                    {question.isAnswered ? (
                      <Text style={{ fontSize: 14 }}>
                        {question.question_type === 'text' 
                          ? question.textAnswer 
                          : question.answerDisplay
                        }
                      </Text>
                    ) : (
                      <Text type="secondary" italic>
                        未作答
                      </Text>
                    )}
                  </div>
                </Card>
              ),
            }))}
          />
        )}
      </div>
    </div>
  );
};

export default ParticipantAnswerDetail;
