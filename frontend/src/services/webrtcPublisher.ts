// 轻量版 WHIP 推流器（使用 MediaMTX，经后端代理）

export type PublisherState = 'idle' | 'connecting' | 'connected' | 'failed' | 'stopped';

interface StartOptions {
  examUuid?: string;
  participantId?: string;
  // 提供已有的媒体流（优先使用）
  streams?: { video?: MediaStream | null; audio?: MediaStream | null };
  // 码率/帧率参数
  maxBitrate?: number; // bps
  maxFramerate?: number;
  preferCodec?: 'VP8' | 'H264';
}

export class WebRTCPublisher {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private resourceUrl: string = '';
  private state: PublisherState = 'idle';
  private onState?: (s: PublisherState) => void;

  onStateChange(cb: (s: PublisherState) => void) {
    this.onState = cb;
  }

  private setState(s: PublisherState) {
    this.state = s;
    if (this.onState) this.onState(s);
  }

  async start(opts: StartOptions = {}): Promise<{ streamName: string }> {
    try {
      this.setState('connecting');

      // 1) 获取流名与 WHIP 端点
      const resp = await fetch('/api/webrtc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_uuid: opts.examUuid, participant_id: opts.participantId })
      }).then(r => r.json());
      if (!resp?.success) throw new Error(resp?.error || 'start stream failed');
      const { streamName, whipUrl } = resp.data;

      // 2) 建立 PC
      this.pc = new RTCPeerConnection({
        iceServers: [],
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      } as any);

      // 3) 注入轨道
      if (opts.streams?.video || opts.streams?.audio) {
        this.localStream = new MediaStream();
        if (opts.streams.video) opts.streams.video.getVideoTracks().forEach(t => this.localStream!.addTrack(t));
        if (opts.streams.audio) opts.streams.audio.getAudioTracks().forEach(t => this.localStream!.addTrack(t));
      } else {
        // 降级获取最小可用流
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
          audio: true
        });
      }
      const tracks = this.localStream.getTracks();
      tracks.forEach(t => this.pc!.addTrack(t, this.localStream!));

      // 4) 优先编码器
      try {
        const tcv = this.pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video');
        const codecs = (RTCRtpReceiver.getCapabilities('video')?.codecs || []);
        const prefer = opts.preferCodec || 'VP8';
        const preferMime = prefer === 'H264' ? 'video/H264' : 'video/VP8';
        const preferred = codecs.filter(c => c.mimeType === preferMime);
        const others = codecs.filter(c => c.mimeType !== preferMime);
        if (tcv && preferred.length) tcv.setCodecPreferences([...preferred, ...others]);
      } catch {}

      // 5) 编码参数（码率/帧率）
      try {
        const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          const p = sender.getParameters();
          if (!p.encodings || p.encodings.length === 0) p.encodings = [{}];
          p.encodings[0].maxBitrate = opts.maxBitrate ?? 6_000_000;
          p.encodings[0].maxFramerate = opts.maxFramerate ?? 60;
          p.encodings[0].scaleResolutionDownBy = 1;
          (p as any).degradationPreference = 'maintain-resolution';
          await sender.setParameters(p);
        }
      } catch {}

      // 6) Offer → LocalDescription
      const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false } as any);
      await this.pc.setLocalDescription(offer);

      // 7) 等待 ICE 完成（简单等待 1s 或到 complete）
      await new Promise<void>((resolve) => {
        if (!this.pc) return resolve();
        const timer = setTimeout(resolve, 1000);
        const handler = () => {
          if (this.pc?.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); }
        };
        this.pc.addEventListener('icegatheringstatechange', handler, { once: true });
      });

      // 8) 发送 WHIP（通过后端代理）
      const sdp = this.pc.localDescription?.sdp || '';
      const ans = await fetch(whipUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp', 'Accept': 'application/sdp' },
        body: sdp
      });
      if (!ans.ok) {
        try {
          const ct = ans.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const j = await ans.json();
            throw new Error(`WHIP failed: ${ans.status} ${j?.error || ''} ${j?.details || ''} ${j?.endpointTried ? `endpoints=${j.endpointTried.join(',')}` : ''}`.trim());
          } else {
            const t = await ans.text();
            throw new Error(`WHIP failed: ${ans.status} ${t}`.trim());
          }
        } catch (e: any) {
          throw new Error(`WHIP failed: ${ans.status}`);
        }
      }
      const answerSdp = await ans.text();
      const loc = ans.headers.get('Location') || '';
      this.resourceUrl = loc;

      await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      this.setState('connected');
      return { streamName };
    } catch (e) {
      console.error('Publisher start failed:', e);
      this.setState('failed');
      throw e;
    }
  }

  async stop(): Promise<void> {
    try {
      this.setState('stopped');
      if (this.pc) { this.pc.close(); this.pc = null; }
      if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
      if (this.resourceUrl) {
        try { await fetch(this.resourceUrl, { method: 'DELETE' }); } catch {}
        this.resourceUrl = '';
      }
    } catch (e) {
      console.warn('Publisher stop error:', e);
    }
  }
}

export default new WebRTCPublisher();
