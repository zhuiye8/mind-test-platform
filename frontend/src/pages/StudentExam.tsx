import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Progress,
  Radio,
  Checkbox,
  message,
  Modal,
  Spin,
  Empty,
  Alert,
  Divider,
  Row,
  Col,
  Badge,
  Avatar,
  Tag,
  Tooltip,
  FloatButton,
} from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  SendOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  MenuOutlined,
  EyeOutlined,
  BulbOutlined,
  HeartOutlined,
  SecurityScanOutlined,
  RocketOutlined,
  FireOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { Question } from '../types';
import { publicApi } from '../services/api';
import { validateRequiredQuestions } from '../utils/validation';

const { Title, Text } = Typography;
const { TextArea } = Input;

// 模拟的公开API接口（实际应该从后端获取）
interface ExamInfo {
  id: string;
  title: string;
  duration_minutes: number;
  password_required: boolean; // 修复字段名，与后端API保持一致
  questions?: Question[]; // questions字段可能为undefined（需要密码时不返回）
  shuffle_questions: boolean;
  allow_empty_answers?: boolean; // 是否允许空选
  required_questions?: string[]; // 必答题目ID列表
}

interface StudentInfo {
  student_id: string;
  student_name: string;
}

const StudentExam: React.FC = () => {
  const { examUuid } = useParams<{ examUuid: string }>();
  const navigate = useNavigate();
  const [modal, contextHolder] = Modal.useModal();
  
  // 考试状态管理
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'password' | 'info' | 'exam' | 'completed'>('password');
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  
  // 沉浸式UI状态
  const [showQuestionNav, setShowQuestionNav] = useState(false);
  const [questionTransition, setQuestionTransition] = useState(false);

  useEffect(() => {
    if (examUuid) {
      loadExamInfo();
    }
  }, [examUuid]);

  // 计时器效果
  useEffect(() => {
    if (currentStep === 'exam' && timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // 时间到，自动提交
            handleSubmitExam(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [currentStep, timeRemaining]);

  // 自动保存答案到localStorage
  useEffect(() => {
    if (examUuid && Object.keys(answers).length > 0) {
      localStorage.setItem(`exam_${examUuid}_answers`, JSON.stringify(answers));
    }
  }, [examUuid, answers]);

  // 加载考试信息
  const loadExamInfo = async () => {
    if (!examUuid) {
      message.error('无效的考试链接');
      return;
    }

    try {
      setLoading(true);
      // 调用实际的公开API
      const response = await publicApi.getExam(examUuid);
      
      if (response.success && response.data) {
        const examData = response.data;
        
        // 设置考试信息
        setExam(examData);
        setTimeRemaining(examData.duration_minutes * 60);
        
        // 如果不需要密码，直接进入学生信息录入
        if (!examData.password_required) {
          setCurrentStep('info');
        }

        // 尝试恢复之前保存的答案
        const savedAnswers = localStorage.getItem(`exam_${examUuid}_answers`);
        if (savedAnswers) {
          setAnswers(JSON.parse(savedAnswers));
        }
      } else {
        message.error(response.error || '加载考试信息失败');
      }
    } catch (error: any) {
      console.error('加载考试信息失败:', error);
      message.error(error.response?.data?.error || '加载考试信息失败，请检查链接是否正确');
    } finally {
      setLoading(false);
    }
  };

  // 密码验证
  const handlePasswordSubmit = async (values: { password: string }) => {
    if (!examUuid) return;
    
    try {
      const response = await publicApi.verifyPassword(examUuid, values.password);
      if (response.success) {
        message.success('密码验证成功');
        
        // 密码验证成功后，重新获取完整的考试信息（包含题目）
        try {
          const examResponse = await publicApi.getExam(examUuid, values.password);
          if (examResponse.success && examResponse.data) {
            const examData = examResponse.data;
            setExam(examData);
            setTimeRemaining(examData.duration_minutes * 60);
            
            // 确保获取到题目数据后再跳转
            if (examData.questions && examData.questions.length > 0) {
              setCurrentStep('info');
            } else {
              message.error('获取考试题目失败，请刷新页面重试');
            }
          } else {
            message.error('获取考试信息失败，请刷新页面重试');
          }
        } catch (examError) {
          console.error('获取完整考试信息失败:', examError);
          message.error('获取考试信息失败，请刷新页面重试');
        }
      } else {
        message.error(response.error || '密码错误，请重试');
      }
    } catch (error) {
      message.error('密码验证失败，请重试');
    }
  };

  // 学生信息提交
  const handleStudentInfoSubmit = async (values: StudentInfo) => {
    if (!examUuid) return;
    
    try {
      // 检查重复提交
      const response = await publicApi.checkDuplicateSubmission(examUuid, values.student_id);
      if (response.success && response.data?.canSubmit) {
        // 没有重复提交，可以继续
        setStudentInfo(values);
        setCurrentStep('exam');
      } else {
        // API返回success:false，不应该到这里，但以防万一
        message.error('您已经提交过本次考试，请勿重复提交');
      }
    } catch (error: any) {
      console.error('检查重复提交失败:', error);
      // 处理重复提交错误 - 这是主要的错误处理路径
      if (error.response?.status === 409) {
        // HTTP 409状态码表示冲突（重复提交）
        message.error(error.response?.data?.error || '您已经提交过本次考试，请勿重复提交');
      } else {
        // 其他错误
        message.error('验证失败，请重试');
      }
    }
  };



  // 获取所有题目列表（简化版 - 移除条件逻辑）
  const getVisibleQuestions = useCallback((): Question[] => {
    if (!exam || !exam.questions) return [];
    // 简化：返回所有题目，不再进行条件评估
    return exam.questions;
  }, [exam?.questions]);

  // 答案更新处理
  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  // 提交考试
  const handleSubmitExam = async (isTimeout: boolean = false) => {
    try {
      setSubmitting(true);
      
      // 使用验证工具函数
      const allQuestions = getVisibleQuestions();
      const validation = validateRequiredQuestions(allQuestions, answers);

      // 简化提交验证提示
      if (!isTimeout && !validation.isValid) {
        const totalQuestions = allQuestions.length;
        
        const title = '还有必填题目未完成';
        const description = (
          <div>
            <p>还有 <strong style={{color: '#ff4d4f'}}>{validation.unansweredRequired.length}</strong> 道必填题目未回答。</p>
            <div style={{marginTop: '12px', fontSize: '13px', color: '#666'}}>
              <div>• 总题目：{totalQuestions} 题</div>
              <div>• 必填题目：{validation.totalRequired} 题</div>
              <div>• 已完成必填：{validation.answeredRequired} 题</div>
            </div>
            <p style={{marginTop: '12px', color: '#1890ff'}}>
              <strong>提示：</strong>请确保完成所有必填题目后再提交。
            </p>
          </div>
        );
          
        // 必填题未完成，不能提交
        modal.warning({
          title,
          content: description,
          okText: '继续答题',
          width: 520,
        });
        return;
      }

      await submitToServer();
    } catch (error) {
      console.error('提交失败:', error);
      message.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 实际提交到服务器
  const submitToServer = async () => {
    if (!studentInfo || !examUuid) return;

    try {
      // 调用提交API
      const response = await publicApi.submitExam(examUuid, {
        student_id: studentInfo.student_id,
        student_name: studentInfo.student_name,
        answers: answers,
      });

      if (response.success) {
        // 清除本地保存的答案
        localStorage.removeItem(`exam_${examUuid}_answers`);
        
        message.success('提交成功！感谢您的参与');
        setCurrentStep('completed');
      } else {
        message.error(response.error || '提交失败，请重试');
      }
    } catch (error: any) {
      console.error('提交失败:', error);
      // 处理重复提交错误（409状态码）
      if (error.response?.status === 409) {
        message.warning(error.response?.data?.error || '您已经提交过本次考试，请勿重复提交');
        setCurrentStep('completed');
        localStorage.removeItem(`exam_${examUuid}_answers`);
      } else {
        message.error(error.response?.data?.error || '提交失败，请重试');
      }
    }
  };

  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 渲染题目组件 - 现代化设计
  const renderQuestion = (question: Question) => {
    const value = answers[question.id];

    const radioStyle = {
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px',
      marginBottom: '12px',
      borderRadius: '12px',
      border: '2px solid transparent',
      background: 'rgba(79, 70, 229, 0.04)',
      transition: 'all 0.3s ease',
    };

    const checkboxStyle = {
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px',
      marginBottom: '12px',
      borderRadius: '12px',
      border: '2px solid transparent',
      background: 'rgba(16, 185, 129, 0.04)',
      transition: 'all 0.3s ease',
    };

    switch (question.question_type) {
      case 'single_choice':
        return (
          <Radio.Group
            value={value}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={0}>
              {Object.entries(question.options).map(([key, text]) => (
                <div
                  key={key}
                  style={{
                    ...radioStyle,
                    background: value === key ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.04)',
                    borderColor: value === key ? '#4F46E5' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (value !== key) {
                      e.currentTarget.style.background = 'rgba(79, 70, 229, 0.06)';
                      e.currentTarget.style.borderColor = 'rgba(79, 70, 229, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (value !== key) {
                      e.currentTarget.style.background = 'rgba(79, 70, 229, 0.04)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }
                  }}
                >
                  <Radio value={key} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <span style={{ marginLeft: 12, fontSize: '16px', lineHeight: '1.6' }}>{text}</span>
                  </Radio>
                </div>
              ))}
            </Space>
          </Radio.Group>
        );

      case 'multiple_choice':
        return (
          <Checkbox.Group
            value={value || []}
            onChange={(checkedValues) => handleAnswerChange(question.id, checkedValues)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={0}>
              {Object.entries(question.options).map(([key, text]) => (
                <div
                  key={key}
                  style={{
                    ...checkboxStyle,
                    background: value?.includes(key) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.04)',
                    borderColor: value?.includes(key) ? '#10B981' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!value?.includes(key)) {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.06)';
                      e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!value?.includes(key)) {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.04)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }
                  }}
                >
                  <Checkbox value={key} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <span style={{ marginLeft: 12, fontSize: '16px', lineHeight: '1.6' }}>{text}</span>
                  </Checkbox>
                </div>
              ))}
            </Space>
          </Checkbox.Group>
        );

      case 'text':
        return (
          <TextArea
            value={value || ''}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            placeholder="请输入您的回答..."
            rows={6}
            maxLength={1000}
            showCount
            style={{
              borderRadius: '12px',
              fontSize: '16px',
              lineHeight: '1.6',
              padding: '16px',
              border: '2px solid #E5E7EB',
              background: 'rgba(255, 255, 255, 0.8)',
              transition: 'all 0.3s ease'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#F59E0B';
              e.target.style.boxShadow = '0 0 0 4px rgba(245, 158, 11, 0.1)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#E5E7EB';
              e.target.style.boxShadow = 'none';
            }}
          />
        );

      default:
        return <Text type="secondary">不支持的题目类型</Text>;
    }
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: `
          linear-gradient(135deg, 
            rgba(79, 70, 229, 0.05) 0%, 
            rgba(16, 185, 129, 0.05) 50%, 
            rgba(245, 158, 11, 0.05) 100%
          )
        `
      }}>
        <div style={{ textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 24, fontSize: '18px', color: '#4B5563', fontWeight: '500' }}>
            正在加载考试内容...
          </div>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: `
          linear-gradient(135deg, 
            rgba(239, 68, 68, 0.08) 0%, 
            rgba(220, 38, 38, 0.06) 100%
          )
        `
      }}>
        <Card style={{ 
          width: 420, 
          borderRadius: '24px', 
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)'
        }}>
          <Empty
            description="考试不存在或已结束"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button 
              type="primary" 
              onClick={() => navigate('/')}
              style={{
                borderRadius: '12px',
                height: '48px',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              返回首页
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  const allQuestions = getVisibleQuestions();
  const currentQuestion = allQuestions[currentQuestionIndex];
  
  // 简化进度计算
  // const getProgress = useCallback(() => {
  //   if (allQuestions.length === 0) return 0;
    
  //   // 计算已回答题目的比例
  //   const answeredCount = allQuestions.filter(q => {
  //     const answer = answers[q.id];
  //     if (answer === undefined || answer === null) return false;
  //     if (typeof answer === 'string' && answer.trim() === '') return false;
  //     if (Array.isArray(answer) && answer.length === 0) return false;
  //     return true;
  //   }).length;
    
  //   return (answeredCount / allQuestions.length) * 100;
  // }, [allQuestions, answers]);
  
  const progress = 100;

  return (
    <div>
      {/* 重要：必须添加contextHolder才能显示Modal */}
      {contextHolder}
      
      {/* 密码验证步骤 - 现代化设计 */}
      {currentStep === 'password' && exam && (
        <div style={{
          minHeight: '100vh',
          background: `
            linear-gradient(135deg, 
              rgba(79, 70, 229, 0.08) 0%, 
              rgba(16, 185, 129, 0.06) 50%, 
              rgba(79, 70, 229, 0.08) 100%
            ),
            radial-gradient(circle at 20% 30%, rgba(79, 70, 229, 0.12) 0%, transparent 60%),
            radial-gradient(circle at 80% 70%, rgba(16, 185, 129, 0.12) 0%, transparent 60%)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '420px',
            animation: 'fadeInUp 0.6s ease-out'
          }}>
            <Card 
              style={{ 
                boxShadow: `
                  0 20px 40px rgba(0, 0, 0, 0.08),
                  0 8px 16px rgba(0, 0, 0, 0.04),
                  inset 0 1px 0 rgba(255, 255, 255, 0.6)
                `,
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)'
              }}
              bodyStyle={{ padding: '40px' }}
            >
              {/* 图标区域 */}
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '80px',
                  height: '80px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #10B981 100%)',
                  marginBottom: '24px',
                  boxShadow: '0 8px 20px rgba(79, 70, 229, 0.3)'
                }}>
                  <SecurityScanOutlined style={{ fontSize: '36px', color: 'white' }} />
                </div>
                <Title level={2} style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700' }}>
                  {exam.title}
                </Title>
                <Text type="secondary" style={{ fontSize: '16px', lineHeight: '1.5' }}>
                  🔐 安全验证，请输入考试密码开始答题
                </Text>
              </div>

              <Form onFinish={handlePasswordSubmit} layout="vertical" size="large">
                <Form.Item
                  name="password"
                  rules={[{ required: true, message: '请输入考试密码' }]}
                >
                  <Input.Password 
                    placeholder="请输入考试密码" 
                    style={{ 
                      borderRadius: '12px',
                      height: '52px',
                      fontSize: '16px',
                      border: '2px solid #E5E7EB',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#4F46E5';
                      e.target.style.boxShadow = '0 0 0 4px rgba(79, 70, 229, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E7EB';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    block 
                    style={{ 
                      borderRadius: '12px',
                      height: '52px',
                      fontSize: '16px',
                      fontWeight: '600',
                      background: 'linear-gradient(135deg, #4F46E5 0%, #10B981 100%)',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(79, 70, 229, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.3)';
                    }}
                  >
                    <Space>
                      <ThunderboltOutlined />
                      验证密码
                    </Space>
                  </Button>
                </Form.Item>
              </Form>
              
              {/* 底部提示 */}
              <div style={{ 
                textAlign: 'center', 
                marginTop: '24px', 
                padding: '16px',
                background: 'rgba(79, 70, 229, 0.05)',
                borderRadius: '12px',
                border: '1px solid rgba(79, 70, 229, 0.1)'
              }}>
                <Text type="secondary" style={{ fontSize: '13px' }}>
                  <BulbOutlined style={{ marginRight: '6px', color: '#4F46E5' }} />
                  请联系老师获取考试密码，密码区分大小写
                </Text>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 学生信息录入步骤 - 沉浸式设计 */}
      {currentStep === 'info' && exam && (
        <div style={{
          minHeight: '100vh',
          background: `
            linear-gradient(135deg, 
              rgba(16, 185, 129, 0.08) 0%, 
              rgba(245, 158, 11, 0.06) 50%, 
              rgba(16, 185, 129, 0.08) 100%
            ),
            radial-gradient(circle at 30% 20%, rgba(16, 185, 129, 0.12) 0%, transparent 60%),
            radial-gradient(circle at 70% 80%, rgba(245, 158, 11, 0.12) 0%, transparent 60%)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            animation: 'fadeInUp 0.6s ease-out 0.2s both'
          }}>
            <Card 
              style={{ 
                boxShadow: `
                  0 20px 40px rgba(0, 0, 0, 0.08),
                  0 8px 16px rgba(0, 0, 0, 0.04),
                  inset 0 1px 0 rgba(255, 255, 255, 0.6)
                `,
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)'
              }}
              bodyStyle={{ padding: '40px' }}
            >
              {/* 头部区域 */}
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '80px',
                  height: '80px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #10B981 0%, #F59E0B 100%)',
                  marginBottom: '24px',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)'
                }}>
                  <RocketOutlined style={{ fontSize: '36px', color: 'white' }} />
                </div>
                <Title level={2} style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700' }}>
                  {exam.title}
                </Title>
                <Text type="secondary" style={{ fontSize: '16px', lineHeight: '1.5' }}>
                  📝 准备开始心理测试，请先填写基本信息
                </Text>
              </div>

              {/* 考试信息卡片 */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(245, 158, 11, 0.05))',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '32px',
                border: '1px solid rgba(16, 185, 129, 0.15)'
              }}>
                <Row gutter={[16, 12]}>
                  <Col span={12}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981', marginBottom: '4px' }}>
                        {exam.questions?.length || 0}
                      </div>
                      <Text type="secondary" style={{ fontSize: '13px' }}>题目数量</Text>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B', marginBottom: '4px' }}>
                        {exam.duration_minutes}
                      </div>
                      <Text type="secondary" style={{ fontSize: '13px' }}>限时(分钟)</Text>
                    </div>
                  </Col>
                </Row>
                
                <Divider style={{ margin: '16px 0' }} />
                
                <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#6B7280' }}>
                  <div style={{ marginBottom: '6px' }}>
                    <HeartOutlined style={{ color: '#10B981', marginRight: '6px' }} />
                    请如实填写个人信息和答题内容
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <StarOutlined style={{ color: '#F59E0B', marginRight: '6px' }} />
                    答案会自动保存，请安心作答
                  </div>
                  <div>
                    <BulbOutlined style={{ color: '#4F46E5', marginRight: '6px' }} />
                    提交后无法修改，请仔细检查
                  </div>
                </div>
              </div>

              <Form
                onFinish={handleStudentInfoSubmit}
                layout="vertical"
                size="large"
                initialValues={studentInfo || undefined}
              >
                <Form.Item
                  name="student_id"
                  label={<Text strong style={{ fontSize: '15px' }}>学号/ID</Text>}
                  rules={[{ required: true, message: '请输入您的学号或ID' }]}
                >
                  <Input 
                    placeholder="请输入您的学号或ID" 
                    style={{ 
                      borderRadius: '12px',
                      height: '52px',
                      fontSize: '16px',
                      border: '2px solid #E5E7EB',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#10B981';
                      e.target.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E7EB';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="student_name"
                  label={<Text strong style={{ fontSize: '15px' }}>姓名</Text>}
                  rules={[{ required: true, message: '请输入您的姓名' }]}
                >
                  <Input 
                    placeholder="请输入您的姓名" 
                    style={{ 
                      borderRadius: '12px',
                      height: '52px',
                      fontSize: '16px',
                      border: '2px solid #E5E7EB',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#10B981';
                      e.target.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E7EB';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    block 
                    style={{ 
                      borderRadius: '12px',
                      height: '56px',
                      fontSize: '17px',
                      fontWeight: '600',
                      background: 'linear-gradient(135deg, #10B981 0%, #F59E0B 100%)',
                      border: 'none',
                      boxShadow: '0 6px 16px rgba(16, 185, 129, 0.3)',
                      transition: 'all 0.3s ease',
                      marginTop: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.3)';
                    }}
                  >
                    <Space>
                      <FireOutlined />
                      开始答题之旅
                    </Space>
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </div>
        </div>
      )}

      {/* 考试答题步骤 - 沉浸式全屏体验 */}
      {currentStep === 'exam' && exam && exam.questions && currentQuestion && (
        <div style={{
          minHeight: '100vh',
          background: `
            linear-gradient(145deg, 
              rgba(79, 70, 229, 0.03) 0%, 
              rgba(16, 185, 129, 0.02) 30%, 
              rgba(245, 158, 11, 0.03) 60%, 
              rgba(79, 70, 229, 0.03) 100%
            )
          `,
          position: 'relative'
        }}>
          {/* 顶部状态栏 - 毛玻璃效果 */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
            zIndex: 1000,
            padding: '12px 24px'
          }}>
            <div style={{ 
              maxWidth: '1200px', 
              margin: '0 auto',
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Avatar 
                  style={{ 
                    background: 'linear-gradient(135deg, #4F46E5, #10B981)',
                    marginRight: '12px'
                  }}
                  icon={<EyeOutlined />}
                />
                <div>
                  <Text strong style={{ fontSize: '16px', display: 'block' }}>{exam.title}</Text>
                  <Text type="secondary" style={{ fontSize: '13px' }}>
                    {studentInfo?.student_name} · {studentInfo?.student_id}
                  </Text>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                {/* 进度指示器 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ minWidth: '120px' }}>
                    <Progress 
                      percent={progress} 
                      size="small"
                      showInfo={false}
                      strokeColor={{ 
                        '0%': '#4F46E5', 
                        '100%': '#10B981' 
                      }}
                      style={{ marginBottom: '4px' }}
                    />
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      题目 {currentQuestionIndex + 1} / {allQuestions.length}
                      {(() => {
                        const requiredCount = allQuestions.filter(q => q.is_required !== false).length;
                        const answeredRequiredCount = allQuestions.filter(q => {
                          const isRequired = q.is_required !== false;
                          if (!isRequired) return false;
                          const answer = answers[q.id];
                          if (answer === undefined || answer === null) return false;
                          if (typeof answer === 'string' && answer.trim() === '') return false;
                          if (Array.isArray(answer) && answer.length === 0) return false;
                          return true;
                        }).length;
                        return requiredCount > 0 ? ` · 必填 ${answeredRequiredCount}/${requiredCount}` : '';
                      })()}
                    </Text>
                  </div>
                </div>
                
                {/* 计时器 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: timeRemaining < 300 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(79, 70, 229, 0.1)',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: `1px solid ${timeRemaining < 300 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(79, 70, 229, 0.2)'}`
                }}>
                  <ClockCircleOutlined style={{ 
                    color: timeRemaining < 300 ? '#EF4444' : '#4F46E5',
                    fontSize: '16px'
                  }} />
                  <Text strong style={{ 
                    color: timeRemaining < 300 ? '#EF4444' : '#4F46E5',
                    fontSize: '16px',
                    fontFamily: 'monospace'
                  }}>
                    {formatTime(timeRemaining)}
                  </Text>
                </div>
                
                {/* 提交按钮 */}
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => handleSubmitExam()}
                  loading={submitting}
                  style={{
                    borderRadius: '12px',
                    height: '44px',
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

          {/* 主内容区域 */}
          <div style={{ 
            paddingTop: '100px',
            paddingBottom: '40px',
            minHeight: '100vh'
          }}>
            <div style={{
              maxWidth: '900px',
              margin: '0 auto',
              padding: '0 24px'
            }}>
              {/* 题目卡片 */}
              <Card
                style={{
                  borderRadius: '24px',
                  boxShadow: `
                    0 20px 40px rgba(0, 0, 0, 0.08),
                    0 8px 16px rgba(0, 0, 0, 0.04)
                  `,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.98)',
                  backdropFilter: 'blur(20px)',
                  transition: 'all 0.3s ease',
                  animation: questionTransition ? 'questionSlide 0.3s ease-out' : 'none'
                }}
                bodyStyle={{ padding: '48px' }}
              >
                {/* 题目头部 */}
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Avatar 
                        size={48}
                        style={{
                          background: `linear-gradient(135deg, ${
                            currentQuestion.question_type === 'single_choice' ? '#4F46E5' : 
                            currentQuestion.question_type === 'multiple_choice' ? '#10B981' : '#F59E0B'
                          }, ${
                            currentQuestion.question_type === 'single_choice' ? '#7C3AED' : 
                            currentQuestion.question_type === 'multiple_choice' ? '#059669' : '#D97706'
                          })`,
                          fontSize: '20px',
                          fontWeight: 'bold'
                        }}
                      >
                        {currentQuestionIndex + 1}
                      </Avatar>
                      <div>
                        <Title level={3} style={{ margin: 0, fontSize: '20px' }}>
                          第 {currentQuestionIndex + 1} 题
                        </Title>
                        <Tag 
                          color={
                            currentQuestion.question_type === 'single_choice' ? 'blue' : 
                            currentQuestion.question_type === 'multiple_choice' ? 'green' : 'orange'
                          }
                          style={{ marginTop: '4px' }}
                        >
                          {currentQuestion.question_type === 'single_choice' ? '单选题' : 
                           currentQuestion.question_type === 'multiple_choice' ? '多选题' : '文本题'}
                        </Tag>
                      </div>
                    </div>
                    
                    {/* 题目标识组合 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* 必填题目标识 */}
                      {(currentQuestion.is_required !== false) && (
                        <Tooltip title="必填题目">
                          <Badge 
                            count="*" 
                            style={{ 
                              backgroundColor: '#ff4d4f',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              boxShadow: '0 2px 8px rgba(255, 77, 79, 0.3)'
                            }}
                          />
                        </Tooltip>
                      )}
                      
                    </div>
                  </div>
                  
                  <div style={{
                    fontSize: '18px',
                    lineHeight: '1.8',
                    color: '#1F2937',
                    padding: '24px',
                    background: 'rgba(79, 70, 229, 0.05)',
                    borderRadius: '16px',
                    border: '1px solid rgba(79, 70, 229, 0.1)'
                  }}>
                    {/* 必填标识 */}
                    {(currentQuestion.is_required !== false) && (
                      <Text strong style={{ color: '#ff4d4f', fontSize: '20px', marginRight: '8px' }}>
                        *
                      </Text>
                    )}
                    {currentQuestion.title}
                  </div>
                </div>

                {/* 答案选项区域 */}
                <div style={{ marginBottom: '40px' }}>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    borderRadius: '16px',
                    padding: '32px',
                    border: '1px solid rgba(0, 0, 0, 0.06)'
                  }}>
                    {renderQuestion(currentQuestion)}
                  </div>
                </div>

                {/* 导航区域 */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '24px',
                  borderTop: '1px solid rgba(0, 0, 0, 0.06)'
                }}>
                  <Button
                    disabled={currentQuestionIndex === 0}
                    onClick={() => {
                      setQuestionTransition(true);
                      setTimeout(() => {
                        setCurrentQuestionIndex(prev => prev - 1);
                        setQuestionTransition(false);
                      }, 150);
                    }}
                    style={{
                      borderRadius: '12px',
                      height: '44px',
                      minWidth: '120px'
                    }}
                    icon={<ArrowLeftOutlined />}
                  >
                    上一题
                  </Button>
                  
                  {/* 题目导航 */}
                  <Button
                    type="text"
                    onClick={() => setShowQuestionNav(!showQuestionNav)}
                    style={{
                      borderRadius: '12px',
                      height: '44px',
                      background: 'rgba(79, 70, 229, 0.1)',
                      border: '1px solid rgba(79, 70, 229, 0.2)'
                    }}
                    icon={<MenuOutlined />}
                  >
                    题目导航
                  </Button>

                  {currentQuestionIndex === allQuestions.length - 1 ? (
                    <Button
                      type="primary"
                      onClick={() => handleSubmitExam()}
                      loading={submitting}
                      style={{
                        borderRadius: '12px',
                        height: '44px',
                        minWidth: '120px',
                        background: 'linear-gradient(135deg, #10B981, #059669)',
                        border: 'none',
                        fontWeight: '600'
                      }}
                    >
                      <SendOutlined />
                      提交试卷
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      onClick={() => {
                        setQuestionTransition(true);
                        setTimeout(() => {
                          setCurrentQuestionIndex(prev => prev + 1);
                          setQuestionTransition(false);
                        }, 150);
                      }}
                      style={{
                        borderRadius: '12px',
                        height: '44px',
                        minWidth: '120px',
                        background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                        border: 'none'
                      }}
                    >
                      下一题
                      <ArrowRightOutlined />
                    </Button>
                  )}
                </div>
              </Card>

              {/* 题目导航面板 */}
              {showQuestionNav && (
                <Card
                  style={{
                    marginTop: '24px',
                    borderRadius: '16px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(20px)',
                    animation: 'fadeInUp 0.3s ease-out'
                  }}
                  title="题目导航"
                  bodyStyle={{ padding: '24px' }}
                >
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
                    gap: '12px'
                  }}>
                    {allQuestions.map((q, index) => {
                      const isRequired = q.is_required !== false;
                      return (
                        <Button
                          key={index}
                          type={index === currentQuestionIndex ? 'primary' : 'default'}
                          onClick={() => {
                            setCurrentQuestionIndex(index);
                            setShowQuestionNav(false);
                          }}
                          style={{
                            height: '48px',
                            borderRadius: '12px',
                            position: 'relative',
                            background: answers[q.id] ? 
                              (index === currentQuestionIndex ? undefined : 'rgba(16, 185, 129, 0.1)') :
                              (isRequired ? 'rgba(239, 68, 68, 0.05)' : undefined),
                            borderColor: answers[q.id] ? '#10B981' : (isRequired ? '#EF4444' : undefined),
                            borderWidth: isRequired && !answers[q.id] ? '2px' : '1px'
                          }}
                        >
                          {index + 1}
                          {answers[q.id] && (
                            <CheckCircleOutlined 
                              style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                fontSize: '12px',
                                color: '#10B981',
                                background: 'white',
                                borderRadius: '50%'
                              }}
                            />
                          )}
                          {isRequired && !answers[q.id] && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '-4px',
                                left: '-4px',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#EF4444',
                              }}
                            />
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* 悬浮快捷操作 */}
          <FloatButton.Group
            trigger="hover"
            type="primary"
            style={{ right: 24, bottom: 24 }}
            icon={<MenuOutlined />}
          >
            <FloatButton
              tooltip="题目导航"
              icon={<MenuOutlined />}
              onClick={() => setShowQuestionNav(!showQuestionNav)}
            />
            <FloatButton
              tooltip="提交考试"
              icon={<SendOutlined />}
              onClick={() => handleSubmitExam()}
              style={{ background: '#EF4444' }}
            />
          </FloatButton.Group>
        </div>
      )}

      {/* 完成步骤 - 庆祝动画 */}
      {currentStep === 'completed' && (
        <div style={{
          minHeight: '100vh',
          background: `
            linear-gradient(135deg, 
              rgba(16, 185, 129, 0.08) 0%, 
              rgba(52, 211, 153, 0.06) 50%, 
              rgba(16, 185, 129, 0.08) 100%
            ),
            radial-gradient(circle at 50% 20%, rgba(16, 185, 129, 0.15) 0%, transparent 60%),
            radial-gradient(circle at 20% 80%, rgba(52, 211, 153, 0.12) 0%, transparent 60%)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* 背景装饰 */}
          <div style={{
            position: 'absolute',
            top: '10%',
            left: '10%',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.1)',
            animation: 'float 3s ease-in-out infinite'
          }} />
          <div style={{
            position: 'absolute',
            top: '70%',
            right: '15%',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(52, 211, 153, 0.15)',
            animation: 'float 4s ease-in-out infinite 1s'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '20%',
            left: '20%',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.12)',
            animation: 'float 5s ease-in-out infinite 2s'
          }} />
          
          <div style={{
            width: '100%',
            maxWidth: '520px',
            animation: 'successBounce 0.8s ease-out',
            zIndex: 10
          }}>
            <Card 
              style={{ 
                textAlign: 'center',
                boxShadow: `
                  0 25px 50px rgba(0, 0, 0, 0.08),
                  0 12px 24px rgba(0, 0, 0, 0.04),
                  inset 0 1px 0 rgba(255, 255, 255, 0.8)
                `,
                borderRadius: '32px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                background: 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(20px)',
                position: 'relative',
                overflow: 'hidden'
              }}
              bodyStyle={{ padding: '64px 48px' }}
            >
              {/* 成功图标 */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981, #34D399)',
                marginBottom: '32px',
                boxShadow: '0 12px 24px rgba(16, 185, 129, 0.3)',
                animation: 'successPulse 2s ease-in-out infinite'
              }}>
                <CheckCircleOutlined style={{ 
                  fontSize: '56px', 
                  color: 'white',
                  animation: 'iconBounce 0.6s ease-out 0.5s both'
                }} />
              </div>
              
              <Title level={1} style={{ 
                marginBottom: '16px',
                fontSize: '32px',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                🎉 提交成功！
              </Title>
              
              <div style={{
                fontSize: '18px',
                lineHeight: '1.8',
                color: '#4B5563',
                marginBottom: '40px',
                background: 'rgba(16, 185, 129, 0.05)',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid rgba(16, 185, 129, 0.1)'
              }}>
                <div style={{ marginBottom: '16px', fontSize: '16px' }}>
                  <HeartOutlined style={{ color: '#10B981', marginRight: '8px' }} />
                  感谢您参与本次心理测试，您的答案已安全提交
                </div>
                <Divider style={{ margin: '16px 0', borderColor: 'rgba(16, 185, 129, 0.2)' }} />
                <div style={{ fontSize: '15px', color: '#6B7280' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <StarOutlined style={{ color: '#F59E0B', marginRight: '6px' }} />
                    测试结果将由专业人员进行分析
                  </div>
                  <div>
                    <BulbOutlined style={{ color: '#4F46E5', marginRight: '6px' }} />
                    如有需要会及时与您联系
                  </div>
                </div>
              </div>
              
              <Button 
                type="primary" 
                size="large" 
                onClick={() => navigate('/')}
                style={{ 
                  borderRadius: '16px',
                  height: '56px',
                  fontSize: '17px',
                  fontWeight: '600',
                  minWidth: '160px',
                  background: 'linear-gradient(135deg, #10B981, #34D399)',
                  border: 'none',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(16, 185, 129, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.3)';
                }}
              >
                <Space>
                  <HeartOutlined />
                  返回首页
                </Space>
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* 异常状态处理 */}
      {!loading && exam && (
          <>
            {/* 数据异常：步骤和数据不匹配 */}
            {currentStep === 'info' && exam && (!exam.questions || exam.questions.length === 0) && (
              <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
              }}>
                <div style={{ width: '100%', maxWidth: '500px' }}>
                  <Card 
                    style={{ 
                      textAlign: 'center',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      borderRadius: '12px'
                    }}
                  >
                    <Alert
                      message="页面异常"
                      description="请刷新页面重新开始"
                      type="warning"
                      showIcon
                      action={
                        <Button 
                          type="primary" 
                          onClick={() => window.location.reload()}
                          style={{ borderRadius: '6px' }}
                        >
                          刷新页面
                        </Button>
                      }
                    />
                  </Card>
                </div>
              </div>
            )}
            
            {/* 考试步骤异常：应该有题目但没有题目 */}
            {currentStep === 'exam' && (!exam.questions || exam.questions.length === 0) && (
              <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
              }}>
                <div style={{ width: '100%', maxWidth: '500px' }}>
                  <Card 
                    style={{ 
                      textAlign: 'center',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      borderRadius: '12px'
                    }}
                  >
                    <Alert
                      message="考试数据异常"
                      description="未找到考试题目，请刷新页面重试"
                      type="error"
                      showIcon
                      action={
                        <Button 
                          type="primary" 
                          onClick={() => window.location.reload()}
                          style={{ borderRadius: '6px' }}
                        >
                          刷新页面
                        </Button>
                      }
                    />
                  </Card>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
};

export default StudentExam;