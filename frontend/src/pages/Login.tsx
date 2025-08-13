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
        message.success('登录成功！');
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
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        background: 'linear-gradient(120deg, var(--color-primary-50), var(--color-secondary-50))',
      }}
    >
      <div className="w-full max-w-md">
        <Card bordered={false} className="shadow-xl rounded-2xl" bodyStyle={{ padding: '2.5rem' }}>
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-100 mb-6">
                <HeartOutlined className="text-primary-500 text-5xl" />
              </div>
              <Title level={2} className="text-gray-800">
                心理测评云平台
              </Title>
              <Text type="secondary">
                欢迎教师登录
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
                  />
                </Form.Item>
              )}

              <Form.Item
                label="教师工号"
                name="teacher_id"
                style={{ marginBottom: '24px' }}
                rules={[
                  { required: true, message: '请输入您的教师工号' },
                  { min: 3, message: '工号至少为3位' },
                ]}
              >
                <Input
                  prefix={<UserOutlined className="site-form-item-icon text-gray-400" />}
                  placeholder="教师工号"
                />
              </Form.Item>

              <Form.Item
                label="密码"
                name="password"
                style={{ marginBottom: '24px' }}
                rules={[
                  { required: true, message: '请输入您的密码' },
                  { min: 6, message: '密码至少为6位' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined className="site-form-item-icon text-gray-400" />}
                  placeholder="密码"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  className="mt-6 rounded-lg"
                  style={{ height: '52px', fontSize: '16px' }}
                >
                  {loading ? '正在登录...' : '立即登录'}
                </Button>
              </Form.Item>
            </Form>

            <Divider>
              <Text type="secondary" className="text-xs">安全提示</Text>
            </Divider>

            <Text type="secondary" className="text-center block text-xs">
              <SafetyOutlined className="mr-1" />
              请妥善保管您的账户信息，切勿泄露给他人。
            </Text>
          </Card>
          <div className="text-center mt-8">
            <Text type="secondary" className="text-xs">
              © 2024 心理测评云平台. All Rights Reserved.
            </Text>
          </div>
        </div>
    </div>
  );
};

export default Login;