import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, message, Space } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { setAuthToken, setTeacherInfo } from '../utils/auth';
import type { LoginForm } from '../types';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [form] = Form.useForm();

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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <Card
        style={{
          width: 400,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          borderRadius: 12,
          border: 'none',
        }}
        bodyStyle={{
          padding: '40px 32px',
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 标题区域 */}
          <div style={{ textAlign: 'center' }}>
            <Title level={2} style={{ color: '#1890ff', marginBottom: 8 }}>
              心理测试平台
            </Title>
            <Text type="secondary">教师登录系统</Text>
          </div>

          {/* 登录表单 */}
          <Form
            form={form}
            name="login"
            onFinish={handleLogin}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="teacher_id"
              rules={[
                { required: true, message: '请输入教师工号' },
                { min: 3, message: '教师工号至少3位' }
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="教师工号"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6位' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
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
                  height: 42,
                  borderRadius: 6,
                  fontSize: 16,
                }}
              >
                {loading ? '登录中...' : '登录'}
              </Button>
            </Form.Item>
          </Form>

          {/* 提示信息 */}
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              心理测试平台 - 为校园心理健康服务
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default Login;