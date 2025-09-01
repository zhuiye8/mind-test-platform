import React, { useEffect, useMemo } from 'react';
import { Button, Card, Row, Col, Space, Typography } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, StepForwardOutlined, SecurityScanOutlined } from '@ant-design/icons';
import { gradientThemes, cardStyles, buttonStyles } from '../ParticipantExam/ParticipantExam.styles';
import { useDeviceCheck } from './hooks/useDeviceCheck';
import CameraPreview from './components/CameraPreview';
import MicrophoneMeter from './components/MicrophoneMeter';
import TroubleshootTips from './components/TroubleshootTips';
import type { DeviceCheckPageProps, DeviceCheckResults } from './types';

const { Title, Text } = Typography;

const DeviceCheckPage: React.FC<DeviceCheckPageProps> = ({ onComplete, onSkip }) => {
  const dc = useDeviceCheck();

  // 页面加载即准备设备
  useEffect(() => {
    dc.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = dc.cameraOk || dc.micOk;

  const handleConfirm = () => {
    const getLabel = (list: MediaDeviceInfo[], id?: string) => list.find(d => d.deviceId === id)?.label;
    const results: DeviceCheckResults = {
      camera_ok: dc.cameraOk,
      microphone_ok: dc.micOk,
      selected_camera_id: dc.selectedCameraId,
      selected_camera_label: getLabel(dc.cameras, dc.selectedCameraId),
      selected_microphone_id: dc.selectedMicId,
      selected_microphone_label: getLabel(dc.microphones, dc.selectedMicId),
      constraints_used: {},
    };
    dc.stop();
    onComplete(results);
  };

  const headerIcon = useMemo(() => (
    <div style={{
      width: 64,
      height: 64,
      borderRadius: 20,
      margin: '0 auto 12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #4F46E5 0%, #10B981 100%)',
      boxShadow: '0 8px 20px rgba(79, 70, 229, 0.25)'
    }}>
      <SecurityScanOutlined style={{ color: '#fff', fontSize: 28 }} />
    </div>
  ), []);

  return (
    <div style={{ minHeight: '100vh', background: gradientThemes.info, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 1040, animation: 'fadeInUp 0.6s ease-out 0.2s both' }}>
        <Card style={cardStyles.modern} styles={{ body: { padding: 28 } }}>
          {/* 头部 */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            {headerIcon}
            <Title level={3} style={{ margin: 0 }}>设备兼容性检测</Title>
            <Text type="secondary">确认摄像头与麦克风可用（不会录制）</Text>
          </div>

          {/* 检测内容 */}
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12}>
              <CameraPreview 
                stream={dc.videoStream}
                ok={dc.cameraOk}
                cameras={dc.cameras}
                selectedId={dc.selectedCameraId}
                onSelect={dc.selectCamera}
              />
            </Col>
            <Col xs={24} md={12}>
              <MicrophoneMeter 
                ok={dc.micOk}
                volume={dc.volumeLevel}
                microphones={dc.microphones}
                selectedId={dc.selectedMicId}
                onSelect={dc.selectMic}
              />
            </Col>
          </Row>

          <div style={{ marginTop: 16 }}>
            <TroubleshootTips error={dc.error} />
          </div>

          {/* 操作区 */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
            <Button icon={<ReloadOutlined />} onClick={dc.retry} size="large" style={{ borderRadius: 12, padding: '8px 20px', height: 'auto' }}>重新检测</Button>
            <Button type="primary" size="large" icon={<CheckCircleOutlined />} onClick={handleConfirm} disabled={!canContinue}
              style={{
                ...buttonStyles.primary,
                minWidth: 180,
                background: canContinue ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : undefined,
              }}
            >确认设备正常，继续</Button>
            {onSkip && <Button size="large" icon={<StepForwardOutlined />} onClick={() => { dc.stop(); onSkip(); }} style={{ borderRadius: 12, padding: '8px 20px', height: 'auto' }}>跳过检测</Button>}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DeviceCheckPage;

