/**
 * 媒体工具函数 - 统一约束与回退策略
 */

export const VIDEO_PRESETS: MediaStreamConstraints[] = [
  { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 }, facingMode: 'user' } },
  { video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 10 }, facingMode: 'user' } },
  { video: true },
];

export const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};

export async function getBestVideoStream(): Promise<{ stream: MediaStream | null; constraints?: any }> {
  for (const constraints of VIDEO_PRESETS) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return { stream, constraints };
    } catch (err) {
      console.warn('视频预设失败，回退继续:', (err as any)?.name || err);
      continue;
    }
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const allCameras = devices.filter(d => d.kind === 'videoinput');
    const realCameras = allCameras.filter(d => !/virtual/i.test(d.label));
    const virtualCameras = allCameras.filter(d => /virtual/i.test(d.label));
    const cameras = [...realCameras, ...virtualCameras];

    for (const cam of cameras) {
      try {
        const constraints = { video: { deviceId: { exact: cam.deviceId }, frameRate: { ideal: 10 } } };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return { stream, constraints };
      } catch (err) {
        console.warn(`摄像头 ${cam.label || cam.deviceId} 打开失败:`, (err as any)?.name || err);
      }
    }
  } catch (e) {
    console.warn('列举设备失败:', e);
  }

  return { stream: null };
}

export async function getBestAudioStream(): Promise<{ stream: MediaStream | null; constraints?: any }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
    return { stream, constraints: AUDIO_CONSTRAINTS };
  } catch (err) {
    console.warn('音频权限获取失败:', (err as any)?.name || err);
    return { stream: null };
  }
}

