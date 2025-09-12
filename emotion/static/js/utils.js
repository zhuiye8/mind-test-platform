// 纯工具函数（从 app.js 拆出，保持逻辑一致）
(function initUtils(){
  // 计算流名（与后端规则完全一致）
  function computeStreamName(exam_id, student_id) {
    function sanitize(s) {
      if (!s) return '';
      return ('' + s).replace(/[^a-zA-Z0-9_-]/g, '');
    }
    const ex = (sanitize(exam_id).slice(0, 8) || 'dev');
    const pid = (sanitize(student_id).slice(0, 8) || 'anon');
    return `exam-${ex}-user-${pid}`;
  }

  // 比较是否匹配当前监控学生（支持会话ID或流名）
  function matchesCurrentStudentSession(currentMonitoringStudent, sessionIdOrStream) {
    if (!currentMonitoringStudent) return false;
    const sid = currentMonitoringStudent.session_id;
    const sname = currentMonitoringStudent.stream_name;
    return sessionIdOrStream === sid || (sname && sessionIdOrStream === sname);
  }

  // 暴露到全局，避免改动现有调用点
  window.computeStreamName = window.computeStreamName || computeStreamName;
  window._matchesCurrentStudentSession = window._matchesCurrentStudentSession || function(sessionIdOrStream){
    return matchesCurrentStudentSession(window.currentMonitoringStudent, sessionIdOrStream);
  };
})();
