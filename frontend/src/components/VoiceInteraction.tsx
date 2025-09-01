import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Space,
  Typography,
  Tag,
  Alert,
  Dropdown,
  Button,
  type MenuProps,
} from 'antd';
import {
  SoundOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { AudioState } from '../utils/audioManager';
import VoiceTTSPanel from './VoiceTTSPanel';
import VoiceSTTPanel from './VoiceSTTPanel';
import { 
  VoiceSettingsManager, 
  VoiceListManager,
  type VoiceSettings 
} from '../services/voiceSettingsService';
import { 
  TTSService, 
  TTSUtils,
  type TTSCallbacks 
} from '../services/voiceTTSService';
import { 
  STTService, 
  STTState,
  type STTCallbacks 
} from '../services/voiceSTTService';

/**
 * 语音交互组件 - 提供TTS语音播报和STT语音识别功能
 * 支持题目播报、语音答题、音量控制、语速调节等功能
 */

const { Text } = Typography;

interface VoiceInteractionProps {
  questionText: string;
  questionOptions?: Record<string, string | { text?: string; label?: string; score?: number; value?: number }>;
  onVoiceAnswer?: (answer: string) => void;
  onTimelineEvent?: (event: string, timestamp: number, metadata?: any) => void;
  disabled?: boolean;
  autoPlay?: boolean;
  autoPlayWithOptions?: boolean;
}

const VoiceInteraction: React.FC<VoiceInteractionProps> = ({
  questionText,
  questionOptions,
  onVoiceAnswer,
  onTimelineEvent,
  disabled = false,
  autoPlay = false,
  autoPlayWithOptions = false,
}) => {
  // 状态管理
  const [settings, setSettings] = useState<VoiceSettings>(VoiceSettingsManager.loadSettings());
  const [ttsState, setTtsState] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [sttState, setSttState] = useState<STTState>(STTState.IDLE);
  const [isRecognitionActive, setIsRecognitionActive] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [audioState, setAudioState] = useState<AudioState>(AudioState.IDLE);
  const [ttsService, setTtsService] = useState<TTSService | null>(null);
  const [sttService, setSTTService] = useState<STTService | null>(null);

  // 初始化语音服务
  useEffect(() => {
    // 初始化语音列表
    VoiceListManager.getAvailableVoices().then(voices => {
      setAvailableVoices(voices);
      
      // 自动选择推荐的中文语音
      if (settings.voiceIndex === 0 && voices.length > 0) {
        const recommendedIndex = VoiceListManager.getRecommendedChineseVoiceIndex();
        if (recommendedIndex > 0) {
          const newSettings = { ...settings, voiceIndex: recommendedIndex };
          setSettings(newSettings);
          VoiceSettingsManager.saveSettings(newSettings);
        }
      }
    });

    // 初始化TTS服务
    const ttsCallbacks: TTSCallbacks = {
      onStart: (text) => {
        setTtsState('speaking');
        onTimelineEvent?.('tts_start', Date.now(), { text });
      },
      onEnd: (text) => {
        onTimelineEvent?.('tts_end', Date.now(), { text });
      },
      onQueueComplete: () => {
        setTtsState('idle');
        onTimelineEvent?.('tts_queue_complete', Date.now());
      },
      onError: (error) => {
        setError(`语音播报失败: ${error}`);
        setTtsState('idle');
      },
      onTimelineEvent
    };
    
    const tts = new TTSService(ttsCallbacks);
    setTtsService(tts);

    // 初始化STT服务
    const sttCallbacks: STTCallbacks = {
      onRecognitionStart: () => {
        setIsRecognitionActive(true);
        setAudioState(AudioState.RECOGNIZING);
      },
      onRecognitionEnd: () => {
        setIsRecognitionActive(false);
        setAudioState(AudioState.IDLE);
      },
      onRecognitionResult: (text, isFinal) => {
        if (isFinal) {
          setRecognizedText(text);
        }
      },
      onRecognitionError: (error) => {
        setError(error);
        setIsRecognitionActive(false);
        setAudioState(AudioState.ERROR);
      },
      onVoiceMatch: (result) => {
        if (result.matched && result.option) {
          setTimeout(() => {
            onVoiceAnswer?.(result.option);
          }, 1500);
        }
      },
      onVolumeChange: setMicrophoneLevel,
      onStateChange: setSttState,
      onTimelineEvent
    };

    const stt = new STTService(sttCallbacks);
    setSTTService(stt);

    return () => {
      stt.destroy();
    };
  }, []);

  // 设置更新处理
  const handleSettingsChange = useCallback((newSettings: Partial<VoiceSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    VoiceSettingsManager.saveSettings(updatedSettings);
  }, [settings]);

  // 自动播放处理
  useEffect(() => {
    if ((autoPlay || autoPlayWithOptions) && settings.ttsEnabled && questionText && !disabled && ttsService) {
      setTimeout(() => {
        if (autoPlayWithOptions && questionOptions) {
          handleSpeakWithOptions();
        } else {
          handleSpeakText();
        }
      }, 500);
    }
  }, [questionText, questionOptions, autoPlay, autoPlayWithOptions, settings.ttsEnabled, disabled, ttsService]);

  // TTS控制函数
  const handleSpeakText = useCallback(() => {
    if (!ttsService) return;
    const config = TTSUtils.createConfigFromSettings(settings);
    ttsService.speakQuestionOnly(questionText, config, settings.ttsEnabled, disabled);
  }, [ttsService, questionText, settings, disabled]);

  const handleSpeakWithOptions = useCallback(() => {
    if (!ttsService) return;
    const config = TTSUtils.createConfigFromSettings(settings);
    ttsService.speakQuestionWithOptions(questionText, questionOptions, config, settings.ttsEnabled, disabled);
  }, [ttsService, questionText, questionOptions, settings, disabled]);

  const handlePauseSpeaking = useCallback(() => {
    if (ttsService) {
      ttsService.pauseSpeaking();
      setTtsState('paused');
    }
  }, [ttsService]);

  const handleStopSpeaking = useCallback(() => {
    if (ttsService) {
      ttsService.stopSpeaking();
      setTtsState('idle');
    }
  }, [ttsService]);

  // STT控制函数
  const handleStartListening = useCallback(async () => {
    if (!sttService) return;
    
    try {
      await sttService.startRecognition(questionText, questionOptions);
    } catch (error) {
      console.error('启动语音识别失败:', error);
    }
  }, [sttService, questionText, questionOptions]);

  const handleStopListening = useCallback(() => {
    if (sttService) {
      sttService.stopRecognition();
    }
  }, [sttService]);

  const handleClearRecognizedText = useCallback(() => {
    setRecognizedText('');
  }, []);

  // 语音设置菜单
  const settingsMenu: MenuProps = {
    items: [
      {
        key: 'voice',
        label: '语音设置',
        children: availableVoices.map((voice, index) => ({
          key: `voice-${index}`,
          label: voice.name,
          onClick: () => handleSettingsChange({ voiceIndex: index })
        }))
      },
    ],
  };

  // 禁用状态显示
  if (disabled) {
    return (
      <Card size="small" style={{ opacity: 0.6 }}>
        <Text type="secondary">语音功能已禁用</Text>
      </Card>
    );
  }

  return (
    <Card 
      size="small"
      style={{
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
      title={
        <Space>
          <SoundOutlined />
          <Text strong>语音助手</Text>
          <Tag color={settings.ttsEnabled || settings.sttEnabled ? 'success' : 'default'}>
            {settings.ttsEnabled || settings.sttEnabled ? '已启用' : '已禁用'}
          </Tag>
        </Space>
      }
      extra={
        <Dropdown menu={settingsMenu} trigger={['click']}>
          <Button size="small" icon={<SettingOutlined />} />
        </Dropdown>
      }
    >
      {/* 错误提示 */}
      {error && (
        <Alert
          message="语音功能异常"
          description={error}
          type="error"
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: '12px' }}
          action={
            error.includes('中断') || error.includes('失败') ? (
              <Button size="small" onClick={() => setError(null)}>
                重试
              </Button>
            ) : null
          }
        />
      )}

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* TTS控制面板 */}
        <VoiceTTSPanel
          settings={settings}
          onSettingsChange={handleSettingsChange}
          ttsState={ttsState}
          disabled={disabled}
          onSpeakText={handleSpeakText}
          onSpeakWithOptions={handleSpeakWithOptions}
          onPauseSpeaking={handlePauseSpeaking}
          onStopSpeaking={handleStopSpeaking}
          hasOptions={Boolean(questionOptions && Object.keys(questionOptions).length > 0)}
        />

        {/* STT控制面板 */}
        <VoiceSTTPanel
          settings={settings}
          onSettingsChange={handleSettingsChange}
          sttState={sttState}
          audioState={audioState}
          isRecognitionActive={isRecognitionActive}
          recognizedText={recognizedText}
          microphoneLevel={microphoneLevel}
          disabled={disabled}
          onStartListening={handleStartListening}
          onStopListening={handleStopListening}
          onClearRecognizedText={handleClearRecognizedText}
        />
      </Space>
    </Card>
  );
};

export default VoiceInteraction;