import request from 'supertest';
import express from 'express';
import aiServiceRoutes from './aiServiceRoutes';

jest.mock('../services/aiAnalysis', () => ({
  aiAnalysisService: {
    checkHealth: jest.fn().mockResolvedValue(true),
    checkWebSocketHealth: jest.fn().mockResolvedValue({ websocketUrl: 'ws://mock', available: true }),
  },
}));

describe('AI 服务专用路由', () => {
  const app = express();
  app.use('/api/ai-service', aiServiceRoutes);

  it('应返回 AI 服务配置', async () => {
    const res = await request(app).get('/api/ai-service/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.websocket_url).toBe('ws://mock');
  });
});
