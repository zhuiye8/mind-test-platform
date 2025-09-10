import fetch from 'node-fetch';
import { generateStreamName, getRtspUrlForStream } from '../utils/streamName';

const getMediaMtxHost = () => process.env.MEDIAMTX_HOST || 'http://127.0.0.1:8889';
const getAIServiceBase = () => process.env.AI_SERVICE_URL || 'http://localhost:5678';

export function computeStreamName(examUuid?: string, participantId?: string): string {
  return generateStreamName(examUuid, participantId);
}

export async function startAIConsumerForStream(streamName: string): Promise<boolean> {
  const aiUrl = `${getAIServiceBase()}/api/rtsp/start`;
  const rtspUrl = getRtspUrlForStream(streamName, getMediaMtxHost());
  try {
    const res = await fetch(aiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream_name: streamName, rtsp_url: rtspUrl })
    });
    if (!res.ok) return false;
    const j = await res.json().catch(() => ({})) as any;
    return !!j?.success;
  } catch (e) {
    return false;
  }
}

export async function stopAIConsumerForStream(streamName: string): Promise<boolean> {
  const aiUrl = `${getAIServiceBase()}/api/rtsp/stop`;
  try {
    const res = await fetch(aiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream_name: streamName })
    });
    if (!res.ok) return false;
    const j = await res.json().catch(() => ({})) as any;
    return !!j?.success;
  } catch (e) {
    return false;
  }
}

export function buildWhipUrl(streamName: string): string {
  return `/api/webrtc/whip?stream=${encodeURIComponent(streamName)}`;
}

export function buildWhepUrl(streamName: string): string {
  return `/api/webrtc/whep?stream=${encodeURIComponent(streamName)}`;
}

export function getRtspPlaybackUrl(streamName: string): string {
  return getRtspUrlForStream(streamName, getMediaMtxHost());
}

