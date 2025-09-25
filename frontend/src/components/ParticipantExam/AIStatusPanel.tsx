import React from 'react';
import { Card, Typography } from 'antd';

interface Props {
  aiEnabled: boolean;
  aiAvailable: boolean | null;
  aiConfigLoading: boolean;
  webrtcConnectionState: any;
  emotionAnalysis: any;
  heartRate: number;
}

// AI 监测状态面板
const AIStatusPanel: React.FC<Props> = ({ aiEnabled, aiAvailable, aiConfigLoading }) => {
  const statusText = !aiEnabled
    ? '未启用（已跳过）'
    : aiConfigLoading
    ? '检测中…'
    : aiAvailable
    ? '正常'
    : '服务不可用';

  const { bg, color } = !aiEnabled
    ? { bg: 'rgba(156,163,175,0.2)', color: '#4b5563' }
    : aiConfigLoading
    ? { bg: 'rgba(245, 158, 11, 0.12)', color: '#92400e' }
    : aiAvailable
    ? { bg: 'rgba(16, 185, 129, 0.12)', color: '#065f46' }
    : { bg: 'rgba(248,113,113,0.15)', color: '#991b1b' };

  return (
    <Card
      style={{
        marginBottom: 16,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        borderRadius: 16,
      }}
      bodyStyle={{ padding: 16 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography.Text strong style={{ fontSize: 14 }}>AI监测状态</Typography.Text>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: bg,
            color,
          }}
        >
          {statusText}
        </span>
      </div>
    </Card>
  );
};

export default AIStatusPanel;
