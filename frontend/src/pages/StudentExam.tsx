import React, { useState, useEffect } from 'react';
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
} from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { Question } from '../types';
import { publicApi } from '../services/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// 模拟的公开API接口（实际应该从后端获取）
interface ExamInfo {
  id: string;
  title: string;
  duration_minutes: number;
  password_required: boolean; // 修复字段名，与后端API保持一致
  questions?: Question[]; // questions字段可能为undefined（需要密码时不返回）
  shuffle_questions: boolean;
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

  // 题目条件逻辑判断
  const shouldShowQuestion = (question: Question): boolean => {
    if (!question.display_condition) return true;
    
    const condition = question.display_condition as { question_id: string; selected_option: string };
    return answers[condition.question_id] === condition.selected_option;
  };

  // 获取当前可见的题目列表
  const getVisibleQuestions = (): Question[] => {
    if (!exam || !exam.questions) return [];
    return exam.questions.filter(shouldShowQuestion);
  };

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
      
      // 验证必答题
      const visibleQuestions = getVisibleQuestions();
      const unansweredRequired = visibleQuestions.filter(q => 
        !answers[q.id] || (Array.isArray(answers[q.id]) && answers[q.id].length === 0)
      );

      if (!isTimeout && unansweredRequired.length > 0) {
        modal.confirm({
          title: '还有题目未完成',
          content: `还有 ${unansweredRequired.length} 道题目未回答，确定要提交吗？`,
          onOk: () => submitToServer(),
          okText: '确定提交',
          cancelText: '继续答题',
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

  // 渲染题目组件
  const renderQuestion = (question: Question) => {
    const value = answers[question.id];

    switch (question.question_type) {
      case 'single_choice':
        return (
          <Radio.Group
            value={value}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {Object.entries(question.options).map(([key, text]) => (
                <Radio key={key} value={key} style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <span style={{ marginLeft: 8 }}>{text}</span>
                </Radio>
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
            <Space direction="vertical" style={{ width: '100%' }}>
              {Object.entries(question.options).map(([key, text]) => (
                <Checkbox key={key} value={key} style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <span style={{ marginLeft: 8 }}>{text}</span>
                </Checkbox>
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
            rows={4}
            maxLength={500}
            showCount
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
        background: '#f0f2f5'
      }}>
        <Spin size="large" />
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
        background: '#f0f2f5'
      }}>
        <Card style={{ width: 400 }}>
          <Empty
            description="考试不存在或已结束"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" onClick={() => navigate('/')}>
              返回首页
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  const visibleQuestions = getVisibleQuestions();
  const currentQuestion = visibleQuestions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / visibleQuestions.length) * 100;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* 重要：必须添加contextHolder才能显示Modal */}
      {contextHolder}
      
      {/* 密码验证步骤 */}
      {currentStep === 'password' && exam && (
          <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: window.innerWidth < 768 ? '16px' : '20px'
          }}>
            <div style={{
              width: '100%',
              maxWidth: '400px',
              margin: '0 auto'
            }}>
              <Card 
                title={
                  <div style={{ 
                    textAlign: 'center', 
                    fontSize: window.innerWidth < 768 ? '16px' : '18px', 
                    fontWeight: '600' 
                  }}>
                    🔐 {exam.title}
                  </div>
                } 
                style={{ 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  borderRadius: '12px'
                }}
                bodyStyle={{ padding: window.innerWidth < 768 ? '20px' : '24px' }}
              >
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <Text type="secondary">请输入考试密码开始答题</Text>
                </div>
                <Form onFinish={handlePasswordSubmit} layout="vertical">
                  <Form.Item
                    name="password"
                    rules={[{ required: true, message: '请输入考试密码' }]}
                  >
                    <Input.Password 
                      placeholder="请输入考试密码" 
                      size="large"
                      style={{ borderRadius: '8px' }}
                    />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button 
                      type="primary" 
                      htmlType="submit" 
                      block 
                      size="large"
                      style={{ 
                        borderRadius: '8px',
                        height: window.innerWidth < 768 ? '44px' : '48px',
                        fontSize: window.innerWidth < 768 ? '15px' : '16px',
                        fontWeight: '600'
                      }}
                    >
                      验证密码
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            </div>
          </div>
        )}

      {/* 学生信息录入步骤 */}
      {currentStep === 'info' && exam && (
          <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: window.innerWidth < 768 ? '16px' : '20px'
          }}>
            <div style={{
              width: '100%',
              maxWidth: window.innerWidth < 768 ? '100%' : '500px',
              margin: '0 auto'
            }}>
              <Card 
                title={
                  <div style={{ 
                    textAlign: 'center', 
                    fontSize: window.innerWidth < 768 ? '18px' : '20px', 
                    fontWeight: '600' 
                  }}>
                    📝 {exam.title}
                  </div>
                } 
                style={{ 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  borderRadius: '12px'
                }}
                bodyStyle={{ padding: window.innerWidth < 768 ? '20px' : '24px' }}
              >
                <Alert
                  message="考试说明"
                  description={
                    <div>
                      <p>• 本次考试共 <strong>{exam.questions?.length || 0}</strong> 道题目，限时 <strong>{exam.duration_minutes}</strong> 分钟</p>
                      <p>• 请如实填写个人信息和答题内容</p>
                      <p>• 答案会自动保存，请安心作答</p>
                      <p>• 提交后无法修改，请仔细检查</p>
                    </div>
                  }
                  type="info"
                  style={{ marginBottom: 24, borderRadius: '8px' }}
                />

                <Form
                  onFinish={handleStudentInfoSubmit}
                  layout="vertical"
                  initialValues={studentInfo || undefined}
                >
                  <Form.Item
                    name="student_id"
                    label="学号/ID"
                    rules={[{ required: true, message: '请输入您的学号或ID' }]}
                  >
                    <Input 
                      placeholder="请输入您的学号或ID" 
                      size="large"
                      style={{ borderRadius: '8px' }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="student_name"
                    label="姓名"
                    rules={[{ required: true, message: '请输入您的姓名' }]}
                  >
                    <Input 
                      placeholder="请输入您的姓名" 
                      size="large"
                      style={{ borderRadius: '8px' }}
                    />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button 
                      type="primary" 
                      htmlType="submit" 
                      block 
                      size="large"
                      style={{ 
                        borderRadius: '8px',
                        height: '48px',
                        fontSize: '16px',
                        fontWeight: '600',
                        marginTop: '8px'
                      }}
                    >
                      🚀 开始答题
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            </div>
          </div>
        )}

      {/* 考试答题步骤 */}
      {currentStep === 'exam' && exam && exam.questions && currentQuestion && (
          <div style={{ padding: '20px 0' }}>
            <div style={{ 
              maxWidth: window.innerWidth < 768 ? '100%' : '800px', 
              margin: '0 auto',
              padding: '0 16px'
            }}>
            {/* 顶部状态栏 */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>{exam.title}</Text>
                  <Text type="secondary" style={{ marginLeft: 16 }}>
                    {studentInfo?.student_name} ({studentInfo?.student_id})
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <Space>
                    <ClockCircleOutlined style={{ color: timeRemaining < 300 ? '#ff4d4f' : '#1890ff' }} />
                    <Text strong style={{ color: timeRemaining < 300 ? '#ff4d4f' : '#1890ff' }}>
                      {formatTime(timeRemaining)}
                    </Text>
                  </Space>
                  <Button
                    type="primary"
                    danger
                    icon={<SendOutlined />}
                    onClick={() => handleSubmitExam()}
                    loading={submitting}
                  >
                    提交考试
                  </Button>
                </div>
              </div>
            </Card>

            {/* 进度条 */}
            <Card style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <Text>答题进度: {currentQuestionIndex + 1} / {visibleQuestions.length}</Text>
              </div>
              <Progress percent={progress} showInfo={false} />
            </Card>

            {/* 当前题目 */}
            <Card>
              <div style={{ marginBottom: 24 }}>
                <Title level={4}>
                  第 {currentQuestionIndex + 1} 题
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 14, fontWeight: 'normal' }}>
                    ({currentQuestion.question_type === 'single_choice' ? '单选题' : 
                      currentQuestion.question_type === 'multiple_choice' ? '多选题' : '文本题'})
                  </Text>
                </Title>
                <Paragraph style={{ fontSize: 16, lineHeight: 1.6 }}>
                  {currentQuestion.title}
                </Paragraph>
              </div>

              <div style={{ marginBottom: 32 }}>
                {renderQuestion(currentQuestion)}
              </div>

              <Divider />

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                >
                  上一题
                </Button>
                
                <Space>
                  {visibleQuestions.map((_, index) => (
                    <Button
                      key={index}
                      type={index === currentQuestionIndex ? 'primary' : 'default'}
                      size="small"
                      onClick={() => setCurrentQuestionIndex(index)}
                      icon={answers[visibleQuestions[index].id] ? <CheckCircleOutlined /> : null}
                    >
                      {index + 1}
                    </Button>
                  ))}
                </Space>

                <Button
                  type="primary"
                  disabled={currentQuestionIndex === visibleQuestions.length - 1}
                  onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                >
                  下一题
                </Button>
              </div>
            </Card>
            </div>
          </div>
        )}

      {/* 完成步骤 */}
      {currentStep === 'completed' && (
          <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: window.innerWidth < 768 ? '16px' : '20px'
          }}>
            <div style={{
              width: '100%',
              maxWidth: window.innerWidth < 768 ? '100%' : '500px',
              margin: '0 auto'
            }}>
              <Card 
                style={{ 
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  borderRadius: '12px'
                }}
                bodyStyle={{ padding: window.innerWidth < 768 ? '32px 20px' : '40px 24px' }}
              >
                <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 24 }} />
                <Title level={2} style={{ marginBottom: '16px' }}>提交成功！</Title>
                <Paragraph type="secondary" style={{ fontSize: 16, marginBottom: 32, lineHeight: '1.6' }}>
                  感谢您参与本次心理测试，您的答案已成功提交。
                  <br />
                  测试结果将由专业人员进行分析，如有需要会及时与您联系。
                </Paragraph>
                <Button 
                  type="primary" 
                  size="large" 
                  onClick={() => navigate('/')}
                  style={{ 
                    borderRadius: '8px',
                    height: '48px',
                    fontSize: '16px',
                    fontWeight: '600'
                  }}
                >
                  返回首页
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
                padding: window.innerWidth < 768 ? '16px' : '20px'
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
                padding: window.innerWidth < 768 ? '16px' : '20px'
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