/**
 * 媒体工具函数 - 统一约束与回退策略
 */

export const VIDEO_PRESETS: MediaStreamConstraints[] = [
  { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 }, facingMode: 'user', aspectRatio: 4/3 } },
  { video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 10 }, facingMode: 'user', aspectRatio: 16/9 } },
  { video: { width: { min: 320 }, height: { min: 240 }, frameRate: { min: 5, max: 30 } } },
  { video: true },
];

export const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: { 
    echoCancellation: true, 
    noiseSuppression: true, 
    autoGainControl: true,
    sampleRate: 44100,
    channelCount: 1
  },
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
    
    // Windows特殊处理：过滤掉有问题的虚拟摄像头
    const problematicDevices = /virtual|obs|snap|youcam|manycam|droidcam/i;
    const realCameras = allCameras.filter(d => !problematicDevices.test(d.label || ''));
    const virtualCameras = allCameras.filter(d => problematicDevices.test(d.label || ''));
    
    // 优先使用真实摄像头，虚拟摄像头作为最后备选
    const cameras = [...realCameras, ...virtualCameras];

    for (const cam of cameras) {
      try {
        // Windows优化约束
        const constraints = { 
          video: { 
            deviceId: { exact: cam.deviceId }, 
            frameRate: { ideal: 15, min: 5, max: 30 },
            width: { ideal: 640, min: 320 },
            height: { ideal: 480, min: 240 },
            aspectRatio: 4/3
          } 
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log(`成功获取摄像头: ${cam.label || cam.deviceId}`);
        return { stream, constraints };
      } catch (err) {
        const errorName = (err as any)?.name || 'UnknownError';
        console.warn(`摄像头 ${cam.label || cam.deviceId} 打开失败 (${errorName}):`, err);
        
        // 如果是NotReadableError，说明设备被占用，等待一小段时间后重试
        if (errorName === 'NotReadableError') {
          console.log(`设备 ${cam.label} 被占用，等待释放后重试...`);
          // 等待200ms让设备释放
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // 重试一次
          try {
            const retryStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log(`重试成功，获取摄像头: ${cam.label || cam.deviceId}`);
            return { stream: retryStream, constraints };
          } catch (retryErr) {
            console.warn(`重试失败，摄像头 ${cam.label || cam.deviceId}:`, retryErr);
            continue;
          }
        }
      }
    }
  } catch (e) {
    console.warn('列举设备失败:', e);
  }

  return { stream: null };
}

export async function getBestAudioStream(): Promise<{ stream: MediaStream | null; constraints?: any }> {
  // 尝试多种音频约束策略
  const audioStrategies = [
    AUDIO_CONSTRAINTS,
    { audio: { echoCancellation: true, noiseSuppression: true } }, // 移除autoGainControl
    { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }, // 最基础约束
    { audio: true }, // 最简约束
  ];

  for (let i = 0; i < audioStrategies.length; i++) {
    const constraints = audioStrategies[i];
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(`音频获取成功，使用策略 ${i + 1}:`, constraints);
      return { stream, constraints };
    } catch (err) {
      const errorName = (err as any)?.name || 'UnknownError';
      console.warn(`音频策略 ${i + 1} 失败 (${errorName}):`, err);
      
      // 如果是NotReadableError，尝试等待后重试
      if (errorName === 'NotReadableError') {
        console.log(`音频设备被占用，等待释放后重试策略 ${i + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        try {
          const retryStream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log(`音频重试成功，使用策略 ${i + 1}:`, constraints);
          return { stream: retryStream, constraints };
        } catch (retryErr) {
          console.warn(`音频重试失败，策略 ${i + 1}:`, retryErr);
        }
      }
      
      // 如果是设备未找到，直接结束尝试
      if (errorName === 'NotFoundError' && i === audioStrategies.length - 1) {
        console.error('系统中没有可用的音频输入设备');
      }
      continue;
    }
  }
  
  return { stream: null };
}

