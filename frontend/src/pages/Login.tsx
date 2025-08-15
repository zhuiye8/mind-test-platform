import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, Alert, Space, Divider, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { setAuthToken, setTeacherInfo } from '../utils/auth';
import type { LoginForm } from '../types';
import '../styles/login.css';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  // 加载与错误状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginForm>();

  // 提交登录：不改变原有逻辑
  const handleLogin = async (values: LoginForm) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await authApi.login(values);
      if (resp.success && resp.data) {
        setAuthToken(resp.data.token);
        setTeacherInfo(resp.data.teacher);
        message.success('登录成功！');
        navigate('/dashboard');
      } else {
        setError(resp.error || '登录失败，请检查您的工号和密码。');
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || '网络异常，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  // 密码 CapsLock 提示
  const onPwKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const cardCls = `card-elevated${error ? ' card-elevated--error' : ''}`;

  return (
    <div className="login-shell">
      {/* 左侧品牌叙事面板（抽象几何） */}
      <section className="brand-panel" aria-hidden>
        <div className="brand-surface">
          <div className="pattern-grid" />
          <div className="psy-hero psy-hero--ring" />
          <div className="psy-hero psy-hero--wave" />
          <div className="psy-hero psy-hero--dots" />
        </div>
        <div className="brand-content">
          <Title level={2} className="brand-title">心理测评云平台</Title>
          <Text className="brand-subtitle">为教师提供高效、可靠的学生心理量表评估工具</Text>
        </div>
      </section>

      {/* 右侧表单功能面板 */}
      <section className="form-panel">
        <Card className={cardCls}>
          <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 8 }}>
            <Title level={4} style={{ margin: 0 }}>教师登录</Title>
            <Text type="secondary">请使用校内工号和密码登录</Text>
          </Space>

          {/* 全局错误（礼貌播报） */}
          <div aria-live="polite">
            {error && (
              <Alert
                style={{ marginBottom: 16 }}
                message={error}
                type="error"
                showIcon
                closable
                onClose={() => setError(null)}
              />
            )}
          </div>

          <Form
            form={form}
            name="teacher-login"
            layout="vertical"
            size="large"
            autoComplete="off"
            onFinish={handleLogin}
            onValuesChange={() => error && setError(null)}
          >
            {/* 教师工号 */}
            <Form.Item
              label="教师工号"
              name="teacher_id"
              rules={[
                { required: true, message: '请输入您的教师工号' },
                { min: 3, message: '工号至少为 3 位' },
              ]}
            >
              <Input placeholder="请输入工号" prefix={<UserOutlined />} allowClear />
            </Form.Item>

            {/* 密码 */}
            <Form.Item
              label="密码"
              name="password"
              rules={[
                { required: true, message: '请输入您的密码' },
                { min: 6, message: '密码至少为 6 位' },
              ]}
              extra={capsLockOn ? '检测到大写锁定已开启，可能导致密码输入错误。' : undefined}
            >
              <Input.Password
                placeholder="请输入密码"
                prefix={<LockOutlined />}
                visibilityToggle
                onKeyUp={onPwKeyUp}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={loading}
                className="login-primary-btn"
              >
                {loading ? '正在登录...' : '登录'}
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ margin: '20px 0 12px' }} />

          {/* 帮助与安全提示 */}
          <div className="login-footer">
            <SafetyOutlined style={{ marginRight: 8 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              请妥善保管账户信息，离开电脑前及时退出登录。
            </Text>
          </div>
        </Card>

        <div className="legal">
          <Text type="secondary" style={{ fontSize: 12 }}>
            © 2024 心理测评云平台
          </Text>
        </div>
      </section>
    </div>
  );
};

export default Login;
