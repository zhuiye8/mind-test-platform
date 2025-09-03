import { useState, useCallback, useEffect } from 'react';
import { enhancedPublicApi } from '../../services/enhancedPublicApi'; // 增强版公开API，带重试与降级
import aiSessionWebRTC from '../../services/aiSessionWebRTC';
import type { useTimelineRecorder } from '../../utils/timelineRecorder';
import type { ParticipantInfo } from './ExamStateManager';

// AI 与 WebRTC 管理 Hook
export const useAIWebRTC = (
  timelineRecorder: ReturnType<typeof useTimelineRecorder>,
  currentQuestionIndex: number
) => {
  // AI 服务可用性
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [aiConfigLoading, setAiConfigLoading] = useState(false);

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
        if (res.success && res.data) {
          setAiAvailable(!!res.data.available);
        } else {
          setAiAvailable(false);
        }
      } catch {
        if (mounted) setAiAvailable(false);
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
      const aiSessionResult = await enhancedPublicApi.createAISession(examUuid, {
        participant_id: participantInfo.participantId,
        participant_name: participantInfo.participantName,
        started_at: new Date().toISOString()
      });
      if (aiSessionResult.success && aiSessionResult.data?.aiSessionId) {
        await aiSessionWebRTC.initialize(
          {
            sessionId: aiSessionResult.data.aiSessionId,
            examId: examUuid,
            examResultId: aiSessionResult.data.examResultId,
            candidateId: participantInfo.participantId,
          },
          {
            iceServers: [],
            audio: true,
            video: true,
          },
          {
            onConnectionStateChange: handleWebRTCConnectionChange,
            onError: handleWebRTCError,
          }
        );
        console.log('AI session and WebRTC initialized successfully with sessionId:', aiSessionResult.data.aiSessionId);
      } else {
        console.warn('AI session creation failed, continuing without AI analysis:', aiSessionResult.error);
      }
    } catch (error) {
      console.warn('AI session initialization failed, continuing in degraded mode:', error);
    }
  }, [handleWebRTCConnectionChange, handleWebRTCError]);

  // 断开连接
  const disconnect = useCallback(async () => {
    try {
      await aiSessionWebRTC.disconnect();
    } catch (error) {
      console.warn('Error during disconnect:', error);
    }
  }, []);

  // 页面卸载时断开连接
  useEffect(() => {
    const handleUnload = () => { aiSessionWebRTC.disconnect().catch(console.error); };
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
