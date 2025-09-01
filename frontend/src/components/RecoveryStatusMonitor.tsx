/**
 * 失败恢复状态监控组件
 * 显示系统的失败恢复状态，包括降级服务、失败提交等
 */

import React, { useState, useEffect } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Drawer,
  List,
  Space,
  Typography,
  Tag,
  Tooltip,
  Progress
} from 'antd';
import {
  ExclamationCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { enhancedPublicApi } from '../services/enhancedPublicApi';
import { failureRecovery } from '../services/failureRecoveryService';

const { Text, Paragraph } = Typography;

interface RecoveryStatusMonitorProps {
  visible: boolean;
  onClose: () => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface RecoveryStatus {
  degradedServices: string[];
  failedSubmissions: number;
  needsManualIntervention: number;
}

const RecoveryStatusMonitor: React.FC<RecoveryStatusMonitorProps> = ({
  visible,
  onClose,
  autoRefresh = true,
  refreshInterval = 10000
}) => {
  const [status, setStatus] = useState<RecoveryStatus>({
    degradedServices: [],
    failedSubmissions: 0,
    needsManualIntervention: 0
  });
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // 刷新状态
  const refreshStatus = () => {
    const newStatus = enhancedPublicApi.getRecoveryStatus();
    setStatus(newStatus);
  };

  // 重试失败的提交
  const handleRetrySubmissions = async () => {
    setRetrying(true);
    try {
      await enhancedPublicApi.retryFailedSubmissions();
      refreshStatus();
    } catch (error) {
      console.error('Failed to retry submissions:', error);
    } finally {
      setRetrying(false);
    }
  };

  // 恢复降级服务
  const handleRecoverService = (serviceId: string) => {
    failureRecovery.recoverService(serviceId);
    refreshStatus();
  };

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || !visible) return;

    const interval = setInterval(refreshStatus, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, visible]);

  // 初始加载和显示时刷新
  useEffect(() => {
    if (visible) {
      refreshStatus();
    }
  }, [visible]);

  // 计算系统健康状态
  const getSystemHealthStatus = () => {
    const totalIssues = status.degradedServices.length + status.failedSubmissions;
    
    if (totalIssues === 0) {
      return {
        status: 'success',
        text: '系统正常',
        color: '#52c41a'
      };
    } else if (status.needsManualIntervention > 0) {
      return {
        status: 'error',
        text: '需要人工处理',
        color: '#ff4d4f'
      };
    } else {
      return {
        status: 'warning',
        text: '部分服务异常',
        color: '#faad14'
      };
    }
  };

  const healthStatus = getSystemHealthStatus();

  return (
    <Drawer
      title={
        <Space>
          <SettingOutlined />
          系统恢复状态监控
          <Badge
            status={healthStatus.status as any}
            text={healthStatus.text}
          />
        </Space>
      }
      width={600}
      open={visible}
      onClose={onClose}
      footer={
        <div style={{ textAlign: 'right' }}>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={refreshStatus}
              loading={loading}
            >
              刷新状态
            </Button>
            {status.failedSubmissions > 0 && (
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleRetrySubmissions}
                loading={retrying}
              >
                重试失败提交
              </Button>
            )}
            <Button onClick={onClose}>
              关闭
            </Button>
          </Space>
        </div>
      }
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 系统健康总览 */}
        <Card size="small">
          <Descriptions title="系统健康总览" column={2} size="small">
            <Descriptions.Item label="系统状态">
              <Badge
                status={healthStatus.status as any}
                text={healthStatus.text}
              />
            </Descriptions.Item>
            <Descriptions.Item label="降级服务">
              <Badge count={status.degradedServices.length} showZero />
            </Descriptions.Item>
            <Descriptions.Item label="失败提交">
              <Badge count={status.failedSubmissions} showZero />
            </Descriptions.Item>
            <Descriptions.Item label="需人工处理">
              <Badge 
                count={status.needsManualIntervention} 
                showZero
                style={{ backgroundColor: status.needsManualIntervention > 0 ? '#ff4d4f' : undefined }}
              />
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 降级服务列表 */}
        {status.degradedServices.length > 0 && (
          <Card 
            title={
              <Space>
                <WarningOutlined style={{ color: '#faad14' }} />
                降级服务
              </Space>
            }
            size="small"
          >
            <List
              dataSource={status.degradedServices}
              renderItem={(serviceId) => (
                <List.Item
                  actions={[
                    <Tooltip title="手动恢复此服务">
                      <Button
                        size="small"
                        type="link"
                        icon={<CheckCircleOutlined />}
                        onClick={() => handleRecoverService(serviceId)}
                      >
                        恢复
                      </Button>
                    </Tooltip>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<WarningOutlined style={{ color: '#faad14' }} />}
                    title={
                      <Space>
                        <Text code>{serviceId}</Text>
                        <Tag color="orange">降级模式</Tag>
                      </Space>
                    }
                    description="服务已自动降级，功能受限但不影响核心业务"
                  />
                </List.Item>
              )}
            />
          </Card>
        )}

        {/* 失败提交情况 */}
        {status.failedSubmissions > 0 && (
          <Card
            title={
              <Space>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                失败提交
              </Space>
            }
            size="small"
          >
            <Alert
              message={`发现 ${status.failedSubmissions} 个失败提交`}
              description={
                <div>
                  <Paragraph>
                    系统正在自动重试这些提交。如果重试次数过多，可能需要人工处理。
                  </Paragraph>
                  {status.needsManualIntervention > 0 && (
                    <Alert
                      type="error"
                      message={`其中 ${status.needsManualIntervention} 个需要人工处理`}
                      showIcon
                      style={{ marginTop: 8 }}
                    />
                  )}
                </div>
              }
              type="warning"
              showIcon
              action={
                <Button
                  size="small"
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={handleRetrySubmissions}
                  loading={retrying}
                >
                  立即重试
                </Button>
              }
            />
          </Card>
        )}

        {/* 系统正常状态 */}
        {status.degradedServices.length === 0 && status.failedSubmissions === 0 && (
          <Card size="small">
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircleOutlined 
                style={{ fontSize: '48px', color: '#52c41a', marginBottom: '16px' }}
              />
              <div>
                <Text strong style={{ fontSize: '16px', color: '#52c41a' }}>
                  系统运行正常
                </Text>
              </div>
              <div style={{ marginTop: '8px' }}>
                <Text type="secondary">
                  所有服务运行正常，没有失败的提交需要处理
                </Text>
              </div>
            </div>
          </Card>
        )}

        {/* 自动恢复说明 */}
        <Card size="small" title="自动恢复机制">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div>
              <Space>
                <ClockCircleOutlined style={{ color: '#1890ff' }} />
                <Text strong>TTL清理</Text>
              </Space>
              <div style={{ marginLeft: '24px' }}>
                <Text type="secondary">
                  系统每15分钟自动清理过期状态，超过30分钟的降级服务会自动恢复
                </Text>
              </div>
            </div>
            
            <div>
              <Space>
                <ReloadOutlined style={{ color: '#1890ff' }} />
                <Text strong>自动重试</Text>
              </Space>
              <div style={{ marginLeft: '24px' }}>
                <Text type="secondary">
                  失败的提交每5分钟自动重试一次，使用指数退避算法
                </Text>
              </div>
            </div>
            
            <div>
              <Space>
                <WarningOutlined style={{ color: '#faad14' }} />
                <Text strong>降级策略</Text>
              </Space>
              <div style={{ marginLeft: '24px' }}>
                <Text type="secondary">
                  关键服务失败时自动降级，确保核心功能可用
                </Text>
              </div>
            </div>
          </Space>
        </Card>
      </Space>
    </Drawer>
  );
};

export default RecoveryStatusMonitor;