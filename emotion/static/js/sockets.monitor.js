// 监控命名空间 Socket 连接与事件（从 app.js 拆分）
// 依赖：app.js 中的全局变量/函数：monitorSocket、socket、currentMode、
// currentMonitoringStudent、handleStudentVideoEmotionResult、handleStudentHeartRateResult、
// handleStudentAudioEmotionResult、handleAudioEmotionResult、updateVideoEmotionDisplay、
// updateHeartRateDisplay、computeStreamName、_matchesCurrentStudentSession、dlog
(function initMonitorSockets(){
  function connectMonitorSocketImpl() {
    if (window.monitorSocket && window.monitorSocket.connected) {
      window.dlog && dlog('[Monitor] 命名空间已连接');
      return;
    }
    try {
      if (typeof io === 'undefined') {
        console.warn('[Monitor] Socket.IO未加载，跳过监控命名空间连接');
        return;
      }
      // Flask-SocketIO threading 模式需允许回退到 polling
      window.monitorSocket = io('/monitor', {
        transports: ['websocket', 'polling'],
        path: '/socket.io',
        withCredentials: false
      });
      window.monitorSocket.on('connect', () => {
        window.dlog && dlog('[Monitor] 连接成功, sid=', window.monitorSocket.id);
        try {
          if (window.socket && window.socket.id) {
            window.monitorSocket.emit('monitor/register_sids', { default_sid: window.socket.id });
          }
        } catch (e) { console.warn('上报默认SID失败:', e); }
      });
      window.monitorSocket.on('disconnect', () => {
        window.dlog && dlog('[Monitor] 连接断开');
      });
      window.monitorSocket.on('monitor/subscribed', (data) => {
        window.dlog && dlog('[Monitor] 已订阅房间:', data);
      });
      window.monitorSocket.on('monitor/registered', (data) => {
        window.dlog && dlog('[Monitor] 已注册SID对应关系:', data);
      });
      window.monitorSocket.on('monitor/error', (e) => {
        console.warn('[Monitor] 订阅错误:', e);
      });
      // 标准化学生事件
      window.monitorSocket.on('student.emotion', (data) => {
        try {
          if (window.currentMode === 'monitor' && window.currentMonitoringStudent && window._matchesCurrentStudentSession(data.stream_name)) {
            window.handleStudentVideoEmotionResult({
              session_id: window.currentMonitoringStudent.session_id,
              student_id: window.currentMonitoringStudent.student_id,
              result: data.result
            });
          }
        } catch (e) { console.warn('student.emotion handler error:', e); }
      });
      window.monitorSocket.on('student.heart_rate', (data) => {
        try {
          if (window.currentMode === 'monitor' && window.currentMonitoringStudent && window._matchesCurrentStudentSession(data.stream_name)) {
            window.handleStudentHeartRateResult({
              session_id: window.currentMonitoringStudent.session_id,
              student_id: window.currentMonitoringStudent.student_id,
              result: data.result
            });
          }
        } catch (e) { console.warn('student.heart_rate handler error:', e); }
      });
      // 多种分析事件（与默认命名空间保持一致的事件名）
      window.monitorSocket.on('video_emotion_result', (data) => {
        try {
          if (window.currentMode === 'monitor' && window.currentMonitoringStudent && data.stream_name) {
            const streamName = window.currentMonitoringStudent.stream_name || window.computeStreamName(window.currentMonitoringStudent.exam_id, window.currentMonitoringStudent.student_id);
            if (data.stream_name === streamName) {
              window.updateVideoEmotionDisplay(data.result);
            } else {
              window.dlog && dlog('[Monitor] video_emotion_result 流名称不匹配，忽略');
            }
          } else {
            window.dlog && dlog('[Monitor] 未处理 video_emotion_result（条件不满足）');
          }
        } catch (e) { console.warn('❌ Monitor video_emotion_result handler error:', e); }
      });
      window.monitorSocket.on('student.audio', (data) => {
        try {
          if (window.currentMode === 'monitor' && window.currentMonitoringStudent && window._matchesCurrentStudentSession(data.stream_name)) {
            window.handleStudentAudioEmotionResult({
              session_id: window.currentMonitoringStudent.session_id,
              student_id: window.currentMonitoringStudent.student_id,
              result: data.result
            });
          }
        } catch (e) { console.warn('student.audio handler error:', e); }
      });
      window.monitorSocket.on('audio_emotion_result', (data) => {
        try {
          if (window.currentMode === 'monitor' && window.currentMonitoringStudent && data.stream_name) {
            const streamName = window.currentMonitoringStudent.stream_name || window.computeStreamName(window.currentMonitoringStudent.exam_id, window.currentMonitoringStudent.student_id);
            if (data.stream_name === streamName) {
              window.handleAudioEmotionResult({ result: data.result });
            } else {
              window.dlog && dlog('[Monitor] 音频流名称不匹配，忽略');
            }
          } else if (window.currentMode === 'monitor' && window.currentMonitoringStudent && !data.stream_name) {
            window.dlog && dlog('[Monitor] 无 stream_name 的音频事件，尝试直接更新');
            window.handleAudioEmotionResult({ result: data.result });
          }
        } catch (e) { console.warn('❌ Monitor audio_emotion_result handler error:', e); }
      });
      window.monitorSocket.on('rtsp_video_analysis', (data) => {
        try {
          if (window.currentMode === 'monitor' && window.currentMonitoringStudent && data.stream_name) {
            const streamName = window.currentMonitoringStudent.stream_name || window.computeStreamName(window.currentMonitoringStudent.exam_id, window.currentMonitoringStudent.student_id);
            if (data.stream_name === streamName) {
              window.updateVideoEmotionDisplay(data.result);
            }
          }
        } catch (e) { console.warn('❌ Monitor rtsp_video_analysis handler error:', e); }
      });
      window.monitorSocket.on('heart_rate_result', (data) => {
        try {
          if (window.currentMode === 'monitor' && window.currentMonitoringStudent && data.stream_name) {
            const streamName = window.currentMonitoringStudent.stream_name || window.computeStreamName(window.currentMonitoringStudent.exam_id, window.currentMonitoringStudent.student_id);
            if (data.stream_name === streamName) {
              window.updateHeartRateDisplay(data.result);
            }
          }
        } catch (e) { console.warn('❌ Monitor heart_rate_result handler error:', e); }
      });
      window.monitorSocket.on('rtsp_heart_rate_analysis', (data) => {
        try {
          if (window.currentMode === 'monitor' && window.currentMonitoringStudent && data.stream_name) {
            const streamName = window.currentMonitoringStudent.stream_name || window.computeStreamName(window.currentMonitoringStudent.exam_id, window.currentMonitoringStudent.student_id);
            if (data.stream_name === streamName) {
              window.updateHeartRateDisplay(data.result);
            }
          }
        } catch (e) { console.warn('❌ Monitor rtsp_heart_rate_analysis handler error:', e); }
      });
    } catch (e) {
      console.warn('[Monitor] 命名空间连接失败:', e);
    }
  }

  // 暴露为全局模块
  window.MonitorSockets = { connectMonitorSocket: connectMonitorSocketImpl };
})();
