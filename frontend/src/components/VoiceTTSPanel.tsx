import React from 'react';
import { Card, Switch, Slider, Button, Space, Typography } from 'antd';
import { PlayCircleOutlined, PauseOutlined, StopOutlined } from '@ant-design/icons';
import type { VoiceSettings } from '../services/voiceSettingsService';

/**
 * TTS语音播报控制面板组件
 * 提供语音播报的开关、音量、语速控制和播放按钮
 */

const { Text } = Typography;

export interface VoiceTTSPanelProps {
  /** 语音设置 */
  settings: VoiceSettings;
  /** 设置更新回调 */
  onSettingsChange: (settings: Partial<VoiceSettings>) => void;
  /** TTS状态 */
  ttsState: 'idle' | 'speaking' | 'paused';
  /** 是否禁用 */
  disabled?: boolean;
  /** 播放控制回调 */
  onSpeakText: () => void;
  onSpeakWithOptions: () => void;
  onPauseSpeaking: () => void;
  onStopSpeaking: () => void;
  /** 是否有选项可以播放 */
  hasOptions?: boolean;
}

const VoiceTTSPanel: React.FC<VoiceTTSPanelProps> = ({
  settings,
  onSettingsChange,
  ttsState,
  disabled = false,
  onSpeakText,
  onSpeakWithOptions,
  onPauseSpeaking,
  onStopSpeaking,
  hasOptions = false
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
   * 格式化百分比显示
   * @param value 原始值
   * @returns 百分比字符串
   */
  const formatPercentage = (value: number): string => {
    return `${Math.round(value * 100)}%`;
  };

  /**
   * 格式化倍数显示
   * @param value 原始值
   * @returns 倍数字符串
   */
  const formatRate = (value: number): string => {
    return `${value}x`;
  };

  /**
   * 获取播放按钮的状态和文本
   */
  const getPlayButtonProps = () => {
    if (ttsState === 'speaking') {
      return {
        type: 'primary' as const,
        loading: false,
        text: '播放中'
      };
    } else if (ttsState === 'paused') {
      return {
        type: 'default' as const,
        loading: false,
        text: '已暂停'
      };
    } else {
      return {
        type: 'default' as const,
        loading: false,
        text: '播放题目'
      };
    }
  };

  const playButtonProps = getPlayButtonProps();

  return (
    <Card size="small" title="语音播报">
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* TTS开关 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between' 
        }}>
          <Text>启用播报</Text>
          <Switch
            checked={settings.ttsEnabled}
            onChange={(checked) => updateSetting('ttsEnabled', checked)}
            size="small"
            disabled={disabled}
          />
        </div>
        
        {/* TTS控制参数 */}
        {settings.ttsEnabled && (
          <>
            {/* 音量控制 */}
            <div>
              <Text style={{ fontSize: '12px' }}>
                音量: {formatPercentage(settings.volume)}
              </Text>
              <Slider
                value={settings.volume}
                onChange={(value) => updateSetting('volume', value)}
                min={0}
                max={1}
                step={0.1}
                disabled={disabled}
                tooltip={{
                  formatter: (value) => value ? formatPercentage(value) : '0%'
                }}
              />
            </div>
            
            {/* 语速控制 */}
            <div>
              <Text style={{ fontSize: '12px' }}>
                语速: {formatRate(settings.rate)}
              </Text>
              <Slider
                value={settings.rate}
                onChange={(value) => updateSetting('rate', value)}
                min={0.5}
                max={2}
                step={0.1}
                disabled={disabled}
                tooltip={{
                  formatter: (value) => value ? formatRate(value) : '1.0x'
                }}
                marks={{
                  0.5: '0.5x',
                  1: '1x',
                  1.5: '1.5x',
                  2: '2x'
                }}
              />
            </div>

            {/* 播放控制按钮 */}
            <Space wrap>
              {/* 播放题目按钮 */}
              <Button
                size="small"
                type={playButtonProps.type}
                icon={<PlayCircleOutlined />}
                onClick={onSpeakText}
                disabled={disabled || !settings.ttsEnabled}
                loading={playButtonProps.loading}
              >
                {playButtonProps.text}
              </Button>
              
              {/* 完整播报按钮（题目+选项） */}
              {hasOptions && (
                <Button
                  size="small"
                  type={ttsState === 'speaking' ? 'primary' : 'default'}
                  icon={<PlayCircleOutlined />}
                  onClick={onSpeakWithOptions}
                  disabled={disabled || !settings.ttsEnabled}
                >
                  完整播报
                </Button>
              )}
              
              {/* 暂停按钮 */}
              {ttsState === 'speaking' && (
                <Button
                  size="small"
                  icon={<PauseOutlined />}
                  onClick={onPauseSpeaking}
                  disabled={disabled}
                >
                  暂停
                </Button>
              )}
              
              {/* 停止按钮 */}
              {(ttsState === 'speaking' || ttsState === 'paused') && (
                <Button
                  size="small"
                  icon={<StopOutlined />}
                  onClick={onStopSpeaking}
                  disabled={disabled}
                >
                  停止
                </Button>
              )}
            </Space>

            {/* 播放状态提示 */}
            {ttsState === 'speaking' && (
              <div style={{
                padding: '6px 12px',
                backgroundColor: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <Text style={{ fontSize: '12px', color: '#389e0d' }}>
                  🔊 正在播报中...
                </Text>
              </div>
            )}
            
            {ttsState === 'paused' && (
              <div style={{
                padding: '6px 12px',
                backgroundColor: '#fff7e6',
                border: '1px solid #ffd591',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <Text style={{ fontSize: '12px', color: '#d46b08' }}>
                  ⏸️ 播报已暂停
                </Text>
              </div>
            )}
          </>
        )}

        {/* TTS关闭时的提示 */}
        {!settings.ttsEnabled && (
          <div style={{
            padding: '8px 12px',
            backgroundColor: '#f5f5f5',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
            textAlign: 'center'
          }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              语音播报已关闭
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
          💡 提示：点击"播放题目"播报题目内容，点击"完整播报"播报题目和所有选项
        </div>
      </Space>
    </Card>
  );
};

export default VoiceTTSPanel;