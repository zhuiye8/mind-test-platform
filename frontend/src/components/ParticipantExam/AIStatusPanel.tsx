import React from 'react';
import { Card, Typography } from 'antd';

interface Props {
  aiAvailable: boolean | null;
  aiConfigLoading: boolean;
  webrtcConnectionState: any;
  emotionAnalysis: any;
  heartRate: number;
}

// AI 监测状态面板
const AIStatusPanel: React.FC<Props> = ({ aiAvailable, aiConfigLoading }) => {
  // 简化展示：仅显示AI检测是否正常，隐藏情绪/心率等细节
  const statusText = aiConfigLoading
    ? '检测中…'
    : aiAvailable
    ? '正常'
    : '未启用';

  const bg = aiConfigLoading
    ? 'rgba(245, 158, 11, 0.12)'
    : aiAvailable
    ? 'rgba(16, 185, 129, 0.12)'
    : 'rgba(156, 163, 175, 0.2)';
  const color = aiConfigLoading ? '#92400e' : aiAvailable ? '#065f46' : '#374151';

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
