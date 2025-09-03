import React from 'react';
import { Card, Typography, Space } from 'antd';

interface Props {
  aiAvailable: boolean | null;
  aiConfigLoading: boolean;
  webrtcConnectionState: any;
  emotionAnalysis: any;
  heartRate: number;
}

// AI 监测状态面板
const AIStatusPanel: React.FC<Props> = ({
  aiAvailable,
  aiConfigLoading,
  webrtcConnectionState,
  emotionAnalysis,
  heartRate,
}) => {
  return (
    <Card
      style={{
        marginBottom: 16,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        borderRadius: 16,
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography.Text strong style={{ fontSize: 14 }}>AI监测状态</Typography.Text>
          <span
            style={{
              padding: '4px 8px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 500,
              background:
                webrtcConnectionState?.status === 'connected'
                  ? '#f0f9ff'
                  : webrtcConnectionState?.status === 'connecting'
                  ? '#fef3c7'
                  : '#f3f4f6',
              color:
                webrtcConnectionState?.status === 'connected'
                  ? '#1e40af'
                  : webrtcConnectionState?.status === 'connecting'
                  ? '#92400e'
                  : '#6b7280',
            }}
          >
            {webrtcConnectionState?.status === 'connected' && '已连接'}
            {webrtcConnectionState?.status === 'connecting' && '连接中'}
            {webrtcConnectionState?.status === 'failed' && '连接失败'}
            {!webrtcConnectionState?.status && '未连接'}
          </span>
        </div>

        {!aiAvailable && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            AI服务未启用，本次不进行实时分析
          </Typography.Text>
        )}

        {emotionAnalysis && (
          <div style={{ fontSize: 13 }}>
            <Typography.Text type="secondary">情绪状态:</Typography.Text>
            <Typography.Text strong style={{ marginLeft: 8 }}>
              {typeof emotionAnalysis === 'string' ? emotionAnalysis : '分析中...'}
            </Typography.Text>
          </div>
        )}

        {heartRate > 0 && (
          <div style={{ fontSize: 13 }}>
            <Typography.Text type="secondary">心率:</Typography.Text>
            <Typography.Text strong style={{ marginLeft: 8, color: '#dc2626' }}>
              {heartRate} BPM
            </Typography.Text>
          </div>
        )}
      </Space>
    </Card>
  );
};

export default AIStatusPanel;
