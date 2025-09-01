import React from 'react';
import { Modal, Progress, Button, Typography, Space, Card } from 'antd';
import { LoadingOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

interface FullScreenLoadingProps {
  visible: boolean;
  progress: number;
  currentTask: string;
  totalTasks: number;
  completedTasks: number;
  currentQuestionTitle?: string;
  estimatedTimeRemaining?: number;
  onCancel: () => void;
  onMinimize?: () => void;
  allowCancel?: boolean;
}

const FullScreenLoading: React.FC<FullScreenLoadingProps> = ({
  visible,
  progress,
  currentTask,
  totalTasks,
  completedTasks,
  currentQuestionTitle,
  estimatedTimeRemaining,
  onCancel,
  onMinimize,
  allowCancel = true,
}) => {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}秒`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}分${remainingSeconds}秒`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}小时${minutes}分钟`;
    }
  };

  return (
    <Modal
      open={visible}
      closable={false}
      maskClosable={false}
      footer={null}
      centered
      width="90%"
      styles={{
        mask: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
        },
        content: {
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          borderRadius: '16px',
          padding: 0,
        },
      }}
      className="full-screen-loading-modal"
    >
      <Card
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          border: 'none',
          borderRadius: '16px',
          minHeight: '400px',
        }}
        styles={{
          body: {
            padding: '40px',
            textAlign: 'center',
          }
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 标题 */}
          <div>
            <LoadingOutlined
              style={{
                fontSize: '48px',
                color: '#1890ff',
                marginBottom: '16px',
              }}
            />
            <Title level={2} style={{ color: '#2c3e50', marginBottom: '8px' }}>
              🎵 正在批量生成语音文件
            </Title>
            <Text type="secondary" style={{ fontSize: '16px' }}>
              请不要关闭浏览器或离开此页面，任务正在后台处理中...
            </Text>
          </div>

          {/* 进度信息 */}
          <div style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <Text strong style={{ fontSize: '18px', color: '#2c3e50' }}>
                总体进度
              </Text>
              <Text style={{ fontSize: '16px', color: '#666' }}>
                {completedTasks} / {totalTasks} 题目
              </Text>
            </div>

            <Progress
              percent={progress}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
              strokeWidth={12}
              format={(percent) => `${percent}%`}
              style={{ marginBottom: '24px' }}
            />

            {/* 当前任务信息 */}
            <Card
              size="small"
              style={{
                background: '#f0f7ff',
                border: '1px solid #d6e4ff',
                borderRadius: '8px',
                marginBottom: '20px',
              }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: '14px' }}>
                  当前任务:
                </Text>
                <br />
                <Text strong style={{ fontSize: '16px', color: '#1890ff' }}>
                  {currentTask}
                </Text>
                {currentQuestionTitle && (
                  <>
                    <br />
                    <Text style={{ fontSize: '14px', color: '#666' }}>
                      题目: {currentQuestionTitle.slice(0, 50)}
                      {currentQuestionTitle.length > 50 ? '...' : ''}
                    </Text>
                  </>
                )}
              </div>
            </Card>

            {/* 预估时间 */}
            {estimatedTimeRemaining && estimatedTimeRemaining > 0 && (
              <div
                style={{
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '20px',
                }}
              >
                <Text style={{ fontSize: '14px', color: '#389e0d' }}>
                  ⏱️ 预计剩余时间: {formatTime(estimatedTimeRemaining)}
                </Text>
              </div>
            )}
          </div>

          {/* 提示信息 */}
          <Card
            size="small"
            style={{
              background: '#fff7e6',
              border: '1px solid #ffd591',
              borderRadius: '8px',
              maxWidth: '500px',
              margin: '0 auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <ExclamationCircleOutlined
                style={{ color: '#fa8c16', marginTop: '2px' }}
              />
              <div>
                <Text strong style={{ fontSize: '14px', color: '#d46b08' }}>
                  重要提示
                </Text>
                <br />
                <Text style={{ fontSize: '13px', color: '#ad6800' }}>
                  • 语音生成需要较长时间，请耐心等待
                  <br />
                  • 关闭浏览器或离开页面将中断任务
                  <br />
                  • 如遇问题，可点击"取消任务"重新开始
                  <br />• 生成的语音文件将自动保存到系统中
                </Text>
              </div>
            </div>
          </Card>

          {/* 操作按钮 */}
          <Space size="middle">
            {onMinimize && (
              <Button
                type="default"
                onClick={onMinimize}
                style={{
                  borderRadius: '6px',
                  height: '40px',
                  paddingInline: '24px',
                }}
              >
                最小化到后台
              </Button>
            )}
            {allowCancel && (
              <Button
                danger
                onClick={onCancel}
                style={{
                  borderRadius: '6px',
                  height: '40px',
                  paddingInline: '24px',
                }}
              >
                取消任务
              </Button>
            )}
          </Space>
        </Space>
      </Card>
    </Modal>
  );
};

export default FullScreenLoading;