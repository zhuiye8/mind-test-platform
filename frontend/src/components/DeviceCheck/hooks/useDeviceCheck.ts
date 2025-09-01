/**
 * useDeviceCheck - 设备检测核心逻辑
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

  // 工具：停止并清理流
  const stopStream = (s: MediaStream | null) => {
    if (!s) return;
    s.getTracks().forEach(t => t.stop());
  };

  const cleanup = useCallback(() => {
    stopStream(videoStream);
    stopStream(audioStream);
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
  }, [videoStream, audioStream]);

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
    cleanup();

    try {
      const [{ stream: vs }, { stream: as }] = await Promise.all([
        getBestVideoStream(),
        getBestAudioStream(),
      ]);

      if (vs) setVideoStream(vs);
      if (as) {
        setAudioStream(as);
        setupAudioAnalyzer(as);
      }

      setCameraOk(!!vs);
      setMicOk(!!as);
      await refreshDevices();
    } catch (e) {
      setError((e as any)?.message || '设备检测失败');
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
      stopStream(videoStream);
      setVideoStream(null);
      setCameraOk(false);
      setSelectedCameraId(deviceId);
      const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
      setVideoStream(s);
      setCameraOk(true);
    } catch (e) {
      console.warn('切换摄像头失败:', e);
      setCameraOk(false);
    }
  }, [videoStream]);

  const selectMic = useCallback(async (deviceId: string) => {
    try {
      stopStream(audioStream);
      setAudioStream(null);
      setMicOk(false);
      setSelectedMicId(deviceId);
      const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
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
  }, [audioStream, setupAudioAnalyzer]);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

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

