import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Button, Space, message } from 'antd';
import {
  PlayCircleOutlined,
  PauseOutlined,
  StopOutlined,
  ReloadOutlined,
  SoundOutlined,
  LoadingOutlined,
} from '@ant-design/icons';

interface AudioFilePlayerProps {
  audioUrl?: string | null;
  audioStatus?: string;
  autoPlay?: boolean;
  onPlayStart?: () => void;
  onPlayComplete?: () => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  showProgress?: boolean;
  showControls?: boolean;
  size?: 'small' | 'middle' | 'large';
}

export interface AudioFilePlayerRef {
  stop: () => void;
  play: () => Promise<void>;
  pause: () => void;
  isPlaying: boolean;
}

const AudioFilePlayer = forwardRef<AudioFilePlayerRef, AudioFilePlayerProps>((props, ref) => {
  const {
    audioUrl,
    audioStatus = 'none',
    autoPlay = false,
    onPlayStart,
    onPlayComplete,
    onError,
    disabled = false,
    showControls = true,
    size = 'middle'
  } = props;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    stop: handleStop,
    play: handlePlay,
    pause: handlePause,
    isPlaying,
  }));

  useEffect(() => {
    if (autoPlay && audioUrl) {
      handlePlay();
    }
  }, [audioUrl, autoPlay]);

  const handlePlay = async () => {
    if (!audioUrl || disabled) return;
    
    try {
      setIsLoading(true);
      if (audioRef.current) {
        await audioRef.current.play();
        setIsPlaying(true);
        onPlayStart?.();
      }
    } catch (error) {
      console.error('Audio play failed:', error);
      const errorMsg = '音频播放失败';
      message.error(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    onPlayComplete?.();
  };

  // 获取状态显示
  const getStatusDisplay = () => {
    if (!audioUrl) {
      return <span style={{ color: '#999' }}>无语音文件</span>;
    }
    
    switch (audioStatus) {
      case 'ready':
        return <SoundOutlined style={{ color: '#52c41a' }} />;
      case 'generating':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case 'error':
        return <span style={{ color: '#ff4d4f' }}>生成失败</span>;
      default:
        return <span style={{ color: '#999' }}>未生成</span>;
    }
  };

  if (!showControls) {
    return (
      <Space size="small">
        {getStatusDisplay()}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={handleEnded}
            preload="none"
          />
        )}
      </Space>
    );
  }

  return (
    <Space size="small">
      {getStatusDisplay()}
      
      {audioUrl && audioStatus === 'ready' && (
        <>
          {!isPlaying ? (
            <Button
              type="text"
              icon={isLoading ? <LoadingOutlined /> : <PlayCircleOutlined />}
              onClick={handlePlay}
              disabled={disabled || isLoading}
              size={size}
              style={{ color: '#1890ff' }}
            >
              播放
            </Button>
          ) : (
            <Button
              type="text"
              icon={<PauseOutlined />}
              onClick={handlePause}
              disabled={disabled}
              size={size}
              style={{ color: '#fa8c16' }}
            >
              暂停
            </Button>
          )}
          
          <Button
            type="text"
            icon={<StopOutlined />}
            onClick={handleStop}
            disabled={disabled || (!isPlaying && !isLoading)}
            size={size}
          />
          
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => {
              handleStop();
              setTimeout(handlePlay, 100);
            }}
            disabled={disabled}
            size={size}
            title="重新播放"
          />
        </>
      )}
      
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={handleEnded}
          preload="none"
        />
      )}
    </Space>
  );
});

AudioFilePlayer.displayName = 'AudioFilePlayer';

export default AudioFilePlayer;