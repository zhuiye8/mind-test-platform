/**

 * AI分析服务配置
 */

// AI服务配置 - 若未显式设置，则使用本地地址
export const AI_SERVICE_BASE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5678';

// 默认超时配置
export const DEFAULT_TIMEOUT = {
  HEALTH_CHECK: 5000,
  // 提高会话操作超时：AI端在 end_session 中可能进行合并/写盘/异步回调
  // 10s 容易在低配或大数据时超时，提升到 30s 更稳妥
  SESSION_OPERATIONS: 30000,
  REPORT_GENERATION: 30000,
  WEBSOCKET_CHECK: 5000,
} as const;

// WebSocket URL构建器
export function buildWebSocketUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}/socket.io/`;
  } catch (error) {
    console.error('构建WebSocket URL失败:', error);
    return `ws://localhost:5678/socket.io/`;
  }
}
