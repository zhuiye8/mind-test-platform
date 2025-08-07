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

interface StudentAnswerDetailProps {
  examResult: ExamResult;
  examId: string;
}

interface QuestionWithAnswer extends Question {
  student_answer?: string;
  answer_display?: string;
  is_answered: boolean;
}

/**
 * 学生答案详情展示组件 (2025年心理测试最佳实践)
 * 提供现代化的答案查看界面，包含完整的题目信息和可视化答题分析
 */
const StudentAnswerDetail: React.FC<StudentAnswerDetailProps> = ({
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
      const questionsWithAnswers: QuestionWithAnswer[] = questionsData.map(question => {
        const studentAnswer = examResult.answers[question.id] || '';
        let answerDisplay = studentAnswer;
        
        // 如果是选择题，显示选项内容
        if (studentAnswer && question.question_type !== 'text' && question.options) {
          const optionContent = question.options[studentAnswer];
          if (optionContent) {
            answerDisplay = `${studentAnswer}. ${optionContent}`;
          }
        }

        return {
          ...question,
          student_answer: studentAnswer,
          answer_display: answerDisplay,
          is_answered: Boolean(studentAnswer),
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
    const answeredQuestions = questions.filter(q => q.is_answered).length;
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
  const getDuration = () => {
    if (!examResult.started_at) return null;
    const startTime = new Date(examResult.started_at);
    const endTime = new Date(examResult.submitted_at);
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.round(durationMs / 60000);
    return durationMinutes;
  };

  const duration = getDuration();

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
                <Text strong>{duration ? `${duration} 分钟` : '未知'}</Text>
              </Space>
            </div>
          </div>
          <div>
            <Text type="secondary">答题效率</Text>
            <div style={{ marginTop: 4 }}>
              <Text strong style={{ color: duration && duration < 30 ? '#52c41a' : duration && duration < 60 ? '#faad14' : '#ff4d4f' }}>
                {duration && stats.totalQuestions > 0 
                  ? `${Math.round(duration / stats.totalQuestions * 10) / 10} 分钟/题` 
                  : '未知'
                }
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
              dot: question.is_answered ? (
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
                    border: question.is_answered 
                      ? '1px solid #b7eb8f' 
                      : '1px solid #ffe7ba',
                    background: question.is_answered 
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
                      {!question.is_answered && <Tag color="warning">未作答</Tag>}
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
                            background: question.student_answer === key ? '#e6f7ff' : 'transparent',
                            border: question.student_answer === key ? '1px solid #91d5ff' : '1px solid transparent',
                          }}
                        >
                          <Space>
                            <Text strong style={{ color: question.student_answer === key ? '#1890ff' : '#666' }}>
                              {key}.
                            </Text>
                            <Text style={{ color: question.student_answer === key ? '#1890ff' : '#333' }}>
                              {value}
                            </Text>
                            {question.student_answer === key && (
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
                    {question.is_answered ? (
                      <Text style={{ fontSize: 14 }}>
                        {question.question_type === 'text' 
                          ? question.student_answer 
                          : question.answer_display
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

export default StudentAnswerDetail;