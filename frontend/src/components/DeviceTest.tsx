import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Progress,
  Alert,
  Row,
  Col,
  Avatar,
  Tag,
} from 'antd';
import {
  VideoCameraOutlined,
  AudioOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { audioManager, AudioState, AudioManager } from '../utils/audioManager';

const { Title, Text } = Typography;

interface DeviceTestProps {
  onTestComplete: (results: DeviceTestResults) => void;
  onSkip?: () => void;
}

interface DeviceTestResults {
  cameraAvailable: boolean;
  microphoneAvailable: boolean;
  cameraPermission: boolean;
  microphonePermission: boolean;
  testPassed: boolean;
}

const DeviceTest: React.FC<DeviceTestProps> = ({ onTestComplete, onSkip }) => {
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<DeviceTestResults>({
    cameraAvailable: false,
    microphoneAvailable: false,
    cameraPermission: false,
    microphonePermission: false,
    testPassed: false,
  });
  const [currentStep, setCurrentStep] = useState<'init' | 'testing' | 'completed'>('init');
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [_audioState, setAudioState] = useState<AudioState>(AudioState.IDLE);

  const videoRef = useRef<HTMLVideoElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null); // 专门用于视频的流

  // 清理资源
  const cleanup = () => {
    // 清理视频流
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
      videoStreamRef.current = null;
    }
    
    // 停止音量监控
    audioManager.stopVolumeMonitoring();
  };

  // 组件卸载时清理
  useEffect(() => {
    // 监听AudioManager状态变化
    const unsubscribe = audioManager.onStateChange(setAudioState);
    
    return () => {
      cleanup();
      unsubscribe();
    };
  }, []);

  // 监听设备变更
  useEffect(() => {
    const handleDeviceChange = () => {
      // 如果当前正在测试或已完成测试，重新检查设备
      if (currentStep === 'testing' || currentStep === 'completed') {
        console.log('检测到设备变更，建议重新测试');
        // 可以在这里添加提示用户设备变更的逻辑
      }
    };

    // 检查是否支持设备变更监听
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
  }, [currentStep]);

  // 原updateMicrophoneLevel函数已移至AudioManager中

  // 开始设备测试
  const startDeviceTest = async () => {
    setTesting(true);
    setCurrentStep('testing');
    setError(null);

    try {
      // 1. 首先检查可用设备
      const availableDevices = await AudioManager.getAudioDevices();
      console.log('DeviceTest: 检测到音频设备', availableDevices.length);

      // 2. 检查摄像头设备
      let allDevices: MediaDeviceInfo[] = [];
      try {
        allDevices = await navigator.mediaDevices.enumerateDevices();
      } catch (err) {
        console.warn('DeviceTest: 无法枚举设备:', err);
      }
      
      const hasVideoInput = allDevices.some(device => device.kind === 'videoinput');
      const hasAudioInput = availableDevices.length > 0;

      console.log(`DeviceTest: 设备检测结果 - 摄像头: ${hasVideoInput}, 麦克风: ${hasAudioInput}`);

      // 3. 同时获取音视频流权限（解决权限对话框冲突问题）
      let combinedStream: MediaStream | null = null;
      let audioResults = { available: false, permission: false };
      let videoResults = { available: false, permission: false };

      // 构建媒体约束
      const constraints: MediaStreamConstraints = {};
      if (hasAudioInput) {
        constraints.audio = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        };
      }
      if (hasVideoInput) {
        constraints.video = {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        };
      }

      // 如果有任何设备，尝试获取组合流
      if (hasAudioInput || hasVideoInput) {
        try {
          console.log('DeviceTest: 请求同时获取音视频权限', constraints);
          
          // 添加权限请求超时机制（20秒）
          combinedStream = await Promise.race([
            navigator.mediaDevices.getUserMedia(constraints),
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error('权限请求超时，请检查浏览器权限对话框'));
              }, 20000);
            })
          ]);
          
          // 检查音频轨道
          const audioTracks = combinedStream.getAudioTracks();
          if (hasAudioInput) {
            audioResults = {
              available: audioTracks.length > 0,
              permission: audioTracks.length > 0 && audioTracks[0].readyState === 'live'
            };
            
            // 初始化音频分析器
            if (audioResults.permission) {
              await audioManager.initializeAnalyzer(combinedStream);
              audioManager.startVolumeMonitoring(setMicrophoneLevel);
            }
          }

          // 检查视频轨道
          const videoTracks = combinedStream.getVideoTracks();
          if (hasVideoInput) {
            videoResults = {
              available: videoTracks.length > 0,
              permission: videoTracks.length > 0 && videoTracks[0].readyState === 'live'
            };
            
            // 设置视频预览
            if (videoRef.current && videoResults.permission) {
              // 为视频预览创建单独的流（只包含视频轨道）
              const videoOnlyStream = new MediaStream(videoTracks);
              videoStreamRef.current = videoOnlyStream;
              videoRef.current.srcObject = videoOnlyStream;
              await videoRef.current.play();
            }
          }

        } catch (err: any) {
          console.error('DeviceTest: 获取媒体流失败:', err);
          
          // 如果同时获取失败，尝试分别获取（fallback策略）
          console.log('DeviceTest: 尝试分别获取音视频权限 (fallback)');
          
          // 尝试单独获取音频
          if (hasAudioInput && !audioResults.permission) {
            try {
              const audioStream = await Promise.race([
                audioManager.getSharedAudioStream({
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }),
                new Promise<never>((_, reject) => {
                  setTimeout(() => {
                    reject(new Error('音频权限请求超时'));
                  }, 15000);
                })
              ]);
              
              const audioTracks = audioStream.getAudioTracks();
              audioResults = {
                available: audioTracks.length > 0,
                permission: audioTracks.length > 0 && audioTracks[0].readyState === 'live'
              };
              
              if (audioResults.permission) {
                await audioManager.initializeAnalyzer(audioStream);
                audioManager.startVolumeMonitoring(setMicrophoneLevel);
              }
              
            } catch (audioErr: any) {
              console.error('DeviceTest: 音频流获取失败:', audioErr);
              audioResults = { available: false, permission: false };
            }
          }

          // 尝试单独获取视频
          if (hasVideoInput && !videoResults.permission) {
            try {
              const videoStream = await Promise.race([
                navigator.mediaDevices.getUserMedia({
                  video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                  }
                }),
                new Promise<never>((_, reject) => {
                  setTimeout(() => {
                    reject(new Error('视频权限请求超时'));
                  }, 15000);
                })
              ]);
              
              videoStreamRef.current = videoStream;
              const videoTracks = videoStream.getVideoTracks();
              videoResults = {
                available: videoTracks.length > 0,
                permission: videoTracks.length > 0 && videoTracks[0].readyState === 'live'
              };
              
              if (videoRef.current && videoResults.permission) {
                videoRef.current.srcObject = videoStream;
                await videoRef.current.play();
              }
              
            } catch (videoErr: any) {
              console.error('DeviceTest: 视频流获取失败:', videoErr);
              videoResults = { available: false, permission: false };
            }
          }

          // 设置综合错误信息
          if (err.name === 'NotAllowedError') {
            setError('设备权限被拒绝，请在浏览器设置中允许摄像头和麦克风访问');
          } else if (err.name === 'NotFoundError') {
            setError('未找到设备，请检查摄像头和麦克风连接');
          } else if (err.name === 'NotReadableError') {
            setError('设备被占用，请关闭其他使用设备的应用程序');
          } else if (err.message?.includes('权限请求超时')) {
            setError('权限请求超时，请确保点击浏览器权限对话框中的"允许"按钮');
          } else {
            setError(`设备测试失败: ${err.message}`);
          }
        }
      }

      // 4. 汇总测试结果
      const results: DeviceTestResults = {
        cameraAvailable: videoResults.available,
        microphoneAvailable: audioResults.available,
        cameraPermission: videoResults.permission,
        microphonePermission: audioResults.permission,
        testPassed: audioResults.permission || videoResults.permission, // 至少一个设备工作即可
      };

      console.log('DeviceTest: 测试结果', results);
      setTestResults(results);
      setCurrentStep('completed');

    } catch (err: any) {
      console.error('设备测试失败:', err);
      
      let errorMessage = '设备测试失败';
      let errorDetails = '';
      
      if (err.name === 'NotAllowedError') {
        errorMessage = '访问权限被拒绝';
        errorDetails = '请在浏览器地址栏左侧点击摄像头/麦克风图标，允许访问权限后重试';
      } else if (err.name === 'NotFoundError') {
        errorMessage = '未找到设备';
        errorDetails = '请检查摄像头和麦克风是否已连接，或尝试重新插拔设备';
      } else if (err.name === 'NotReadableError') {
        errorMessage = '设备被占用';
        errorDetails = '请关闭其他正在使用摄像头或麦克风的应用程序（如腾讯会议、钉钉等）';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = '设备不支持要求的功能';
        errorDetails = '您的设备可能不支持所需的摄像头或麦克风功能';
      } else if (err.message && err.message.includes('媒体输入设备')) {
        errorMessage = '未检测到媒体设备';
        errorDetails = '请确保已连接摄像头或麦克风设备';
      } else {
        errorMessage = '设备测试失败';
        errorDetails = err.message || '未知错误，请重试或检查设备连接';
      }
      
      setError(`${errorMessage}: ${errorDetails}`);
      
      // 设置失败的测试结果
      setTestResults({
        cameraAvailable: false,
        microphoneAvailable: false,
        cameraPermission: false,
        microphonePermission: false,
        testPassed: false,
      });
      setCurrentStep('completed');
    } finally {
      setTesting(false);
    }
  };

  // 重新测试 - 直接开始检测，不回到初始页面
  const retryTest = async () => {
    cleanup();
    setError(null);
    setMicrophoneLevel(0);
    setTestResults({
      cameraAvailable: false,
      microphoneAvailable: false,
      cameraPermission: false,
      microphonePermission: false,
      testPassed: false,
    });
    
    // 直接开始新一轮检测
    await startDeviceTest();
  };

  // 完成测试
  const completeTest = () => {
    cleanup();
    onTestComplete(testResults);
  };

  // 跳过测试
  const skipTest = () => {
    cleanup();
    if (onSkip) {
      onSkip();
    } else {
      // 如果没有跳过回调，传递跳过的结果
      onTestComplete({
        cameraAvailable: false,
        microphoneAvailable: false,
        cameraPermission: false,
        microphonePermission: false,
        testPassed: false,
      });
    }
  };

  const renderTestItem = (label: string, status: boolean, icon: React.ReactNode) => (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: '1px solid #f0f0f0'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {icon}
        <Text strong>{label}</Text>
      </div>
      <Tag color={status ? 'success' : 'error'}>
        {status ? '✓ 正常' : '✗ 异常'}
      </Tag>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: `
        linear-gradient(135deg, 
          rgba(16, 185, 129, 0.08) 0%, 
          rgba(79, 70, 229, 0.06) 50%, 
          rgba(16, 185, 129, 0.08) 100%
        ),
        radial-gradient(circle at 30% 20%, rgba(16, 185, 129, 0.12) 0%, transparent 60%),
        radial-gradient(circle at 70% 80%, rgba(79, 70, 229, 0.12) 0%, transparent 60%)
      `,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '800px',
      }}>
        <Card 
          style={{ 
            boxShadow: `
              0 20px 40px rgba(0, 0, 0, 0.08),
              0 8px 16px rgba(0, 0, 0, 0.04),
              inset 0 1px 0 rgba(255, 255, 255, 0.6)
            `,
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)'
          }}
          bodyStyle={{ padding: '48px' }}
        >
          {/* 头部 */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #10B981 0%, #4F46E5 100%)',
              marginBottom: '24px',
              boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)'
            }}>
              <VideoCameraOutlined style={{ fontSize: '36px', color: 'white' }} />
            </div>
            <Title level={2} style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700' }}>
              设备检测
            </Title>
            <Text type="secondary" style={{ fontSize: '16px', lineHeight: '1.5' }}>
              🎥 检测摄像头和麦克风设备，确保AI功能正常使用
            </Text>
          </div>

          {/* 测试内容 */}
          {currentStep === 'init' && (
            <div>
              <Alert
                message="开始设备检测"
                description={
                  <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                    <div style={{ marginBottom: '8px' }}>
                      • 我们需要访问您的摄像头和麦克风进行AI情绪分析
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      • 语音播报和语音答题功能需要音频设备支持
                    </div>
                    <div>
                      • 请在浏览器弹窗中允许访问权限
                    </div>
                  </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: '32px' }}
              />

              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <Button 
                  type="primary" 
                  size="large"
                  onClick={startDeviceTest}
                  loading={testing}
                  style={{
                    borderRadius: '12px',
                    height: '52px',
                    minWidth: '160px',
                    fontSize: '16px',
                    fontWeight: '600',
                    background: 'linear-gradient(135deg, #10B981 0%, #4F46E5 100%)',
                    border: 'none',
                    boxShadow: '0 6px 16px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <Space>
                    <AudioOutlined />
                    开始检测
                  </Space>
                </Button>
                <Button 
                  size="large"
                  onClick={skipTest}
                  style={{
                    borderRadius: '12px',
                    height: '52px',
                    minWidth: '120px',
                    fontSize: '16px'
                  }}
                >
                  跳过检测
                </Button>
              </div>
            </div>
          )}

          {currentStep === 'testing' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <Text strong style={{ fontSize: '18px' }}>正在检测设备...</Text>
              </div>

              <Row gutter={[24, 24]}>
                <Col span={12}>
                  <Card 
                    title="摄像头预览" 
                    style={{ height: '300px' }}
                    bodyStyle={{ padding: '16px', height: '240px' }}
                  >
                    <video
                      ref={videoRef}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        background: '#f5f5f5'
                      }}
                      muted
                      playsInline
                    />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card 
                    title="麦克风测试" 
                    style={{ height: '300px' }}
                    bodyStyle={{ padding: '16px' }}
                  >
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      <Avatar 
                        size={64}
                        style={{
                          background: microphoneLevel > 10 ? '#52c41a' : '#d9d9d9',
                          marginBottom: '16px'
                        }}
                        icon={<AudioOutlined />}
                      />
                      <div style={{ marginBottom: '16px' }}>
                        <Text strong>音量: {Math.round(microphoneLevel)}%</Text>
                      </div>
                      <Progress 
                        percent={microphoneLevel}
                        showInfo={false}
                        strokeColor={{
                          '0%': '#ff4d4f',
                          '30%': '#faad14',
                          '70%': '#52c41a',
                        }}
                      />
                      <div style={{ marginTop: '16px' }}>
                        <Text type="secondary">请说话测试麦克风</Text>
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>
            </div>
          )}

          {currentStep === 'completed' && (
            <div>
              {error && (
                <Alert
                  message="检测失败"
                  description={error}
                  type="error"
                  showIcon
                  style={{ marginBottom: '24px' }}
                  action={
                    <Button size="small" onClick={retryTest}>
                      重新检测
                    </Button>
                  }
                />
              )}

              <div style={{
                background: testResults.testPassed ? 'rgba(82, 196, 26, 0.05)' : 'rgba(255, 77, 79, 0.05)',
                borderRadius: '12px',
                padding: '24px',
                border: `1px solid ${testResults.testPassed ? 'rgba(82, 196, 26, 0.15)' : 'rgba(255, 77, 79, 0.15)'}`,
                marginBottom: '32px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                  {testResults.testPassed ? (
                    <CheckCircleOutlined style={{ fontSize: '24px', color: '#52c41a', marginRight: '12px' }} />
                  ) : (
                    <ExclamationCircleOutlined style={{ fontSize: '24px', color: '#ff4d4f', marginRight: '12px' }} />
                  )}
                  <Title level={4} style={{ margin: 0 }}>
                    {testResults.testPassed ? '设备检测通过' : '设备检测未完全通过'}
                  </Title>
                </div>

                {renderTestItem(
                  '摄像头可用', 
                  testResults.cameraAvailable,
                  <VideoCameraOutlined style={{ color: testResults.cameraAvailable ? '#52c41a' : '#ff4d4f' }} />
                )}
                {renderTestItem(
                  '摄像头权限', 
                  testResults.cameraPermission,
                  <CheckCircleOutlined style={{ color: testResults.cameraPermission ? '#52c41a' : '#ff4d4f' }} />
                )}
                {renderTestItem(
                  '麦克风可用', 
                  testResults.microphoneAvailable,
                  <AudioOutlined style={{ color: testResults.microphoneAvailable ? '#52c41a' : '#ff4d4f' }} />
                )}
                {renderTestItem(
                  '麦克风权限', 
                  testResults.microphonePermission,
                  <CheckCircleOutlined style={{ color: testResults.microphonePermission ? '#52c41a' : '#ff4d4f' }} />
                )}
              </div>

              {!testResults.testPassed && (
                <Alert
                  message="部分功能可能受限"
                  description="某些AI功能可能无法正常使用，但您仍可以继续参加考试。建议检查浏览器权限设置或重新检测。"
                  type="warning"
                  showIcon
                  style={{ marginBottom: '24px' }}
                />
              )}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <Button 
                  onClick={retryTest}
                  style={{
                    borderRadius: '12px',
                    height: '52px',
                    minWidth: '120px',
                    fontSize: '16px'
                  }}
                  icon={<ReloadOutlined />}
                >
                  重新检测
                </Button>
                <Button 
                  type="primary" 
                  onClick={completeTest}
                  style={{
                    borderRadius: '12px',
                    height: '52px',
                    minWidth: '160px',
                    fontSize: '16px',
                    fontWeight: '600',
                    background: testResults.testPassed 
                      ? 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)'
                      : 'linear-gradient(135deg, #faad14 0%, #ffc53d 100%)',
                    border: 'none',
                  }}
                >
                  <Space>
                    继续考试
                    <ArrowRightOutlined />
                  </Space>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default DeviceTest;