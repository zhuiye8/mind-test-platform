import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Space, Divider, Alert, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined, ThunderboltOutlined, HeartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { setAuthToken, setTeacherInfo } from '../utils/auth';
import type { LoginForm } from '../types';

const { Title, Text, Paragraph } = Typography;

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const handleLogin = async (values: LoginForm) => {
    setLoading(true);
    setError(null); // 重置错误信息

    try {
      const response = await authApi.login(values);

      if (response.success && response.data) {
        setAuthToken(response.data.token);
        setTeacherInfo(response.data.teacher);
        message.success('登录成功！即将跳转到仪表盘...');
        navigate('/dashboard');
      } else {
        // 后端验证失败，但请求成功
        setError(response.error || '登录失败，请检查您的凭据。');
      }
    } catch (err: any) {
      console.error('登录请求失败:', err);
      // 网络错误或其他异常
      const errorMessage = err.response?.data?.error || '网络错误，请稍后重试。';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center flex flex-col lg:flex-row"
      style={{ backgroundImage: 'url(/assets/login-bg.jpeg)' }}
    >
      <div className="absolute inset-0 bg-black/50"></div>

      {/* 左侧品牌宣传区域 */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center text-center p-8 lg:p-12 relative">
        <div className="relative z-10 text-white animate-fadeIn">
          <Title level={1} className="text-white mb-4" style={{ fontSize: '3rem', fontWeight: 'bold' }}>
            心理测评云平台
          </Title>
          <Paragraph className="text-gray-200 text-lg mb-8">
            为校园心理健康保驾护航，提供科学、专业、高效的心理测评服务。
          </Paragraph>
          <div className="space-y-6 mt-12 backdrop-blur-sm bg-white/10 p-8 rounded-2xl border border-white/20">
            <FeatureItem
              icon={<HeartOutlined />}
              title="科学测评体系"
              description="内置多种权威量表，确保测评结果的准确性和有效性。"
            />
            <FeatureItem
              icon={<ThunderboltOutlined />}
              title="即时数据分析"
              description="自动化数据处理与分析，生成多维度、可视化的分析报告。"
            />
            <FeatureItem
              icon={<SafetyOutlined />}
              title="数据安全保障"
              description="银行级数据加密，全面保障师生信息与测评数据的隐私安全。"
            />
          </div>
        </div>
      </div>

      {/* 右侧登录表单区域 */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
        <div className="w-full max-w-md">
          <Card
            bordered={false}
            className="shadow-2xl rounded-2xl"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <div className="text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4"
              >
                <UserOutlined className="text-white text-3xl" />
              </div>
              <Title level={2} className="text-white">
                教师登录
              </Title>
              <Text className="text-gray-300">
                欢迎回来！请输入您的凭据。
              </Text>
            </div>

            <Form
              form={form}
              name="login"
              onFinish={handleLogin}
              autoComplete="off"
              layout="vertical"
              size="large"
            >
              {error && (
                <Form.Item>
                  <Alert
                    message={error}
                    type="error"
                    showIcon
                    closable
                    onClose={() => setError(null)}
                    style={{ background: 'rgba(239, 68, 68, 0.2)', border: 'none' }}
                    className="text-white"
                  />
                </Form.Item>
              )}

              <Form.Item
                label={<span className="text-gray-200">教师工号</span>}
                name="teacher_id"
                rules={[
                  { required: true, message: '请输入您的教师工号' },
                  { min: 3, message: '工号至少为3位' },
                ]}
              >
                <Input
                  prefix={<UserOutlined className="site-form-item-icon text-gray-400" />}
                  placeholder="教师工号"
                  className="!bg-white/10 !text-white placeholder:!text-gray-400 !border-white/20"
                />
              </Form.Item>

              <Form.Item
                label={<span className="text-gray-200">密码</span>}
                name="password"
                rules={[
                  { required: true, message: '请输入您的密码' },
                  { min: 6, message: '密码至少为6位' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined className="site-form-item-icon text-gray-400" />}
                  placeholder="密码"
                  className="!bg-white/10 !text-white placeholder:!text-gray-400 !border-white/20"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  className="mt-4 !bg-primary-500 hover:!bg-primary-600 !border-none"
                  style={{ height: '48px', fontSize: '16px' }}
                >
                  {loading ? '正在登录...' : '立即登录'}
                </Button>
              </Form.Item>
            </Form>

            <Divider>
              <Text className="text-xs text-gray-400">安全提示</Text>
            </Divider>

            <Text className="text-center block text-xs text-gray-400">
              <SafetyOutlined className="mr-1" />
              请妥善保管您的账户信息，切勿泄露给他人。
            </Text>
          </Card>
          <div className="text-center mt-8">
            <Text className="text-xs text-gray-400">
              © 2024 心理测评云平台. All Rights Reserved.
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
};


// 左侧特性项组件
const FeatureItem: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
  <div className="flex items-start text-left">
    <div className="flex-shrink-0">
      <div className="flex items-center justify-center h-12 w-12 rounded-full bg-white bg-opacity-20 text-white text-2xl">
        {icon}
      </div>
    </div>
    <div className="ml-4">
      <p className="font-semibold text-lg">{title}</p>
      <p className="text-gray-100">{description}</p>
    </div>
  </div>
);


export default Login;