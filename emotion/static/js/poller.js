// 轮询与音频状态指示（从 app.js 拆分，保持逻辑不变）
(function initPoller(){
  // 开始轮询 AI 最新状态（视频/心率/音频）
  function startStatePollingForStudent(student){
    if (typeof window.stopStatePolling === 'function') {
      window.stopStatePolling();
    }
    if (!student) return;
    const streamName = student.stream_name || window.computeStreamName(student.exam_id, student.student_id);
    window.dlog && dlog('[Poller] 开始轮询分析状态：', streamName);
    let lastVersion = -1;
    window.statePollTimer = setInterval(async () => {
      try {
        const resp = await fetch(`/api/monitor/state?stream_name=${encodeURIComponent(streamName)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const st = data && data.state;
        if (!st) return;
        if (typeof st.version === 'number' && st.version === lastVersion) return; // 无增量
        lastVersion = st.version || lastVersion;
        window.dlog && dlog('[Poller] 最新状态:', st);
        if (st.video) {
          window.updateVideoEmotionDisplay(st.video);
          if (st.video.dominant_emotion) {
            window.updateVideoEmotionResult && window.updateVideoEmotionResult({ dominant: st.video.dominant_emotion });
            window.updateTrendData && window.updateTrendData('video', st.video.dominant_emotion, st.video.timestamp || new Date().toISOString());
          }
        }
        if (st.heart) {
          window.updateHeartRateDisplay(st.heart);
        }
        if (st.audio) {
          window.handleAudioEmotionResult && window.handleAudioEmotionResult({ result: st.audio });
        }
      } catch (e) {
        // 静默失败，继续轮询
      }
    }, 1000);
  }

  function stopStatePolling(){
    if (window.statePollTimer) {
      clearInterval(window.statePollTimer);
      window.statePollTimer = null;
      window.dlog && dlog('[Poller] 已停止状态轮询');
    }
  }

  // RTSP 音频状态轮询（活跃/间歇/无数据） - 已禁用
  function startAudioStatusPolling(student){
    return; // 已禁用音频状态轮询
    if (typeof window.stopAudioStatusPolling === 'function') {
      window.stopAudioStatusPolling();
    }
    if (!student) return;
    const el = document.getElementById('rtspAudioStatus');
    const streamName = student.stream_name || window.computeStreamName(student.exam_id, student.student_id);
    window.audioStatusTimer = setInterval(async () => {
      try {
        const st = await fetch('/api/rtsp/status').then(r => r.json());
        const cons = st && st.consumers;
        const c = cons && cons[streamName];
        if (!el) return;
        if (!c) { el.textContent = '音频状态: 未启动'; el.style.color = '#ccc'; return; }
        if (!c.audio_started) { el.textContent = '音频状态: 未启动'; el.style.color = '#ccc'; return; }
        const chunks = c.audio_chunks || 0;
        const lastAge = (typeof c.audio_last_age_sec === 'number') ? c.audio_last_age_sec : null;
        if (chunks > 0 && lastAge !== null && lastAge < 5) {
          el.textContent = `音频状态: 活跃 (段=${chunks})`;
          el.style.color = '#00d4ff';
        } else if (chunks > 0) {
          el.textContent = `音频状态: 间歇 (段=${chunks})`;
          el.style.color = '#ffcc00';
        } else {
          el.textContent = '音频状态: 无数据';
          el.style.color = '#ccc';
        }
      } catch { /* 忽略单次失败 */ }
    }, 1500);
  }

  function stopAudioStatusPolling(){
    return; // 已禁用音频状态轮询
    if (window.audioStatusTimer) { clearInterval(window.audioStatusTimer); window.audioStatusTimer = null; }
    const el = document.getElementById('rtspAudioStatus');
    if (el) { el.textContent = '音频状态: --'; el.style.color = '#ccc'; }
  }

  // 暴露为全局模块（保持原函数名不变）
  window.startStatePollingForStudent = startStatePollingForStudent;
  window.stopStatePolling = stopStatePolling;
  window.startAudioStatusPolling = startAudioStatusPolling;
  window.stopAudioStatusPolling = stopAudioStatusPolling;
})();

