import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import {
  computeStreamName,
  startAIConsumerForStream,
  stopAIConsumerForStream,
  buildWhipUrl,
  buildWhepUrl,
  getRtspPlaybackUrl,
} from '../services/webrtcStreamService';

const router = Router();

// 读取 MediaMTX 主机地址
const getMediaMtxHost = () => process.env.MEDIAMTX_HOST || 'http://127.0.0.1:8889';

interface SDPRequest extends Request { body: string }

// WHIP 代理：POST /api/webrtc/whip?stream=<name>
router.post('/webrtc/whip', async (req: SDPRequest, res: Response) => {
  try {
    if (!req.body || typeof req.body !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid SDP in request body' });
    }
    if (req.get('Content-Type') !== 'application/sdp') {
      return res.status(400).json({ error: 'Content-Type must be application/sdp' });
    }

    const mediamtxHost = getMediaMtxHost();
    const streamName = (req.query.stream as string) || process.env.STREAM_NAME || 'mystream';
    // 先试新式 /whip/<stream>，若404则回退到 /<stream>/whip
    const primary = `${mediamtxHost}/whip/${streamName}`;
    const doPost = (endpoint: string) => fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        'Accept': 'application/sdp'
      },
      body: req.body
    });

    let response = await doPost(primary);
    if (response.status === 404) {
      const fallback = `${mediamtxHost}/${streamName}/whip`;
      response = await doPost(fallback);
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: 'MediaMTX WHIP failed (fallback)', details: text, endpointTried: [primary, fallback] });
      }
    } else if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'MediaMTX WHIP failed', details: text, endpointTried: [primary] });
    }

    const answerSdp = await response.text();
    const location = response.headers.get('Location');
    if (location) res.set('Location', location);
    res.set('Content-Type', 'application/sdp');
    return res.send(answerSdp);
  } catch (err: any) {
    return res.status(500).json({ error: 'WHIP proxy error', message: err.message });
  }
});

// WHEP 代理：POST /api/webrtc/whep?stream=<name>
router.post('/webrtc/whep', async (req: SDPRequest, res: Response) => {
  try {
    if (!req.body || typeof req.body !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid SDP in request body' });
    }
    if (req.get('Content-Type') !== 'application/sdp') {
      return res.status(400).json({ error: 'Content-Type must be application/sdp' });
    }

    const mediamtxHost = getMediaMtxHost();
    const streamName = (req.query.stream as string) || process.env.STREAM_NAME || 'mystream';
    const primary = `${mediamtxHost}/whep/${streamName}`;
    const doPost = (endpoint: string) => fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        'Accept': 'application/sdp'
      },
      body: req.body
    });

    let response = await doPost(primary);
    if (response.status === 404) {
      const fallback = `${mediamtxHost}/${streamName}/whep`;
      response = await doPost(fallback);
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: 'MediaMTX WHEP failed (fallback)', details: text, endpointTried: [primary, fallback] });
      }
    } else if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'MediaMTX WHEP failed', details: text, endpointTried: [primary] });
    }

    const answerSdp = await response.text();
    const location = response.headers.get('Location');
    if (location) res.set('Location', location);
    res.set('Content-Type', 'application/sdp');
    return res.send(answerSdp);
  } catch (err: any) {
    return res.status(500).json({ error: 'WHEP proxy error', message: err.message });
  }
});

// 会话→流 启动：POST /api/webrtc/start
router.post('/webrtc/start', async (req: Request, res: Response) => {
  try {
    const { exam_uuid, participant_id } = req.body || {};
    const streamName = computeStreamName(exam_uuid, participant_id);
    const whipUrl = buildWhipUrl(streamName);
    const whepUrl = buildWhepUrl(streamName);
    const rtspUrl = getRtspPlaybackUrl(streamName);

    let aiRtspStarted = false;
    // 默认不在首次调用时启动AI RTSP消费，避免推流尚未建立导致"no stream"竞态
    if ((process.env.AI_AUTOSTART_RTSP || 'false') === 'true') {
      aiRtspStarted = await startAIConsumerForStream(streamName);
      // 可见日志，便于排障
      try { console.log(`[WebRTC] RTSP start requested for ${streamName}: ${aiRtspStarted}`); } catch {}
    }

    res.json({ success: true, data: { streamName, whipUrl, whepUrl, rtspUrl, aiRtspStarted } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 停止流消费：POST /api/webrtc/stop
router.post('/webrtc/stop', async (req: Request, res: Response) => {
  try {
    const { exam_uuid, participant_id } = req.body || {};
    const streamName = computeStreamName(exam_uuid, participant_id);
    const ok = await stopAIConsumerForStream(streamName);
    res.json({ success: true, data: { streamName, aiRtspStopped: ok } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
