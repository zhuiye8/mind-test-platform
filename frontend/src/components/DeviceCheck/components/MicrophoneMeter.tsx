import React from 'react';
import { Card, Typography, Progress, Select } from 'antd';
import { AudioOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface Props {
  ok: boolean;
  volume: number;
  microphones: MediaDeviceInfo[];
  selectedId?: string;
  onSelect: (deviceId: string) => void;
}

const MicrophoneMeter: React.FC<Props> = ({ ok, volume, microphones, selectedId, onSelect }) => {
  return (
    <Card 
      title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AudioOutlined /> 麦克风检测 {ok && <CheckCircleOutlined style={{ color: '#10B981' }} />}
      </div>}
      style={{ borderRadius: 16, border: ok ? '2px solid #10B981' : '1px solid #f0f0f0' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Text strong>请对着麦克风说话</Text>
          <Progress percent={volume} showInfo={false} strokeColor={volume < 20 ? '#22c55e' : volume < 60 ? '#f59e0b' : '#ef4444'} style={{ marginTop: 8 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Text style={{ fontWeight: 600 }}>音量: {volume}%</Text>
            {ok && <CheckCircleOutlined style={{ color: '#10B981' }} />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text type="secondary">麦克风</Text>
          <Select
            value={selectedId || microphones[0]?.deviceId}
            onChange={onSelect}
            style={{ minWidth: 220 }}
            options={microphones.map(m => ({ value: m.deviceId, label: m.label || '麦克风' }))}
            placeholder="选择麦克风"
          />
        </div>
      </div>
    </Card>
  );
};

export default MicrophoneMeter;

