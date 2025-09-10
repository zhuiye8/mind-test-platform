/**
 * useDeviceCheck - 设备连接核心逻辑
 * 
 * 功能：
 * - 渐进式请求音频/视频权限
 * - 黑屏回退（等待 playing 事件）
 * - 设备列表（摄像头/麦克风）与切换
 * - 音量电平分析与资源清理
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBestVideoStream, getBestAudioStream } from '../utils/media';

export interface UseDeviceCheckState {
  // 媒体流
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  // 状态
  cameraOk: boolean;
  micOk: boolean;
  volumeLevel: number;
  testing: boolean;
  error: string | null;
  // 设备列表
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  selectedCameraId?: string;
  selectedMicId?: string;
}

export interface UseDeviceCheckReturn extends UseDeviceCheckState {
  start: () => Promise<void>;
  retry: () => Promise<void>;
  stop: () => void;
  refreshDevices: () => Promise<void>;
  selectCamera: (deviceId: string) => Promise<void>;
  selectMic: (deviceId: string) => Promise<void>;
}

export function useDeviceCheck(): UseDeviceCheckReturn {
  // 状态
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [cameraOk, setCameraOk] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 设备
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  const [selectedMicId, setSelectedMicId] = useState<string | undefined>(undefined);

  // 音频分析
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // 使用 useRef 保存流引用，避免闭包问题
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // 工具：停止并清理流
  const stopStream = (s: MediaStream | null) => {
    if (!s) return;
    s.getTracks().forEach(t => t.stop());
  };

  const cleanup = useCallback(() => {
    // 使用 ref 中的最新流引用
    stopStream(videoStreamRef.current);
    stopStream(audioStreamRef.current);
    videoStreamRef.current = null;
    audioStreamRef.current = null;
    setVideoStream(null);
    setAudioStream(null);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (analyserRef.current) analyserRef.current.disconnect();
    analyserRef.current = null;
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
  }, []); // 移除依赖，使用 ref 访问最新值

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter(d => d.kind === 'videoinput'));
      setMicrophones(devices.filter(d => d.kind === 'audioinput'));
    } catch (e) {
      console.warn('获取设备列表失败:', e);
    }
  }, []);

  const setupAudioAnalyzer = useCallback((stream: MediaStream) => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      const src = audioContextRef.current.createMediaStreamSource(stream);
      src.connect(analyserRef.current);

      const loop = () => {
        if (!analyserRef.current) return;
        const arr = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(arr);
        const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
        const level = Math.round((avg / 255) * 100);
        setVolumeLevel(level);
        if (level > 5) setMicOk(true);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      console.warn('音频分析器初始化失败:', e);
    }
  }, []);

  const start = useCallback(async () => {
    setTesting(true);
    setError(null);
    // 不要立即清理，让现有流继续工作，只在获取失败时才清理

    try {
      // 检查设备权限状态
      try {
        const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        const microphonePermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        
        if (cameraPermission.state === 'denied') {
          setError('摄像头权限被拒绝。请刷新页面并允许摄像头权限，或在浏览器设置中启用摄像头。');
          return;
        }
        if (microphonePermission.state === 'denied') {
          setError('麦克风权限被拒绝。请刷新页面并允许麦克风权限，或在浏览器设置中启用麦克风。');
          return;
        }
      } catch (permError) {
        console.warn('权限查询不支持，继续尝试获取设备:', permError);
      }

      // 检查现有流是否仍然有效
      const currentVideoValid = videoStreamRef.current && 
        videoStreamRef.current.getVideoTracks().length > 0 && 
        videoStreamRef.current.getVideoTracks()[0].readyState === 'live';
      
      const currentAudioValid = audioStreamRef.current && 
        audioStreamRef.current.getAudioTracks().length > 0 && 
        audioStreamRef.current.getAudioTracks()[0].readyState === 'live';

      console.log('检查现有流状态:', { currentVideoValid, currentAudioValid });

      // 只有在现有流无效时才获取新流
      const videoPromise = currentVideoValid 
        ? Promise.resolve({ stream: videoStreamRef.current }) 
        : getBestVideoStream();
      
      const audioPromise = currentAudioValid 
        ? Promise.resolve({ stream: audioStreamRef.current }) 
        : getBestAudioStream();

      const [{ stream: vs }, { stream: as }] = await Promise.all([
        videoPromise,
        audioPromise,
      ]);

      if (vs) {
        // 只有当获取到新流时才更新ref
        if (vs !== videoStreamRef.current) {
          // 停止旧的视频流
          if (videoStreamRef.current) {
            stopStream(videoStreamRef.current);
          }
          videoStreamRef.current = vs;
        }
        setVideoStream(vs);
        // 检查视频轨道状态
        const videoTrack = vs.getVideoTracks()[0];
        setCameraOk(videoTrack && videoTrack.readyState === 'live');
      } else {
        // 获取失败时才停止并清理旧流
        if (videoStreamRef.current) {
          stopStream(videoStreamRef.current);
        }
        videoStreamRef.current = null;
        setVideoStream(null);
        setCameraOk(false);
      }

      if (as) {
        // 只有当获取到新流时才更新ref
        if (as !== audioStreamRef.current) {
          // 停止旧的音频流
          if (audioStreamRef.current) {
            stopStream(audioStreamRef.current);
          }
          audioStreamRef.current = as;
        }
        setAudioStream(as);
        setupAudioAnalyzer(as);
        // micOk 将由 setupAudioAnalyzer 中的音量检测设置
      } else {
        // 获取失败时才停止并清理旧流
        if (audioStreamRef.current) {
          stopStream(audioStreamRef.current);
        }
        audioStreamRef.current = null;
        setAudioStream(null);
        setMicOk(false);
      }

      await refreshDevices();
    } catch (e) {
      const errorMsg = (e as any)?.message || '设备连接失败';
      console.error('设备连接失败:', e);
      
      // 获取失败时清理资源
      cleanup();
      
      // 根据具体错误类型提供解决建议
      if (errorMsg.includes('Permission') || errorMsg.includes('denied')) {
        setError('设备权限被拒绝。请刷新页面并允许摄像头和麦克风权限，或检查浏览器设置。');
      } else if (errorMsg.includes('NotFound')) {
        setError('未检测到可用设备。可能的解决方案：1) 检查设备连接 2) 重启浏览器 3) 检查Windows设备管理器中的音频/视频设备状态。');
      } else if (errorMsg.includes('NotReadableError') || errorMsg.includes('NotAllowed')) {
        setError('设备被其他应用占用。请关闭可能使用摄像头的程序（如QQ、微信、腾讯会议、OBS、Skype等），然后点击重新检测。');
      } else if (errorMsg.includes('OverConstrainedError')) {
        setError('设备不支持所需配置。正在尝试降级配置...');
        // 自动重试降级配置
        setTimeout(() => retry(), 2000);
        return;
      } else {
        setError(`设备连接遇到问题: ${errorMsg}。建议：1) 刷新页面 2) 尝试不同浏览器（推荐Chrome/Edge） 3) 重启设备。`);
      }
    } finally {
      setTesting(false);
    }
  }, [cleanup, refreshDevices, setupAudioAnalyzer]);

  const retry = useCallback(async () => {
    await start();
  }, [start]);

  const selectCamera = useCallback(async (deviceId: string) => {
    try {
      // 停止旧视频流
      stopStream(videoStreamRef.current);
      videoStreamRef.current = null;
      setVideoStream(null);
      setCameraOk(false);
      setSelectedCameraId(deviceId);
      
      // 获取新的视频流
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          deviceId: { exact: deviceId },
          width: { ideal: 640, min: 320 },
          height: { ideal: 480, min: 240 },
          frameRate: { ideal: 15, min: 5, max: 30 }
        } 
      });
      
      videoStreamRef.current = s;
      setVideoStream(s);
      setCameraOk(true);
    } catch (e) {
      console.warn('切换摄像头失败:', e);
      setCameraOk(false);
    }
  }, []);

  const selectMic = useCallback(async (deviceId: string) => {
    try {
      stopStream(audioStreamRef.current);
      audioStreamRef.current = null;
      setAudioStream(null);
      setMicOk(false);
      setSelectedMicId(deviceId);
      
      // 获取新的音频流
      const s = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          deviceId: { exact: deviceId }, 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1
        } 
      });
      
      audioStreamRef.current = s;
      setAudioStream(s);
      setMicOk(true);
      
      // 重新挂接分析器
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (analyserRef.current) analyserRef.current.disconnect();
      analyserRef.current = null;
      setupAudioAnalyzer(s);
    } catch (e) {
      console.warn('切换麦克风失败:', e);
      setMicOk(false);
    }
  }, [setupAudioAnalyzer]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // 移除自动清理，让调用方控制清理时机
  // useEffect(() => {
  //   return () => cleanup();
  // }, [cleanup]);

  return {
    videoStream,
    audioStream,
    cameraOk,
    micOk,
    volumeLevel,
    testing,
    error,
    cameras,
    microphones,
    selectedCameraId,
    selectedMicId,
    start,
    retry,
    stop,
    refreshDevices,
    selectCamera,
    selectMic,
  };
}

