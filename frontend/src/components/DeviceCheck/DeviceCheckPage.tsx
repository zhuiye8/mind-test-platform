import React, { useEffect, useMemo } from 'react';
import { Button, Card, Row, Col, Typography } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, StepForwardOutlined, WifiOutlined } from '@ant-design/icons';
import { gradientThemes, cardStyles, buttonStyles } from '../ParticipantExam/ParticipantExam.styles';
import { useDeviceCheck } from './hooks/useDeviceCheck';
import { useMediaStream } from '../../contexts/MediaStreamContext';
import CameraPreview from './components/CameraPreview';
import MicrophoneMeter from './components/MicrophoneMeter';
import TroubleshootTips from './components/TroubleshootTips';
import type { DeviceCheckPageProps, DeviceCheckResults } from './types';

const { Title, Text } = Typography;

const DeviceCheckPage: React.FC<DeviceCheckPageProps> = ({ onComplete, onSkip }) => {
  const dc = useDeviceCheck();
  const mediaStream = useMediaStream();

  // 页面加载即准备设备
  useEffect(() => {
    dc.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 更宽松的继续条件：至少有一个设备工作，或者用户明确想要跳过
  const canContinue = dc.cameraOk || dc.micOk || dc.error !== null;

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
      skipped: false,
      ai_opt_out: false,
      user_confirmed: true,
    };
    
    // 将设备流保存到全局Context，不停止流
    mediaStream.setStreams(dc.videoStream, dc.audioStream);
    console.log('设备连接完成，流已保存到Context:', {
      video: !!dc.videoStream,
      audio: !!dc.audioStream
    });
    
    onComplete(results);
  };

  const handleSkip = () => {
    // 明确标记跳过状态，便于后续流程禁用 AI 监控
    const skippedResults: DeviceCheckResults = {
      camera_ok: false,
      microphone_ok: false,
      constraints_used: {},
      skipped: true,
      ai_opt_out: true,
      user_confirmed: false,
    };

    // 确保未持有多余的媒体流
    dc.stop();
    mediaStream.clearStreams();
    onSkip?.(skippedResults);
  };

  // 页面卸载时不再清理设备流资源，流将保持到Context中
  // 只在用户明确返回或取消时才清理
  useEffect(() => {
    return () => {
      console.log('设备连接页面卸载，但保持流活跃状态');
    };
  }, []);

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
      <WifiOutlined style={{ color: '#fff', fontSize: 28 }} />
    </div>
  ), []);

  return (
    <div style={{ minHeight: '100vh', background: gradientThemes.info, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 1040, animation: 'fadeInUp 0.6s ease-out 0.2s both' }}>
        <Card style={cardStyles.modern} styles={{ body: { padding: 28 } }}>
          {/* 头部 */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            {headerIcon}
            <Title level={3} style={{ margin: 0 }}>设备连接与验证</Title>
            <Text type="secondary">建立摄像头与麦克风连接（设备将保持连接状态直到考试结束）</Text>
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
            >
              {(dc.cameraOk || dc.micOk) ? '确认连接正常，保持连接' : '设备异常但仍要继续'}
            </Button>
            {onSkip && (
              <Button
                size="large"
                icon={<StepForwardOutlined />}
                onClick={handleSkip}
                style={{ borderRadius: 12, padding: '8px 20px', height: 'auto' }}
              >
                跳过连接
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DeviceCheckPage;
