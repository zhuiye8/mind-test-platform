import { useState, useCallback, useEffect } from 'react';
import { enhancedPublicApi } from '../../services/enhancedPublicApi'; // 增强版公开API，带重试与降级
import webrtcPublisher from '../../services/webrtcPublisher';
import { webrtcApi } from '../../services/api/webrtcApi';
import { useMediaStream } from '../../contexts/MediaStreamContext';
import type { useTimelineRecorder } from '../../utils/timelineRecorder';
import type { ParticipantInfo } from './ExamStateManager';

// AI 与 WebRTC 管理 Hook
export const useAIWebRTC = (
  timelineRecorder: ReturnType<typeof useTimelineRecorder>,
  currentQuestionIndex: number
) => {
  const mediaStream = useMediaStream();
  
  // AI 服务可用性
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [aiConfigLoading, setAiConfigLoading] = useState(false);
  // 旧的直连AI WebRTC已移除，此处不再需要 websocketUrl

  // WebRTC 状态
  const [webrtcConnectionState, setWebrtcConnectionState] = useState<any>(null);
  const [emotionAnalysis, setEmotionAnalysis] = useState<any>(null);
  const [heartRate, setHeartRate] = useState<number>(0);

  // 预取 AI 服务配置
  useEffect(() => {
    let mounted = true;
    const loadAIConfig = async () => {
      try {
        setAiConfigLoading(true);
        const res = await enhancedPublicApi.getAIServiceConfig();
        if (!mounted) return;
        if (res.success && (res as any).data) {
          const payload: any = (res as any).data;
          setAiAvailable(!!payload.available);
          // 新方案不依赖 websocketUrl，这里仅用于展示可用性
        } else {
          setAiAvailable(false);
        }
      } catch {
        if (mounted) {
          setAiAvailable(false);
        }
      } finally {
        if (mounted) setAiConfigLoading(false);
      }
    };
    loadAIConfig();
    return () => { mounted = false; };
  }, []);

  // 事件处理器
  const handleEmotionAnalysis = useCallback((result: any) => {
    setEmotionAnalysis(result);
    timelineRecorder.recordEvent('emotion_analysis_received', {
      result,
      question_index: currentQuestionIndex
    });
  }, [timelineRecorder, currentQuestionIndex]);

  const handleHeartRateDetected = useCallback((rate: number) => {
    setHeartRate(rate);
    timelineRecorder.recordEvent('heart_rate_detected', {
      rate,
      question_index: currentQuestionIndex
    });
  }, [timelineRecorder, currentQuestionIndex]);

  const handleWebRTCConnectionChange = useCallback((state: any) => {
    setWebrtcConnectionState(state);
    timelineRecorder.recordEvent('webrtc_connection_changed', {
      state,
      status: state.status
    });
  }, [timelineRecorder]);

  const handleWebRTCError = useCallback((error: Error) => {
    console.error('WebRTC错误:', error);
    timelineRecorder.recordEvent('webrtc_error', {
      error: error.message,
      stack: error.stack
    });
  }, [timelineRecorder]);

  // 初始化 AI 会话与 WebRTC
  const initAISession = useCallback(async (
    examUuid: string,
    participantInfo: ParticipantInfo
  ) => {
    try {
      // 记录用于后续停止
      (window as any).__lastExamUuid = examUuid;
      (window as any).__lastParticipantId = participantInfo.participantId;
      const aiSessionResult = await enhancedPublicApi.createAISession(examUuid, {
        participant_id: participantInfo.participantId,
        participant_name: participantInfo.participantName,
        started_at: new Date().toISOString()
      });
      if (aiSessionResult.success && aiSessionResult.data?.ai_session_id) {
        // 统一新方案：通过 MediaMTX WHIP 推流
        const { videoValid, audioValid } = mediaStream.validateStreams();
        console.log('[WHIP] 使用设备连接中的流状态:', { videoValid, audioValid });
        const startResp = await webrtcApi.startStream({ exam_uuid: examUuid, participant_id: participantInfo.participantId });
        if (!startResp.success || !startResp.data) throw new Error(startResp.error || 'start stream failed');
        await webrtcPublisher.start({
          examUuid,
          participantId: participantInfo.participantId,
          streams: { video: mediaStream.videoStream, audio: mediaStream.audioStream },
          maxBitrate: 6_000_000,
          maxFramerate: 60,
          // 使用H264以便 MediaMTX 通过RTSP提供可解码的视频给AI（OpenCV）
          preferCodec: 'H264'
        });
        // 再次触发后端 /webrtc/start，确保 AI 端 RTSP 消费在推流已建立后也能成功（幂等）
        try {
          await webrtcApi.startStream({ exam_uuid: examUuid, participant_id: participantInfo.participantId });
        } catch (e) {
          console.warn('re-trigger /webrtc/start for RTSP consumer failed:', e);
        }
        console.log('[WHIP] 推流已连接:', startResp.data.streamName);
        handleWebRTCConnectionChange({ status: 'connected' });
      } else {
        console.warn('AI session creation failed, continuing without AI analysis:', aiSessionResult.error);
      }
    } catch (error) {
      console.warn('AI session initialization failed, continuing in degraded mode:', error);
    }
  }, [handleWebRTCConnectionChange, mediaStream]);

  // 断开连接
  const disconnect = useCallback(async () => {
    try {
      await webrtcPublisher.stop();
      const eu = (window as any).__lastExamUuid;
      const pid = (window as any).__lastParticipantId;
      if (eu && pid) {
        try {
          await fetch('/api/webrtc/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exam_uuid: eu, participant_id: pid })
          });
        } catch {}
      }
      // AI会话结束后，流的生命周期由顶层组件管理
      console.log('AI session disconnected, streams remain in context');
    } catch (error) {
      console.warn('Error during disconnect:', error);
    }
  }, []);

  // 页面卸载时断开连接（流的清理由顶层MediaStreamProvider处理）
  useEffect(() => {
    const handleUnload = () => { 
      webrtcPublisher.stop().catch(console.error);
      try {
        const eu = (window as any).__lastExamUuid;
        const pid = (window as any).__lastParticipantId;
        if (eu && pid && 'sendBeacon' in navigator) {
          const blob = new Blob([JSON.stringify({ exam_uuid: eu, participant_id: pid })], { type: 'application/json' });
          navigator.sendBeacon('/api/webrtc/stop', blob);
        }
      } catch {}
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, []);

  return {
    aiAvailable,
    aiConfigLoading,
    webrtcConnectionState,
    emotionAnalysis,
    heartRate,
    initAISession,
    disconnect,
  };
};

export type UseAIWebRTCReturn = ReturnType<typeof useAIWebRTC>;
