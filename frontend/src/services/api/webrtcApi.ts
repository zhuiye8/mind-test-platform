import api from './base';

export const webrtcApi = {
  async startStream(payload: { exam_uuid?: string; participant_id?: string }): Promise<{ success: boolean; data?: { streamName: string; whipUrl: string; whepUrl: string; rtspUrl: string }; error?: string }> {
    return api.post('/webrtc/start', payload);
  }
};

export default webrtcApi;

