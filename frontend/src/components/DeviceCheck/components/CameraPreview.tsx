import React, { useEffect, useRef } from 'react';
import { Card, Typography, Select } from 'antd';
import { VideoCameraOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface Props {
  stream: MediaStream | null;
  ok: boolean;
  cameras: MediaDeviceInfo[];
  selectedId?: string;
  onSelect: (deviceId: string) => void;
}

const CameraPreview: React.FC<Props> = ({ stream, ok, cameras, selectedId, onSelect }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // 绑定视频流
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stream) {
      try {
        v.srcObject = stream as any;
        const play = async () => { try { await v.play(); } catch {} };
        play();
      } catch {}
    } else {
      // @ts-ignore
      v.srcObject = null;
    }
  }, [stream]);

  return (
    <Card 
      title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <VideoCameraOutlined /> 摄像头预览 {ok && <CheckCircleOutlined style={{ color: '#10B981' }} />}
      </div>}
      style={{ borderRadius: 16, border: ok ? '2px solid #10B981' : '1px solid #f0f0f0' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: 260, borderRadius: 12, background: '#000', objectFit: 'cover' }} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text type="secondary">摄像头</Text>
          <Select
            value={selectedId || cameras[0]?.deviceId}
            onChange={onSelect}
            style={{ minWidth: 220 }}
            options={cameras.map(c => ({ value: c.deviceId, label: c.label || '摄像头' }))}
            placeholder="选择摄像头"
          />
        </div>
      </div>
    </Card>
  );
};

export default CameraPreview;

