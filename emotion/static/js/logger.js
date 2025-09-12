// 轻量日志模块（前端）
// 用法：URL 追加 ?debug=1 开启详细日志；默认仅输出关键日志
(function initLogger() {
  try {
    const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
    const dlog = (...args) => { if (DEBUG) console.log(...args); };
    // 暴露为全局对象，供其他脚本复用
    window.DEBUG = DEBUG;
    window.dlog = dlog;
  } catch (e) {
    // 兜底：静默失败
    window.DEBUG = false;
    window.dlog = function(){};
  }
})();
