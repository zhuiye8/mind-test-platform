import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, message, Space, Divider } from 'antd';
import { UserOutlined, LockOutlined, HeartOutlined, SafetyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { setAuthToken, setTeacherInfo } from '../utils/auth';
import type { LoginForm } from '../types';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [currentFeature, setCurrentFeature] = useState(0);
  const navigate = useNavigate();
  const [form] = Form.useForm();

  // 功能特性列表
  const features = [
    {
      icon: <HeartOutlined style={{ color: 'var(--color-secondary-500)' }} />,
      title: '专业心理测评',
      description: '科学专业的心理测试工具'
    },
    {
      icon: <SafetyOutlined style={{ color: 'var(--color-primary-500)' }} />,
      title: '数据安全保障',
      description: '严格保护学生隐私信息'
    },
    {
      icon: <ThunderboltOutlined style={{ color: 'var(--color-accent-500)' }} />,
      title: '智能分析报告',
      description: '自动生成详细分析报告'
    }
  ];

  // 轮播功能特性
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFeature((prev) => (prev + 1) % features.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (values: LoginForm) => {
    try {
      setLoading(true);
      
      const response = await authApi.login(values);
      
      if (response.success && response.data) {
        // 存储登录信息
        setAuthToken(response.data.token);
        setTeacherInfo(response.data.teacher);
        
        message.success('登录成功！');
        navigate('/dashboard');
      } else {
        message.error(response.error || '登录失败，请检查用户名和密码');
      }
    } catch (error: any) {
      console.error('登录错误:', error);
      const errorMessage = error.response?.data?.error || '登录失败，请检查网络连接';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* 左侧装饰区域 */}
      <div 
        className="hidden lg:flex lg:flex-1 relative overflow-hidden"
        style={{
          background: `
            linear-gradient(135deg, 
              rgba(79, 70, 229, 0.9) 0%, 
              rgba(16, 185, 129, 0.8) 50%, 
              rgba(79, 70, 229, 0.9) 100%
            ),
            radial-gradient(circle at 30% 20%, rgba(79, 70, 229, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 70% 80%, rgba(16, 185, 129, 0.3) 0%, transparent 50%)
          `,
        }}
      >
        {/* 装饰性几何图形 */}
        <div className="absolute inset-0 overflow-hidden">
          <div 
            className="absolute -top-10 -left-10 w-40 h-40 rounded-full opacity-20"
            style={{ background: 'var(--gradient-secondary)' }}
          />
          <div 
            className="absolute top-1/3 -right-20 w-60 h-60 rounded-full opacity-15"
            style={{ background: 'var(--gradient-primary)' }}
          />
          <div 
            className="absolute bottom-20 left-1/4 w-32 h-32 rounded-full opacity-25"
            style={{ background: 'var(--gradient-accent)' }}
          />
        </div>

        {/* 内容区域 */}
        <div className="relative z-10 flex flex-col justify-center px-16 py-12">
          <div className="animate-fadeIn">
            <Title 
              level={1} 
              className="text-white mb-6"
              style={{ 
                fontSize: '3.5rem', 
                fontWeight: 'var(--font-weight-bold)',
                lineHeight: '1.2',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
            >
              心理测试平台
            </Title>
            <Text 
              className="text-white text-xl mb-12 block"
              style={{ 
                opacity: 0.9,
                lineHeight: '1.6',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
              }}
            >
              专业的校园心理健康测评与管理系统
              <br />
              科学测评 · 智能分析 · 安全保障
            </Text>

            {/* 功能特性轮播 */}
            <div className="bg-white bg-opacity-20 backdrop-blur-md rounded-2xl p-8 transition-all duration-500">
              <Space align="start" size={16}>
                <div 
                  className="flex items-center justify-center w-16 h-16 rounded-xl transition-all duration-300"
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(8px)'
                  }}
                >
                  <span style={{ fontSize: '28px' }}>
                    {features[currentFeature].icon}
                  </span>
                </div>
                <div className="flex-1">
                  <Title level={4} className="text-white mb-2" style={{ margin: 0 }}>
                    {features[currentFeature].title}
                  </Title>
                  <Text className="text-white" style={{ opacity: 0.8, fontSize: '16px' }}>
                    {features[currentFeature].description}
                  </Text>
                </div>
              </Space>

              {/* 指示器 */}
              <div className="flex justify-center mt-6 gap-2">
                {features.map((_, index) => (
                  <div
                    key={index}
                    className="w-2 h-2 rounded-full transition-all duration-300 cursor-pointer"
                    style={{
                      background: index === currentFeature 
                        ? 'rgba(255, 255, 255, 0.8)' 
                        : 'rgba(255, 255, 255, 0.3)'
                    }}
                    onClick={() => setCurrentFeature(index)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧登录区域 */}
      <div className="flex-1 lg:max-w-lg flex items-center justify-center p-8 bg-secondary">
        <div className="w-full max-w-md">
          <Card style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div className="text-center mb-8">
              <div 
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <UserOutlined className="text-white text-2xl" />
              </div>
              <Title level={2} className="mb-2" style={{ color: 'var(--color-neutral-800)' }}>
                教师登录
              </Title>
              <Text type="secondary" className="text-base">
                欢迎回到心理测试管理系统
              </Text>
            </div>

            <Form
              form={form}
              name="login"
              onFinish={handleLogin}
              autoComplete="off"
              layout="vertical"
              size="large"
              className="space-y-4"
            >
              <Form.Item
                label="教师工号"
                name="teacher_id"
                rules={[
                  { required: true, message: '请输入教师工号' },
                  { min: 3, message: '教师工号至少3位' }
                ]}
              >
                <Input
                  prefix={<UserOutlined style={{ color: 'var(--color-neutral-400)' }} />}
                  placeholder="请输入您的教师工号"
                  autoComplete="username"
                />
              </Form.Item>

              <Form.Item
                label="登录密码"
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码至少6位' }
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: 'var(--color-neutral-400)' }} />}
                  placeholder="请输入您的登录密码"
                  autoComplete="current-password"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  style={{
                    marginTop: 24,
                    height: 48,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  {loading ? (
                    <Space>
                      <span>登录中</span>
                    </Space>
                  ) : (
                    '立即登录'
                  )}
                </Button>
              </Form.Item>
            </Form>

            <Divider style={{ margin: 'var(--spacing-6) 0 var(--spacing-4) 0' }}>
              <Text type="secondary" className="text-xs">
                安全提示
              </Text>
            </Divider>

            <div className="text-center space-y-2">
              <Text type="secondary" className="text-xs block">
                <SafetyOutlined className="mr-1" />
                请保护好您的账号信息，定期更换密码
              </Text>
              <Text type="secondary" className="text-xs block">
                系统会自动记录登录日志，确保账户安全
              </Text>
            </div>

            <div className="text-center mt-8 pt-4 border-t border-neutral-100">
              <Text type="secondary" className="text-xs">
                心理测试平台 V1.0 · 为校园心理健康护航
              </Text>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Login;