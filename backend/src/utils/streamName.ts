export function generateStreamName(examUuid?: string, participantId?: string): string {
  const ex = (examUuid || 'dev').toString().replace(/[^a-zA-Z0-9_-]/g, '');
  const pid = (participantId || 'anon').toString().replace(/[^a-zA-Z0-9_-]/g, '');
  return `exam-${ex.slice(0, 8)}-user-${pid.slice(0, 8)}`;
}

export function getRtspUrlForStream(streamName: string, mediamtxHostHttp?: string): string {
  // MEDIAMTX_HOST 形如 http://127.0.0.1:8889
  const base = mediamtxHostHttp || process.env.MEDIAMTX_HOST || 'http://127.0.0.1:8889';
  let host = '127.0.0.1';
  try {
    const u = new URL(base);
    host = u.hostname;
  } catch {}
  return `rtsp://${host}:8554/${streamName}`;
}

