import React from 'react';
import { Card, Switch, Button, Space, Typography, Progress, Alert, Tag, Tooltip } from 'antd';
import { AudioOutlined, MutedOutlined, ReloadOutlined } from '@ant-design/icons';
import { AudioState } from '../utils/audioManager';
import { STTState } from '../services/voiceSTTService';
import type { VoiceSettings } from '../services/voiceSettingsService';

/**
 * STT语音识别控制面板组件
 * 提供语音识别的开关、录音控制和识别结果显示
 */

const { Text } = Typography;

export interface VoiceSTTPanelProps {
  /** 语音设置 */
  settings: VoiceSettings;
  /** 设置更新回调 */
  onSettingsChange: (settings: Partial<VoiceSettings>) => void;
  /** STT状态 */
  sttState: STTState;
  /** 音频状态 */
  audioState: AudioState;
  /** 是否正在识别 */
  isRecognitionActive: boolean;
  /** 识别文本结果 */
  recognizedText: string;
  /** 麦克风音量级别 (0-100) */
  microphoneLevel: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 控制回调 */
  onStartListening: () => void;
  onStopListening: () => void;
  onClearRecognizedText: () => void;
}

const VoiceSTTPanel: React.FC<VoiceSTTPanelProps> = ({
  settings,
  onSettingsChange,
  sttState,
  audioState,
  isRecognitionActive,
  recognizedText,
  microphoneLevel,
  disabled = false,
  onStartListening,
  onStopListening,
  onClearRecognizedText
}) => {
  /**
   * 更新设置的辅助函数
   * @param key 设置键
   * @param value 设置值
   */
  const updateSetting = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => {
    onSettingsChange({ [key]: value });
  };

  /**
   * 获取音频状态的显示文本
   * @param state 音频状态
   * @returns 显示文本
   */
  const getAudioStateText = (state: AudioState): string => {
    switch (state) {
      case AudioState.RECOGNIZING:
        return '识别中';
      case AudioState.RECOGNITION_READY:
        return '就绪';
      case AudioState.DEVICE_TESTING:
        return '设备测试';
      case AudioState.ERROR:
        return '错误';
      default:
        return '空闲';
    }
  };

  /**
   * 获取音频状态的颜色
   * @param state 音频状态
   * @returns 颜色值
   */
  const getAudioStateColor = (state: AudioState): string => {
    switch (state) {
      case AudioState.RECOGNIZING:
        return 'processing';
      case AudioState.RECOGNITION_READY:
        return 'success';
      case AudioState.DEVICE_TESTING:
        return 'warning';
      case AudioState.ERROR:
        return 'error';
      default:
        return 'default';
    }
  };

  /**
   * 获取录音按钮的属性
   */
  const getRecordButtonProps = () => {
    if (sttState === STTState.PROCESSING || audioState === AudioState.DEVICE_TESTING) {
      return {
        loading: true,
        disabled: true,
        text: sttState === STTState.PROCESSING ? '处理中...' : '设备准备中...',
        icon: <AudioOutlined />
      };
    }

    if (isRecognitionActive) {
      return {
        loading: false,
        disabled: false,
        text: '停止录音',
        icon: <MutedOutlined />,
        type: 'primary' as const
      };
    }

    return {
      loading: false,
      disabled: audioState === AudioState.ERROR,
      text: audioState === AudioState.ERROR ? '设备错误' : '开始录音',
      icon: <AudioOutlined />,
      type: 'default' as const
    };
  };

  const recordButtonProps = getRecordButtonProps();

  return (
    <Card 
      size="small" 
      title={
        <Space>
          语音答题
          <Tag color={getAudioStateColor(audioState)}>
            {getAudioStateText(audioState)}
          </Tag>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* STT开关 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between' 
        }}>
          <Text>启用语音答题</Text>
          <Switch
            checked={settings.sttEnabled}
            onChange={(checked) => updateSetting('sttEnabled', checked)}
            size="small"
            disabled={disabled}
          />
        </div>
        
        {/* STT功能区 */}
        {settings.sttEnabled && (
          <>
            {/* 设备测试状态提示 */}
            {audioState === AudioState.DEVICE_TESTING && (
              <Alert
                message="音频设备准备中"
                description="正在初始化音频设备，请稍候..."
                type="info"
                showIcon
                size="small"
              />
            )}

            {/* 设备错误提示 */}
            {audioState === AudioState.ERROR && (
              <Alert
                message="音频设备错误"
                description="麦克风访问失败，请检查权限设置或刷新页面重试"
                type="error"
                showIcon
                size="small"
                action={
                  <Button size="small" onClick={() => window.location.reload()}>
                    刷新页面
                  </Button>
                }
              />
            )}
            
            {/* 录音状态显示 */}
            {sttState === STTState.LISTENING && (
              <div style={{
                textAlign: 'center',
                padding: '12px 8px',
                backgroundColor: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: '6px'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <Text strong style={{ color: '#52c41a' }}>🎙️ 正在监听...</Text>
                </div>
                
                {/* 音量进度条 */}
                <Progress 
                  percent={microphoneLevel}
                  showInfo={false}
                  strokeColor={{
                    '0%': '#ff4d4f',    // 低音量 - 红色
                    '30%': '#faad14',   // 中音量 - 橙色
                    '70%': '#52c41a',   // 高音量 - 绿色
                  }}
                  size="small"
                  strokeWidth={6}
                />
                
                <div style={{ marginTop: '6px' }}>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    音量: {Math.round(microphoneLevel)}%
                  </Text>
                </div>

                {/* 音量提示 */}
                <div style={{ marginTop: '4px', fontSize: '10px', color: '#666' }}>
                  {microphoneLevel < 10 && '请说话...'}
                  {microphoneLevel >= 10 && microphoneLevel < 50 && '音量偏低，请大声一点'}
                  {microphoneLevel >= 50 && '音量正常'}
                </div>
              </div>
            )}

            {/* 识别结果显示 */}
            {recognizedText && (
              <div style={{
                background: 'rgba(82, 196, 26, 0.1)',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(82, 196, 26, 0.2)'
              }}>
                <Text style={{ fontSize: '12px', color: '#666' }}>识别结果:</Text>
                <div style={{ marginTop: '6px' }}>
                  <Text strong style={{ fontSize: '14px' }}>{recognizedText}</Text>
                </div>
              </div>
            )}

            {/* 控制按钮区 */}
            <Space>
              {/* 录音控制按钮 */}
              <Tooltip 
                title={isRecognitionActive ? "点击停止录音" : "点击开始录音，然后说出你的答案"}
              >
                <Button
                  size="small"
                  type={recordButtonProps.type}
                  icon={recordButtonProps.icon}
                  onClick={isRecognitionActive ? onStopListening : onStartListening}
                  loading={recordButtonProps.loading}
                  disabled={recordButtonProps.disabled || !settings.sttEnabled}
                >
                  {recordButtonProps.text}
                </Button>
              </Tooltip>
              
              {/* 清除识别结果按钮 */}
              {recognizedText && (
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={onClearRecognizedText}
                  disabled={isRecognitionActive}
                >
                  清除
                </Button>
              )}
            </Space>

            {/* 处理中状态提示 */}
            {sttState === STTState.PROCESSING && (
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#e6f7ff',
                border: '1px solid #91d5ff',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <Text style={{ fontSize: '12px', color: '#1890ff' }}>
                  🤖 正在处理语音识别结果...
                </Text>
              </div>
            )}
          </>
        )}

        {/* STT关闭时的提示 */}
        {!settings.sttEnabled && (
          <div style={{
            padding: '8px 12px',
            backgroundColor: '#f5f5f5',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            textAlign: 'center'
          }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              语音答题已关闭
            </Text>
          </div>
        )}

        {/* 使用提示 */}
        <div style={{
          fontSize: '11px',
          color: '#999',
          lineHeight: '14px',
          padding: '4px 0',
          borderTop: '1px solid #f0f0f0'
        }}>
          💡 提示：点击录音按钮后，清楚地说出你的答案选项，如"选择A"或"第一个"
        </div>
      </Space>
    </Card>
  );
};

export default VoiceSTTPanel;