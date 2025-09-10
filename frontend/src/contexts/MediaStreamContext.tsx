import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

interface MediaStreamContextValue {
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  isStreamsActive: boolean;
  setStreams: (video: MediaStream | null, audio: MediaStream | null) => void;
  clearStreams: () => void;
  validateStreams: () => { videoValid: boolean; audioValid: boolean };
}

const MediaStreamContext = createContext<MediaStreamContextValue | null>(null);

export const useMediaStream = () => {
  const context = useContext(MediaStreamContext);
  if (!context) {
    throw new Error('useMediaStream must be used within a MediaStreamProvider');
  }
  return context;
};

interface MediaStreamProviderProps {
  children: React.ReactNode;
}

export const MediaStreamProvider: React.FC<MediaStreamProviderProps> = ({ children }) => {
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  
  // 使用 ref 保持对流的引用，避免闭包问题
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  
  // 同步 ref 和 state
  useEffect(() => {
    videoStreamRef.current = videoStream;
  }, [videoStream]);
  
  useEffect(() => {
    audioStreamRef.current = audioStream;
  }, [audioStream]);

  const validateStreams = useCallback(() => {
    const videoValid = Boolean(
      videoStreamRef.current && 
      videoStreamRef.current.getVideoTracks().length > 0 &&
      videoStreamRef.current.getVideoTracks()[0].readyState === 'live'
    );
    
    const audioValid = Boolean(
      audioStreamRef.current && 
      audioStreamRef.current.getAudioTracks().length > 0 &&
      audioStreamRef.current.getAudioTracks()[0].readyState === 'live'
    );
    
    return { videoValid, audioValid };
  }, []);

  const setStreams = useCallback((video: MediaStream | null, audio: MediaStream | null) => {
    console.log('MediaStreamContext: 设置流', { 
      video: video ? '新流' : '无', 
      audio: audio ? '新流' : '无',
      currentVideo: videoStreamRef.current ? '现有流' : '无',
      currentAudio: audioStreamRef.current ? '现有流' : '无',
      sameVideo: video === videoStreamRef.current,
      sameAudio: audio === audioStreamRef.current
    });
    
    // 只有当传入的流与现有流不同时才停止旧流
    if (videoStreamRef.current && video !== videoStreamRef.current) {
      console.log('MediaStreamContext: 停止旧的视频流');
      videoStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioStreamRef.current && audio !== audioStreamRef.current) {
      console.log('MediaStreamContext: 停止旧的音频流');
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    setVideoStream(video);
    setAudioStream(audio);
    
    console.log('MediaStreamContext: 流已更新');
  }, []);

  const clearStreams = useCallback(() => {
    console.log('MediaStreamContext: 清理流资源');
    
    // 停止所有轨道
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    setVideoStream(null);
    setAudioStream(null);
  }, []);

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      clearStreams();
    };
  }, [clearStreams]);

  const isStreamsActive = Boolean(videoStream || audioStream);

  return (
    <MediaStreamContext.Provider value={{
      videoStream,
      audioStream,
      isStreamsActive,
      setStreams,
      clearStreams,
      validateStreams,
    }}>
      {children}
    </MediaStreamContext.Provider>
  );
};