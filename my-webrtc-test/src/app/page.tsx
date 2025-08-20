'use client';

import { useState, useRef, useEffect } from 'react';
// 确保您已经通过 'npm install socket.io-client' 安装了此库
import { io, Socket } from 'socket.io-client';

export default function WebStreamTestPage() {
  // --- 状态管理 ---
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState('等待连接...');
  const [videoTrackStatus, setVideoTrackStatus] = useState('未检测');
  const [audioTrackStatus, setAudioTrackStatus] = useState('未检测');
  const [isMuted, setIsMuted] = useState(true);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // --- 副作用钩子：用于初始化和清理 Socket.IO 连接 ---
  useEffect(() => {
    // 连接到我们本地的 Socket.IO 服务器 (端口8080)
    // 在您的真实项目中，这里应替换为生产服务器的地址
    const socket = io('ws://192.168.0.204:8080');
    socketRef.current = socket;

    // 监听 Socket.IO 的标准事件
    socket.on('connect', () => {
      setStatus('Socket.IO 连接成功，请点击开始测试');
      console.log('Socket.IO Connected, ID:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      setStatus(`Socket.IO 连接已断开: ${reason}`);
      console.log(`Socket.IO Disconnected: ${reason}`);
      // 如果正在推流时断开，则停止推流
      if (isStreaming) {
        stopStreaming();
      }
    });

    socket.on('connect_error', (error) => {
      setStatus(`Socket.IO 连接错误: ${error.message}`);
      console.error('Socket.IO Connection Error:', error);
    });

    // 组件卸载时的清理函数
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [isStreaming]); // 依赖 isStreaming 以便在断开连接时能正确调用 stopStreaming

  // --- 核心功能函数 ---

  /**
   * 开始捕获和推流
   */
  const startStreaming = async () => {
    if (isStreaming) return;

    setStatus('正在请求设备权限...');
    setVideoTrackStatus('检测中...');
    setAudioTrackStatus('检测中...');

    try {
      // 1. 获取用户媒体流
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      localStreamRef.current = stream;

      // 2. 在 video 元素中进行本地预览
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // 3. 验证媒体轨道是否存在
      const videoTracks = stream.getVideoTracks();
      setVideoTrackStatus(videoTracks.length > 0 ? '✅ 已找到' : '❌ 未找到');
      const audioTracks = stream.getAudioTracks();
      setAudioTrackStatus(audioTracks.length > 0 ? '✅ 已找到' : '❌ 未找到');

      // 如果任一轨道缺失，则不继续
      if (videoTracks.length === 0 || audioTracks.length === 0) {
        setStatus('错误：未能同时获取音频和视频轨道。');
        stream.getTracks().forEach(track => track.stop()); // 释放已获取的轨道
        return;
      }

      setStatus('设备权限获取成功，准备推流...');

      // 4. 创建 MediaRecorder 实例进行编码
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 2500000, // 视频比特率
      });

      // 5. 设置数据可用时的回调，通过 Socket.IO 发送数据
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current?.connected) {
          // 使用 .emit() 发送数据，事件名 'stream_data' 与后端监听的事件名一致
          socketRef.current.emit('stream_data', event.data);
        }
      };

      // 6. 启动 MediaRecorder，设置 timeslice (毫秒) 以进行分块
      mediaRecorderRef.current.start(100);
      setIsStreaming(true);
      setStatus('✅ 正在推流中...');

    } catch (error) {
      console.error('获取媒体设备失败:', error);
      setStatus(`❌ 错误: ${(error as Error).message}`);
      setVideoTrackStatus('失败');
      setAudioTrackStatus('失败');
    }
  };

  /**
   * 停止捕获和推流，并释放资源
   */
  const stopStreaming = () => {
    if (!isStreaming) return;

    // 停止 MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // 停止所有媒体轨道 (关闭摄像头和麦克风)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;

    // 清理 video 元素的预览
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsStreaming(false);
    setStatus('推流已停止。');
    setVideoTrackStatus('未检测');
    setAudioTrackStatus('未检测');
  };

  /**
   * 切换本地预览的静音状态
   */
  const toggleMute = () => {
    if (videoRef.current) {
        videoRef.current.muted = !videoRef.current.muted;
        setIsMuted(videoRef.current.muted);
    }
  };

  // --- JSX 渲染 ---
  return (
    <div className="container mx-auto p-4 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-4">Socket.IO 音视频流 Demo</h1>

      <div className="w-full max-w-4xl border-2 border-gray-300 rounded-lg overflow-hidden shadow-lg bg-black">
        <video ref={videoRef} autoPlay muted={isMuted} playsInline className="w-full h-auto" />
      </div>

      <div className="mt-4 p-4 bg-gray-100 rounded-md w-full max-w-4xl text-left font-mono text-sm space-y-2">
        <p><strong>推流状态:</strong> <span className={isStreaming ? 'text-green-600' : ''}>{status}</span></p>
        <p><strong>视频轨道:</strong> {videoTrackStatus}</p>
        <p><strong>音频轨道:</strong> {audioTrackStatus}</p>
      </div>

      <div className="mt-4 flex flex-wrap justify-center items-center gap-4">
        <button
          onClick={startStreaming}
          disabled={isStreaming}
          className="px-6 py-2 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          开始测试
        </button>
        <button
          onClick={stopStreaming}
          disabled={!isStreaming}
          className="px-6 py-2 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          停止测试
        </button>
        {isStreaming && (
          <button
            onClick={toggleMute}
            className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 transition-colors"
          >
            {isMuted ? '🔊 解除静音测试' : '🔇 恢复静音'}
          </button>
        )}
      </div>

      {isStreaming && !isMuted && (
        <p className="mt-2 text-sm text-orange-600">
          注意：解除静音可能会产生回声，建议使用耳机进行测试。
        </p>
      )}
    </div>
  );
}