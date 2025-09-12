import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Modal, App, Row, Col, Progress,Divider,Space } from 'antd';
import { 
  RocketOutlined, 
  LockOutlined, 
  HeartOutlined, 
  StarOutlined, 
  BulbOutlined,
  SecurityScanOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
// 使用全新设备连接页面
import { DeviceCheckPage } from '../DeviceCheck';
import { enhancedPublicApi } from '../../services/enhancedPublicApi';
import type { Question } from '../../types';
import { 
  gradientThemes, 
  cardStyles, 
  buttonStyles, 
  inputStyles, 
  createIconContainerStyle 
} from './ParticipantExam.styles';

const { Title, Text, Paragraph } = Typography;
const { Password } = Input;

export interface ExamInfo {
  id: string;
  title: string;
  description?: string;
  duration_minutes: number;
  password_required: boolean;
  questions?: Question[];
  shuffle_questions: boolean;
  allow_empty_answers?: boolean;
  required_questions?: string[];
}

export interface ParticipantInfo {
  participantId: string;
  participantName: string;
}

export type ExamStep = 'password' | 'info' | 'device-test' | 'description' | 'exam' | 'completed';

interface ExamStateManagerProps {
  currentStep: ExamStep;
  setCurrentStep: (step: ExamStep) => void;
  exam: ExamInfo | null;
  setExam: (exam: ExamInfo | null) => void;
  participantInfo: ParticipantInfo | null;
  setParticipantInfo: (info: ParticipantInfo | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  onExamStart: () => void;
  // 向父组件上报设备连接结果（用于提交时附带）
  onDeviceTestComplete?: (results: any) => void;
}

const ExamStateManager: React.FC<ExamStateManagerProps> = ({
  currentStep,
  setCurrentStep,
  exam,
  setExam,
  participantInfo,
  setParticipantInfo,
  loading,
  setLoading,
  onExamStart,
  onDeviceTestComplete
}) => {
  const { message } = App.useApp();
  const { examUuid } = useParams<{ examUuid: string }>();
  const navigate = useNavigate();
  
  // 步骤历史追踪，用于正确的返回上一步功能
  const [stepHistory, setStepHistory] = useState<ExamStep[]>([]);

  // 加载考试信息
  const loadExamInfo = async () => {
    if (!examUuid) {
      message.error('考试链接无效');
      navigate('/');
      return;
    }

    try {
      setLoading(true);
      const response = await enhancedPublicApi.getExam(examUuid);
      
      if (response.success && response.data) {
        setExam(response.data);
        
        // 如果考试不需要密码，直接进入信息填写步骤
        // 需求调整：设备连接应在信息填写之后
        if (!response.data.password_required) {
          setCurrentStepWithHistory('info');
        } else {
          setCurrentStepWithHistory('password');
        }
      } else {
        throw new Error(response.error?.toString() || '考试信息获取失败');
      }
    } catch (error) {
      console.error('加载考试失败:', error);
      message.error('考试不存在或已结束');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  // 密码验证
  const handlePasswordSubmit = async (values: { password: string }) => {
    if (!examUuid) {
      message.error('考试链接无效');
      return;
    }

    try {
      setLoading(true);
      const response = await enhancedPublicApi.verifyPassword(examUuid, values.password);
      
      if (response.success && response.data) {
        // 验证成功后，后端已返回完整的考试信息（含题目），直接写入状态
        setExam(response.data as ExamInfo);
        // 需求调整：密码通过后进入信息填写步骤
        setCurrentStepWithHistory('info');
        message.success('密码验证成功');
      } else {
        message.error(response.error?.toString() || '密码验证失败');
      }
    } catch (error) {
      console.error('密码验证失败:', error);
      message.error('密码验证失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 参与者信息提交
  const handleParticipantInfoSubmit = async (values: ParticipantInfo) => {
    setLoading(true);
    try {
      // 检查是否已经提交过（如果不允许多次提交）
      if (!exam?.allowMultipleSubmissions) {
        console.log('检查重复提交...', { examUuid, participantId: values.participantId });
        const duplicateCheck = await enhancedPublicApi.checkDuplicateSubmission(
          examUuid!, 
          values.participantId
        );
        
        console.log('重复检查响应:', duplicateCheck);
        const canSubmit = duplicateCheck.data?.can_submit ?? duplicateCheck.data?.canSubmit;
        if (!duplicateCheck.success || !canSubmit) {
          // 显示友好的提示
          Modal.warning({
            title: '您已参加过此考试',
            content: (
              <div>
                <p>检测到您（学号：<strong>{values.participantId}</strong>）已经提交过本次考试。</p>
                <p>本考试不允许重复参加。</p>
                <p style={{ marginTop: 16, color: '#666' }}>
                  如有疑问，请联系监考老师。
                </p>
              </div>
            ),
            okText: '我知道了',
            centered: true,
          });
          return; // 阻止继续
        }
      }
      
      // 原有逻辑：保存信息
      setParticipantInfo(values);
      localStorage.setItem('participantInfo', JSON.stringify(values));
      message.success('参与者信息已验证');
      // 进入设备连接步骤（信息填写之后）
      setCurrentStepWithHistory('device-test');
      
    } catch (error: any) {
      console.error('验证参与者信息失败:', error);
      message.error(error.message || '验证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 设备测试结果
  const [deviceTestResults, setDeviceTestResults] = useState({
    cameraPermission: false,
    microphonePermission: false,
    testPassed: false
  });

  // 设备测试完成处理
  const handleDeviceTestComplete = (results: any) => {
    // 设备测试完成后，保存结果并进入说明/考试步骤
    setDeviceTestResults(results);
    // 上报给父组件（用于提交时附带）
    onDeviceTestComplete?.(results);
    message.success('设备连接完成');
    
    // 如果有考试说明，进入说明页；否则直接开始考试
    if (exam?.description) {
      setCurrentStepWithHistory('description');
    } else {
      handleStartExam();
    }
  };
  
  // 跳过设备测试
  const handleDeviceTestSkip = () => {
    // 跳过设备连接：允许进入说明/考试，但给予提示
    message.info('已跳过设备连接');
    // 上报跳过信息（最小结果集）
    onDeviceTestComplete?.({ cameraPermission: false, microphonePermission: false, testPassed: false, skipped: true });
    if (exam?.description) {
      setCurrentStepWithHistory('description');
    } else {
      handleStartExam();
    }
  };

  // 步骤切换带历史记录的包装函数
  const setCurrentStepWithHistory = useCallback((newStep: ExamStep) => {
    setStepHistory(prev => {
      // 避免重复添加相同步骤到历史中
      if (prev.length === 0 || prev[prev.length - 1] !== currentStep) {
        return [...prev, currentStep];
      }
      return prev;
    });
    setCurrentStep(newStep);
    console.log(`步骤切换: ${currentStep} -> ${newStep}`);
  }, [currentStep, setCurrentStep]);

  // 返回上一步的功能
  const goToPreviousStep = useCallback(() => {
    if (stepHistory.length > 0) {
      const previousStep = stepHistory[stepHistory.length - 1];
      setStepHistory(prev => prev.slice(0, -1)); // 移除最后一个历史记录
      setCurrentStep(previousStep);
      console.log(`返回上一步: ${currentStep} -> ${previousStep}`);
    } else {
      console.warn('没有可返回的历史步骤');
    }
  }, [stepHistory, currentStep, setCurrentStep]);

  // 开始考试
  const handleStartExam = () => {
    setCurrentStepWithHistory('exam');
    onExamStart();
  };

  // 加载考试信息
  useEffect(() => {
    loadExamInfo();
  }, [examUuid]);

  // 恢复参与者信息
  useEffect(() => {
    const savedInfo = localStorage.getItem('participantInfo');
    if (savedInfo && !participantInfo) {
      try {
        setParticipantInfo(JSON.parse(savedInfo));
      } catch (error) {
        console.error('恢复参与者信息失败:', error);
      }
    }
  }, []);

  if (loading || !exam) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <div className="text-center py-8">
            <Typography.Text>加载考试信息中...</Typography.Text>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* 密码验证步骤 */}
      {currentStep === 'password' && (
        <div
          style={{
            minHeight: '100vh',
            background: `
              linear-gradient(135deg, rgba(59,130,246,0.06), rgba(99,102,241,0.05)),
              radial-gradient(circle at 30% 20%, rgba(99,102,241,0.12) 0%, transparent 60%),
              radial-gradient(circle at 70% 80%, rgba(59,130,246,0.12) 0%, transparent 60%)
            `,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
        >
          <div style={{ width: '100%', maxWidth: 520 }}>
            <Card
              style={{
                borderRadius: 24,
                boxShadow: '0 20px 40px rgba(0,0,0,0.08), 0 8px 16px rgba(0,0,0,0.04)',
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(20px)'
              }}
              bodyStyle={{ padding: 40 }}
            >
              {/* 图标区域 */}
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={createIconContainerStyle('#4F46E5', '#10B981')}>
                  <SecurityScanOutlined style={{ fontSize: 36, color: 'white' }} />
                </div>
                <Title level={2} style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 700 }}>
                  {exam.title}
                </Title>
                <Text type="secondary" style={{ fontSize: 16, lineHeight: 1.5 }}>
                  🔐 安全验证，请输入考试密码开始答题
                </Text>
              </div>

              <Form onFinish={handlePasswordSubmit} layout="vertical" size="large">
                <Form.Item
                  name="password"
                  rules={[{ required: true, message: '请输入考试密码' }]}
                >
                  <Password 
                    placeholder="请输入考试密码" 
                    style={{
                      ...inputStyles.standard,
                      fontSize: 16
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
                    loading={loading}
                    style={{
                      ...buttonStyles.primary,
                      background: 'linear-gradient(135deg, #4F46E5 0%, #10B981 100%)',
                      boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
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
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <ThunderboltOutlined />
                      验证密码
                    </span>
                  </Button>
                </Form.Item>
              </Form>
              
              {/* 底部提示 */}
              <div style={{ 
                textAlign: 'center', 
                marginTop: 24, 
                padding: 16,
                background: 'rgba(79, 70, 229, 0.05)',
                borderRadius: 12,
                border: '1px solid rgba(79, 70, 229, 0.1)'
              }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  <BulbOutlined style={{ marginRight: 6, color: '#4F46E5' }} />
                  请联系老师获取考试密码，密码区分大小写
                </Text>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 参与者信息录入步骤 */}
      {currentStep === 'info' && (
        <div style={{
          minHeight: '100vh',
          background: gradientThemes.info,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}>
          <div style={{
            width: '100%',
            maxWidth: 520,
            animation: 'fadeInUp 0.6s ease-out 0.2s both'
          }}>
            <Card 
              style={cardStyles.modern}
              styles={{ body: { padding: 40 } }}
            >
              {/* 头部区域 */}
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={createIconContainerStyle('#10B981', '#F59E0B')}>
                  <RocketOutlined style={{ fontSize: 36, color: 'white' }} />
                </div>
                <Title level={2} style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 700 }}>
                  {exam.title}
                </Title>
                <Text type="secondary" style={{ fontSize: 16, lineHeight: 1.5 }}>
                  📝 准备开始心理测试，请先填写基本信息
                </Text>
              </div>

              {/* 考试信息卡片 */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(245, 158, 11, 0.05))',
                borderRadius: 16,
                padding: 20,
                marginBottom: 32,
                border: '1px solid rgba(16, 185, 129, 0.15)'
              }}>
                <Row gutter={[16, 12]}>
                  <Col span={12}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 'bold', color: '#10B981', marginBottom: 4 }}>
                        {exam.questions?.length || 0}
                      </div>
                      <Text type="secondary" style={{ fontSize: 13 }}>题目数量</Text>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 'bold', color: '#F59E0B', marginBottom: 4 }}>
                        {exam.duration_minutes}
                      </div>
                      <Text type="secondary" style={{ fontSize: 13 }}>限时(分钟)</Text>
                    </div>
                  </Col>
                </Row>
                
                <Divider style={{ margin: '16px 0' }} />
                
                <div style={{ fontSize: 13, lineHeight: 1.6, color: '#6B7280' }}>
                  <div style={{ marginBottom: 6 }}>
                    <HeartOutlined style={{ color: '#10B981', marginRight: 6 }} />
                    请如实填写个人信息和答题内容
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <StarOutlined style={{ color: '#F59E0B', marginRight: 6 }} />
                    答案会自动保存，请安心作答
                  </div>
                  <div>
                    <BulbOutlined style={{ color: '#4F46E5', marginRight: 6 }} />
                    提交后无法修改，请仔细检查
                  </div>
                </div>
              </div>

              <Form
                onFinish={handleParticipantInfoSubmit}
                layout="vertical"
                size="large"
                initialValues={participantInfo || undefined}
              >
                <Form.Item
                  name="participantId"
                  label={<Text strong style={{ fontSize: 15 }}>学号/ID</Text>}
                  rules={[{ required: true, message: '请输入您的学号或ID' }]}
                >
                  <Input 
                    placeholder="请输入您的学号或ID" 
                    style={inputStyles.standard}
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
                  name="participantName"
                  label={<Text strong style={{ fontSize: 15 }}>姓名</Text>}
                  rules={[{ required: true, message: '请输入您的姓名' }]}
                >
                  <Input 
                    placeholder="请输入您的真实姓名" 
                    style={inputStyles.standard}
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

                {/* 集成的设备连接区域 (可选) */}
                
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    block
                    style={{
                      ...buttonStyles.primary,
                      background: 'linear-gradient(135deg, #10B981 0%, #F59E0B 100%)',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                    }}
                  >
                    <Space>
                      <RocketOutlined />
                      开始考试
                    </Space>
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </div>
        </div>
      )}

      {/* 设备连接步骤（重写版） */}
      {currentStep === 'device-test' && (
        <DeviceCheckPage
          onComplete={handleDeviceTestComplete}
          onSkip={handleDeviceTestSkip}
        />
      )}

      {/* 试卷描述步骤 */}
      {currentStep === 'description' && exam.description && (
        <div style={{
          minHeight: '100vh',
          background: gradientThemes.info,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}>
          <div style={{
            width: '100%',
            maxWidth: 720,
            animation: 'fadeInUp 0.6s ease-out 0.3s both'
          }}>
            <Card 
              style={cardStyles.modern}
              styles={{ body: { padding: 48 } }}
            >
              {/* 头部区域 */}
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <div style={createIconContainerStyle('#F59E0B', '#4F46E5')}>
                  <BulbOutlined style={{ fontSize: 36, color: 'white' }} />
                </div>
                <Title level={2} style={{ margin: '0 0 8px 0', fontSize: 24, fontWeight: 700 }}>
                  考试说明
                </Title>
                <Text type="secondary" style={{ fontSize: 16, lineHeight: 1.5 }}>
                  📜 请仔细阅读以下内容，了解测试规则和注意事项
                </Text>
              </div>

              {/* 说明内容 */}
              <div style={{
                background: 'rgba(245, 158, 11, 0.05)',
                borderRadius: 16,
                padding: 24,
                marginBottom: 32,
                border: '1px solid rgba(245, 158, 11, 0.1)',
                fontSize: 16,
                lineHeight: 1.8
              }}>
                {exam.description}
              </div>

              {/* 提示信息 */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.05)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 32,
                border: '1px solid rgba(59, 130, 246, 0.1)'
              }}>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: '#6B7280' }}>
                  <div style={{ marginBottom: 8 }}>
                    <CheckCircleOutlined style={{ color: '#10B981', marginRight: 6 }} />
                    请确保您已仔细阅读上述说明内容
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <ClockCircleOutlined style={{ color: '#F59E0B', marginRight: 6 }} />
                    测试开始后将自动计时，请合理安排答题时间
                  </div>
                  <div>
                    <HeartOutlined style={{ color: '#EF4444', marginRight: 6 }} />
                    请诚实作答，测试结果仅用于心理健康评估
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                <Button 
                  size="large"
                  onClick={goToPreviousStep}
                  disabled={stepHistory.length === 0}
                  style={{
                    ...buttonStyles.navigation,
                    fontSize: 16
                  }}
                >
                  <ArrowLeftOutlined />
                  返回上一步
                </Button>
                <Button 
                  type="primary" 
                  size="large"
                  onClick={handleStartExam}
                  style={{ 
                    ...buttonStyles.primary,
                    minWidth: 160,
                    background: 'linear-gradient(135deg, #F59E0B 0%, #4F46E5 100%)',
                    boxShadow: '0 6px 16px rgba(245, 158, 11, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(245, 158, 11, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.3)';
                  }}
                >
                  <Space>
                    <RocketOutlined />
                    开始答题
                  </Space>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

    </>
  );
};

export default ExamStateManager;
