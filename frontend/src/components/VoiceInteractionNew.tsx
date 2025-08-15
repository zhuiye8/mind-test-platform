import React, { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Space,
  Typography,
  Alert,
  Tag,
  Tooltip,
  Switch,
  message,
} from 'antd';
import {
  AudioOutlined,
  StopOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import AudioFilePlayer from './AudioFilePlayer';
import { voiceMatchService } from '../services/voiceMatchService';

const { Text } = Typography;

interface VoiceInteractionNewProps {
  questionText: string;
  questionOptions?: Record<string, string | { text?: string; label?: string; score?: number; value?: number }>;
  audioUrl?: string | null;
  audioStatus?: string;
  onVoiceAnswer?: (answer: string) => void;
  onTimelineEvent?: (event: string, timestamp: number, metadata?: any) => void;
  disabled?: boolean;
  autoPlay?: boolean;
}

interface VoiceSettings {
  sttEnabled: boolean;
  volume: number;
  autoMatch: boolean;
}

// 声明全局接口扩展
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const VoiceInteractionNew: React.FC<VoiceInteractionNewProps> = ({
  questionText,
  questionOptions,
  audioUrl,
  audioStatus = 'none',
  onVoiceAnswer,
  onTimelineEvent,
  disabled = false,
  autoPlay = false,
}) => {
  const [settings, setSettings] = useState<VoiceSettings>({
    sttEnabled: true,
    volume: 80,
    autoMatch: true,
  });

  const [sttState, setSttState] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [recognitionRef, setRecognitionRef] = useState<any>(null);
  const [isRecognitionActive, setIsRecognitionActive] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [matchingResult, setMatchingResult] = useState<any>(null);
  const [isMatching, setIsMatching] = useState(false);


  // 初始化语音识别
  useEffect(() => {
    if (!settings.sttEnabled) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('浏览器不支持语音识别功能');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'zh-CN';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('🎤 语音识别开始');
      setSttState('listening');
      setIsRecognitionActive(true);
      setError(null);
      setRecognizedText('');
      
      onTimelineEvent?.('voice_recognition_start', Date.now(), {
        action: 'start_listening'
      });
    };

    recognition.onresult = (event: any) => {
      console.log('🎤 语音识别结果:', event);
      setSttState('processing');
      
      const result = event.results[0];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;

      console.log(`🎤 识别文本: "${transcript}" (置信度: ${confidence})`);
      setRecognizedText(transcript);

      onTimelineEvent?.('voice_recognition_result', Date.now(), {
        transcript,
        confidence,
        action: 'recognition_complete'
      });

      // 自动匹配选项
      if (settings.autoMatch && questionOptions) {
        handleVoiceMatch(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('🎤 语音识别错误:', event.error);
      setSttState('idle');
      setIsRecognitionActive(false);
      
      let errorMessage = '语音识别出错';
      switch (event.error) {
        case 'no-speech':
          errorMessage = '未检测到语音，请重试';
          break;
        case 'audio-capture':
          errorMessage = '无法访问麦克风，请检查权限';
          break;
        case 'not-allowed':
          errorMessage = '麦克风权限被拒绝';
          break;
        case 'network':
          errorMessage = '网络连接异常';
          break;
        case 'aborted':
          // 用户主动停止，不显示错误
          return;
        default:
          errorMessage = `语音识别错误: ${event.error}`;
      }
      
      setError(errorMessage);
      message.error(errorMessage);

      onTimelineEvent?.('voice_recognition_error', Date.now(), {
        error: event.error,
        message: errorMessage,
        action: 'recognition_error'
      });
    };

    recognition.onend = () => {
      console.log('🎤 语音识别结束');
      setSttState('idle');
      setIsRecognitionActive(false);

      onTimelineEvent?.('voice_recognition_end', Date.now(), {
        action: 'stop_listening'
      });
    };

    setRecognitionRef(recognition);

    return () => {
      if (recognition && isRecognitionActive) {
        recognition.stop();
      }
    };
  }, [settings.sttEnabled]);

  // 开始语音识别
  const startListening = () => {
    if (!recognitionRef || disabled || isRecognitionActive) return;

    try {
      setError(null);
      recognitionRef.start();
    } catch (error) {
      console.error('启动语音识别失败:', error);
      setError('启动语音识别失败');
    }
  };

  // 停止语音识别
  const stopListening = () => {
    if (recognitionRef && isRecognitionActive) {
      recognitionRef.stop();
    }
  };

  // 语音匹配处理
  const handleVoiceMatch = async (voiceText: string) => {
    if (!questionOptions || !questionText) return;
    
    setIsMatching(true);
    setMatchingResult(null);

    try {
      const matchResult = await voiceMatchService.matchAnswer(
        voiceText, 
        questionText, 
        questionOptions, 
        'current_question'
      );

      console.log('🎯 语音匹配结果:', matchResult);
      setMatchingResult(matchResult);

      onTimelineEvent?.('voice_match_result', Date.now(), {
        input: voiceText,
        result: matchResult,
        action: 'voice_match'
      });

      // 如果匹配成功且置信度高，自动选择
      if (matchResult && matchResult.matched && matchResult.confidence && matchResult.confidence > 0.6) {
        const selectedOption = matchResult.option || '';
        console.log(`🎯 自动选择选项: ${selectedOption}`);
        
        if (selectedOption) {
          onVoiceAnswer?.(selectedOption);
        }
        message.success(`已自动选择: ${selectedOption}`);

        onTimelineEvent?.('auto_select_option', Date.now(), {
          option: selectedOption,
          confidence: matchResult.confidence,
          reason: matchResult.reason,
          action: 'auto_select'
        });
      }

    } catch (error) {
      console.error('语音匹配失败:', error);
      setError('语音匹配失败');
    } finally {
      setIsMatching(false);
    }
  };

  // 手动确认匹配结果
  const confirmMatch = () => {
    if (matchingResult?.matched) {
      const selectedOption = matchingResult.option;
      onVoiceAnswer?.(selectedOption);
      message.success(`已选择: ${selectedOption}`);
      setMatchingResult(null);
    }
  };

  // 音频播放完成回调
  const handleAudioPlayComplete = () => {
    onTimelineEvent?.('audio_play_complete', Date.now(), {
      action: 'audio_finished'
    });
  };

  // 音频播放开始回调
  const handleAudioPlayStart = () => {
    onTimelineEvent?.('audio_play_start', Date.now(), {
      action: 'audio_started'
    });
  };

  // 渲染语音识别状态
  const renderRecognitionStatus = () => {
    switch (sttState) {
      case 'listening':
        return (
          <Tag color="blue" icon={<AudioOutlined />}>
            正在聆听...
          </Tag>
        );
      case 'processing':
        return (
          <Tag color="orange">
            处理中...
          </Tag>
        );
      default:
        return null;
    }
  };

  // 渲染匹配结果
  const renderMatchResult = () => {
    if (isMatching) {
      return (
        <Alert
          message="正在匹配语音答案..."
          type="info"
          showIcon
          style={{ marginTop: 8 }}
        />
      );
    }

    if (matchingResult) {
      if (matchingResult.matched) {
        return (
          <Alert
            message={
              <Space direction="vertical" size="small">
                <Text>匹配成功: <strong>{matchingResult.option}</strong></Text>
                <Text type="secondary">
                  置信度: {Math.round(matchingResult.confidence * 100)}% | {matchingResult.reason}
                </Text>
                {matchingResult.confidence <= 0.6 && (
                  <Button size="small" type="primary" onClick={confirmMatch}>
                    确认选择
                  </Button>
                )}
              </Space>
            }
            type="success"
            showIcon
            style={{ marginTop: 8 }}
            closable
            onClose={() => setMatchingResult(null)}
          />
        );
      } else {
        return (
          <Alert
            message={`未能匹配到选项: ${matchingResult.reason || '请重新尝试'}`}
            type="warning"
            showIcon
            style={{ marginTop: 8 }}
            closable
            onClose={() => setMatchingResult(null)}
          />
        );
      }
    }

    return null;
  };

  return (
    <Card 
      title={
        <Space>
          <span>语音交互</span>
          <Tooltip title="语音设置">
            <Button
              type="text"
              icon={<SettingOutlined />}
              size="small"
            />
          </Tooltip>
        </Space>
      }
      size="small"
      style={{ marginBottom: 16 }}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        
        {/* 音频文件播放器 */}
        <div>
          <Text strong>题目语音播放:</Text>
          <div style={{ marginTop: 8 }}>
            <AudioFilePlayer
              audioUrl={audioUrl}
              audioStatus={audioStatus}
              autoPlay={autoPlay}
              onPlayStart={handleAudioPlayStart}
              onPlayComplete={handleAudioPlayComplete}
              onError={(error) => setError(error)}
              disabled={disabled}
              showProgress={true}
              showControls={true}
            />
          </div>
        </div>

        {/* 语音识别区域 */}
        <div>
          <Space align="center" style={{ marginBottom: 8 }}>
            <Text strong>语音识别:</Text>
            <Switch
              checked={settings.sttEnabled}
              onChange={(checked) => setSettings(prev => ({ ...prev, sttEnabled: checked }))}
              size="small"
            />
            {renderRecognitionStatus()}
          </Space>

          <Space>
            {!isRecognitionActive ? (
              <Button
                type="primary"
                icon={<AudioOutlined />}
                onClick={startListening}
                disabled={disabled || !settings.sttEnabled}
                loading={sttState === 'processing'}
              >
                开始录音
              </Button>
            ) : (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={stopListening}
              >
                停止录音
              </Button>
            )}

            <Switch
              checkedChildren="自动匹配"
              unCheckedChildren="手动确认"
              checked={settings.autoMatch}
              onChange={(checked) => setSettings(prev => ({ ...prev, autoMatch: checked }))}
              size="small"
            />
          </Space>

          {/* 识别结果显示 */}
          {recognizedText && (
            <Alert
              message={`识别结果: "${recognizedText}"`}
              type="info"
              style={{ marginTop: 8 }}
              closable
              onClose={() => setRecognizedText('')}
            />
          )}

          {/* 匹配结果显示 */}
          {renderMatchResult()}
        </div>

        {/* 错误提示 */}
        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {/* 使用说明 */}
        <Alert
          message="使用说明"
          description={
            <ul style={{ marginBottom: 0, paddingLeft: 16 }}>
              <li>点击播放按钮收听题目内容</li>
              <li>点击"开始录音"按钮进行语音回答</li>
              <li>说出选项内容或选项编号（如"选择A"、"第一个"）</li>
              <li>系统将自动匹配您的语音到对应选项</li>
            </ul>
          }
          type="info"
          showIcon
          style={{ fontSize: '12px' }}
        />

      </Space>
    </Card>
  );
};

export default VoiceInteractionNew;