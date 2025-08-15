import React, { useState, useRef, useEffect } from 'react';
import {
  Button,
  Card,
  Space,
  Typography,
  Slider,
  Switch,
  Tag,
  Alert,
  Tooltip,
  Progress,
  Dropdown,
  type MenuProps,
} from 'antd';
import {
  AudioOutlined,
  SoundOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  StopOutlined,
  SettingOutlined,
  MutedOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { audioManager, AudioState } from '../utils/audioManager';
import { globalSpeechQueue, SpeechQueue } from '../utils/speechQueue';
import { voiceMatchService } from '../services/voiceMatchService';
import { getPrecisionTracker } from '../utils/precisionTimeTracker';

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

interface VoiceSettings {
  ttsEnabled: boolean;
  sttEnabled: boolean;
  volume: number;
  rate: number;
  autoPlay: boolean;
  voiceIndex: number;
}

// 声明全局接口扩展
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
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
  const [settings, setSettings] = useState<VoiceSettings>({
    ttsEnabled: true,
    sttEnabled: true,
    volume: 0.8,
    rate: 1.0,
    autoPlay: false,
    voiceIndex: 0,
  });

  const [ttsState, setTtsState] = useState<'idle' | 'speaking' | 'paused'>('idle');
  const [sttState, setSttState] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [recognitionRef, setRecognitionRef] = useState<any>(null);
  const [isRecognitionActive, setIsRecognitionActive] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [audioState, setAudioState] = useState<AudioState>(AudioState.IDLE);
  const [, setMatchingResult] = useState<any>(null);
  const [, setIsMatching] = useState(false);

  // 移除旧的recognitionRef，使用state管理
  const speechQueueRef = useRef<SpeechQueue>(globalSpeechQueue);

  // 初始化语音合成
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      // 优先选择中文语音
      const chineseVoices = voices.filter(voice => 
        voice.lang.startsWith('zh') || 
        voice.name.includes('Chinese') ||
        voice.name.includes('中文')
      );
      setAvailableVoices(chineseVoices.length > 0 ? chineseVoices : voices);
    };

    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  // 监听AudioManager状态变化
  useEffect(() => {
    const unsubscribe = audioManager.onStateChange(setAudioState);
    return unsubscribe;
  }, []);

  // 初始化语音识别 - 简化版本
  useEffect(() => {
    if (!settings.sttEnabled) {
      if (recognitionRef) {
        recognitionRef.abort();
        setRecognitionRef(null);
        setIsRecognitionActive(false);
      }
      return;
    }

    if (typeof window === 'undefined') return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('语音识别不可用，请使用支持语音识别的浏览器');
      return;
    }

    // 创建新的识别器实例
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // 事件处理
    recognition.onstart = () => {
      console.log('VoiceInteraction: 语音识别开始');
      setIsRecognitionActive(true);
      setSttState('listening');
      audioManager.onRecognitionStart();
      onTimelineEvent?.('voice_recognition_start', Date.now());
      setError(null);
    };

    recognition.onresult = async (event: any) => {
      const result = event.results[0][0].transcript;
      console.log('VoiceInteraction: 识别结果:', result);
      setRecognizedText(result);
      setSttState('processing');
      
      // 记录语音识别事件
      const tracker = getPrecisionTracker();
      tracker.recordVoiceEvent('voice_recognized', { 
        text: result, 
        confidence: event.results[0][0].confidence 
      });
      
      onTimelineEvent?.('voice_recognition_result', Date.now(), { text: result });
      
      // 如果有选项，进行智能匹配
      if (questionOptions && Object.keys(questionOptions).length > 0) {
        await handleVoiceMatch(result);
      } else {
        // 文本题直接使用识别结果
        setTimeout(() => {
          onVoiceAnswer?.(result);
          setSttState('idle');
          setIsRecognitionActive(false);
          audioManager.onRecognitionEnd();
        }, 500);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('VoiceInteraction: 语音识别错误:', event.error);
      
      let errorMessage = '语音识别失败';
      
      switch (event.error) {
        case 'aborted':
          errorMessage = '语音识别被中断，请重新尝试';
          break;
        case 'audio-capture':
          errorMessage = '无法捕获音频，请检查麦克风是否正常工作';
          break;
        case 'network':
          errorMessage = '网络错误，请检查网络连接后重试';
          break;
        case 'not-allowed':
          errorMessage = '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问';
          break;
        case 'service-not-available':
          errorMessage = '语音识别服务不可用，请稍后重试';
          break;
        case 'bad-grammar':
          errorMessage = '语音识别配置错误';
          break;
        case 'language-not-supported':
          errorMessage = '不支持当前语言（中文）';
          break;
        default:
          errorMessage = `语音识别失败: ${event.error}`;
      }
      
      setError(errorMessage);
      setSttState('idle');
      setIsRecognitionActive(false);
      audioManager.onRecognitionError(event.error);
      onTimelineEvent?.('voice_recognition_error', Date.now(), { 
        error: event.error, 
        message: errorMessage 
      });
    };

    recognition.onend = () => {
      console.log('VoiceInteraction: 语音识别结束');
      setSttState('idle');
      setIsRecognitionActive(false);
      audioManager.onRecognitionEnd();
      onTimelineEvent?.('voice_recognition_end', Date.now());
    };

    setRecognitionRef(recognition);

    return () => {
      if (recognition) {
        try {
          recognition.abort();
        } catch (e) {
          console.warn('VoiceInteraction: 清理识别器时出错:', e);
        }
      }
    };
  }, [settings.sttEnabled, onVoiceAnswer, onTimelineEvent]);

  // 自动播放题目（支持完整播报）
  useEffect(() => {
    if ((autoPlay || autoPlayWithOptions) && settings.ttsEnabled && questionText && !disabled) {
      setTimeout(() => {
        if (autoPlayWithOptions && questionOptions) {
          speakQuestionWithOptions();
        } else {
          speakText();
        }
      }, 500);
    }
  }, [questionText, questionOptions, autoPlay, autoPlayWithOptions, settings.ttsEnabled, disabled]);

  // 音量检测（使用AudioManager统一管理）
  const startMicrophoneMonitoring = async () => {
    try {
      // 使用AudioManager提供音量监控
      audioManager.startVolumeMonitoring(setMicrophoneLevel);
      console.log('VoiceInteraction: 开始音量监控');
    } catch (err: any) {
      console.error('VoiceInteraction: 麦克风监控失败:', err);
      setError('无法启动音量监控');
    }
  };

  const stopMicrophoneMonitoring = () => {
    audioManager.stopVolumeMonitoring();
    setMicrophoneLevel(0);
    console.log('VoiceInteraction: 停止音量监控');
  };

  // 文本转语音（单独播报题目）
  const speakText = () => {
    if (!settings.ttsEnabled || !questionText || disabled) return;

    speechQueueRef.current.stop(); // 停止当前播放
    
    const config = {
      volume: settings.volume,
      rate: settings.rate,
      voiceIndex: settings.voiceIndex
    };

    speechQueueRef.current
      .onStart((_item) => {
        setTtsState('speaking');
        onTimelineEvent?.('tts_start', Date.now(), { text: questionText });
      })
      .onEnd((_item) => {
        // 不立即设置为idle，等待整个队列完成
      })
      .onQueueComplete(() => {
        setTtsState('idle');
        onTimelineEvent?.('tts_end', Date.now());
      })
      .onError((_item, error) => {
        console.error('VoiceInteraction: 语音合成错误:', error);
        setError(`语音播报失败: ${error}`);
        setTtsState('idle');
        onTimelineEvent?.('tts_error', Date.now(), { error });
      });

    speechQueueRef.current.add(questionText, config);
  };

  // 完整播报（题目+选项）
  const speakQuestionWithOptions = () => {
    if (!settings.ttsEnabled || !questionText || disabled) return;
    if (!questionOptions) {
      speakText(); // 如果没有选项，降级为普通播报
      return;
    }

    speechQueueRef.current.stop(); // 停止当前播放
    
    const config = {
      volume: settings.volume,
      rate: settings.rate,
      voiceIndex: settings.voiceIndex
    };

    speechQueueRef.current
      .onStart((_item) => {
        setTtsState('speaking');
        onTimelineEvent?.('tts_start', Date.now(), { 
          text: questionText, 
          withOptions: true,
          optionsCount: Object.keys(questionOptions).length
        });
      })
      .onEnd((_item) => {
        // 不立即设置为idle，等待整个队列完成
      })
      .onQueueComplete(() => {
        setTtsState('idle');
        onTimelineEvent?.('tts_end', Date.now());
      })
      .onError((_item, error) => {
        console.error('VoiceInteraction: 语音合成错误:', error);
        setError(`语音播报失败: ${error}`);
        setTtsState('idle');
        onTimelineEvent?.('tts_error', Date.now(), { error });
      });

    // 添加完整播报队列
    speechQueueRef.current.addQuestionWithOptions(questionText, questionOptions, config);
  };

  // 暂停/继续播放
  const toggleSpeaking = () => {
    if (ttsState === 'speaking') {
      speechQueueRef.current.pause();
      setTtsState('paused');
    } else if (ttsState === 'paused') {
      speechQueueRef.current.resume();
      setTtsState('speaking');
    }
  };

  // 停止播放
  const stopSpeaking = () => {
    speechQueueRef.current.stop();
    setTtsState('idle');
  };

  // 开始语音识别 - 简化版本
  const startListening = async () => {
    if (!settings.sttEnabled || disabled || !recognitionRef) {
      console.warn('VoiceInteraction: 语音识别不可用');
      return;
    }
    
    // 防止重复启动
    if (isRecognitionActive || sttState === 'listening') {
      console.warn('VoiceInteraction: 语音识别已经在运行中');
      return;
    }

    try {
      console.log('VoiceInteraction: 开始语音识别');
      
      // 清理状态
      setRecognizedText('');
      setError(null);
      
      // 使用AudioManager协调音频资源
      await audioManager.prepareForRecognition();
      
      // 启动音量监控
      startMicrophoneMonitoring();
      
      // 开始语音识别
      recognitionRef.start();
      
    } catch (err: any) {
      console.error('VoiceInteraction: 语音识别启动失败:', err);
      
      let errorMessage = '语音识别启动失败';
      if (err.name === 'InvalidStateError') {
        errorMessage = '语音识别器状态异常，请稍后再试';
      } else if (err.name === 'NotAllowedError') {
        errorMessage = '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问';
      } else if (err.name === 'ServiceNotAvailableError') {
        errorMessage = '语音识别服务不可用，请检查网络连接';
      }
      
      setError(errorMessage);
      setSttState('idle');
      setIsRecognitionActive(false);
      audioManager.onRecognitionError(err.message || err.name || 'unknown');
    }
  };

  // 处理语音匹配
  const handleVoiceMatch = async (voiceText: string): Promise<void> => {
    if (!questionOptions || !questionText) return;
    
    setIsMatching(true);
    setMatchingResult(null);
    
    try {
      const tracker = getPrecisionTracker();
      tracker.recordVoiceEvent('voice_recognized', { text: voiceText });
      
      const matchResult = await voiceMatchService.matchAnswer(
        voiceText,
        questionText,
        questionOptions,
        'current_question'
      );
      
      setMatchingResult(matchResult);
      tracker.recordVoiceEvent('voice_recognized', matchResult);
      
      if (matchResult.matched && matchResult.option) {
        // 匹配成功，自动选择选项
        setTimeout(() => {
          onVoiceAnswer?.(matchResult.option!);
          setSttState('idle');
          setIsRecognitionActive(false);
          audioManager.onRecognitionEnd();
        }, 1500); // 延迟1.5秒让用户看到匹配结果
      } else {
        // 匹配失败，让用户手动选择或重试
        setSttState('idle');
        setIsRecognitionActive(false);
        audioManager.onRecognitionEnd();
      }
      
    } catch (error) {
      console.error('语音匹配失败:', error);
      setError('语音匹配失败，请手动选择或重试');
      setSttState('idle');
      setIsRecognitionActive(false);
      audioManager.onRecognitionEnd();
    } finally {
      setIsMatching(false);
    }
  };

  // 停止语音识别 - 简化版本
  const stopListening = () => {
    console.log('VoiceInteraction: 停止语音识别');
    
    if (recognitionRef && isRecognitionActive) {
      try {
        recognitionRef.stop();
      } catch (err) {
        console.warn('VoiceInteraction: 停止语音识别时出错:', err);
      }
    }
    
    // 清理状态
    stopMicrophoneMonitoring();
    setSttState('idle');
    setIsRecognitionActive(false);
    setMatchingResult(null);
    setIsMatching(false);
  };

  // 设置菜单
  const settingsMenu: MenuProps = {
    items: [
      {
        key: 'voice',
        label: '语音设置',
        children: availableVoices.map((voice, index) => ({
          key: `voice-${index}`,
          label: voice.name,
          onClick: () => setSettings(prev => ({ ...prev, voiceIndex: index }))
        }))
      },
    ],
  };

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
              <Button size="small" onClick={() => {
                setError(null);
                // 如果是语音识别错误，提供重试选项
                if (error.includes('识别')) {
                  console.log('用户点击重试语音识别');
                }
              }}>
                重试
              </Button>
            ) : null
          }
        />
      )}

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* TTS 控制 */}
        <Card size="small" title="语音播报">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text>启用播报</Text>
              <Switch
                checked={settings.ttsEnabled}
                onChange={(checked) => setSettings(prev => ({ ...prev, ttsEnabled: checked }))}
                size="small"
              />
            </div>
            
            {settings.ttsEnabled && (
              <>
                <div>
                  <Text style={{ fontSize: '12px' }}>音量: {Math.round(settings.volume * 100)}%</Text>
                  <Slider
                    value={settings.volume}
                    onChange={(value) => setSettings(prev => ({ ...prev, volume: value }))}
                    min={0}
                    max={1}
                    step={0.1}
                  />
                </div>
                
                <div>
                  <Text style={{ fontSize: '12px' }}>语速: {settings.rate}x</Text>
                  <Slider
                    value={settings.rate}
                    onChange={(value) => setSettings(prev => ({ ...prev, rate: value }))}
                    min={0.5}
                    max={2}
                    step={0.1}
                  />
                </div>

                <Space wrap>
                  <Button
                    size="small"
                    type={ttsState === 'speaking' ? 'primary' : 'default'}
                    icon={<PlayCircleOutlined />}
                    onClick={speakText}
                    disabled={!questionText}
                  >
                    播报题目
                  </Button>
                  
                  {questionOptions && Object.keys(questionOptions).length > 0 && (
                    <Button
                      size="small"
                      type={ttsState === 'speaking' ? 'primary' : 'default'}
                      icon={<SoundOutlined />}
                      onClick={speakQuestionWithOptions}
                      disabled={!questionText}
                    >
                      完整播报
                    </Button>
                  )}
                  
                  {ttsState === 'speaking' && (
                    <Button
                      size="small"
                      icon={<PauseOutlined />}
                      onClick={toggleSpeaking}
                    >
                      暂停
                    </Button>
                  )}
                  
                  {ttsState === 'paused' && (
                    <Button
                      size="small"
                      icon={<PlayCircleOutlined />}
                      onClick={toggleSpeaking}
                    >
                      继续
                    </Button>
                  )}
                  
                  {(ttsState === 'speaking' || ttsState === 'paused') && (
                    <Button
                      size="small"
                      icon={<StopOutlined />}
                      onClick={stopSpeaking}
                    >
                      停止
                    </Button>
                  )}
                </Space>
              </>
            )}
          </Space>
        </Card>

        {/* STT 控制 */}
        <Card size="small" title={
          <Space>
            语音答题
            <Tag color={audioState === AudioState.RECOGNIZING ? 'processing' : 
                       audioState === AudioState.RECOGNITION_READY ? 'success' : 'default'}>
              {audioState === AudioState.RECOGNIZING ? '识别中' : 
               audioState === AudioState.RECOGNITION_READY ? '就绪' :
               audioState === AudioState.DEVICE_TESTING ? '设备测试' : '空闲'}
            </Tag>
          </Space>
        }>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text>启用语音答题</Text>
              <Switch
                checked={settings.sttEnabled}
                onChange={(checked) => setSettings(prev => ({ ...prev, sttEnabled: checked }))}
                size="small"
              />
            </div>
            
            {settings.sttEnabled && (
              <>
                {audioState === AudioState.DEVICE_TESTING && (
                  <Alert
                    message="音频设备准备中"
                    description="正在初始化音频设备，请稍候..."
                    type="info"
                    showIcon
                  />
                )}
                
                {sttState === 'listening' && (
                  <div style={{ textAlign: 'center', padding: '8px' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <Text strong style={{ color: '#52c41a' }}>正在监听...</Text>
                    </div>
                    <Progress 
                      percent={microphoneLevel}
                      showInfo={false}
                      strokeColor={{
                        '0%': '#ff4d4f',
                        '30%': '#faad14',
                        '70%': '#52c41a',
                      }}
                      size="small"
                    />
                    <div style={{ marginTop: '4px' }}>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        音量: {Math.round(microphoneLevel)}%
                      </Text>
                    </div>
                  </div>
                )}

                {recognizedText && (
                  <div style={{
                    background: 'rgba(82, 196, 26, 0.1)',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(82, 196, 26, 0.2)'
                  }}>
                    <Text style={{ fontSize: '12px', color: '#666' }}>识别结果:</Text>
                    <div style={{ marginTop: '4px' }}>
                      <Text strong>{recognizedText}</Text>
                    </div>
                  </div>
                )}

                <Space>
                  <Tooltip title={isRecognitionActive ? "点击停止录音" : "点击后开始说话"}>
                    <Button
                      size="small"
                      type={isRecognitionActive ? 'primary' : 'default'}
                      icon={isRecognitionActive ? <MutedOutlined /> : <AudioOutlined />}
                      onClick={isRecognitionActive ? stopListening : startListening}
                      loading={sttState === 'processing' || audioState === AudioState.DEVICE_TESTING}
                      disabled={audioState === AudioState.ERROR || !recognitionRef}
                    >
                      {isRecognitionActive ? '停止录音' : 
                       sttState === 'processing' ? '处理中...' :
                       audioState === AudioState.DEVICE_TESTING ? '设备准备中...' : 
                       !recognitionRef ? '初始化中...' : '开始录音'}
                    </Button>
                  </Tooltip>
                  
                  {recognizedText && (
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => setRecognizedText('')}
                    >
                      清除
                    </Button>
                  )}
                </Space>
              </>
            )}
          </Space>
        </Card>
      </Space>
    </Card>
  );
};

export default VoiceInteraction;