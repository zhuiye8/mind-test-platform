#!/usr/bin/env node

/**
 * Mock Emotion AI Service
 * 模拟情绪分析AI服务，用于测试和开发
 * 支持视频和音频流处理，提供Web控制台实时监控
 */

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// 配置
const CONFIG = {
  port: 8080,
  emotionUpdateInterval: 2000, // 2秒更新一次情绪数据
  audioAnalysisInterval: 100,  // 100ms分析一次音频数据
  maxConnections: 50,
  logLevel: 'info'
};

// 存储活跃连接和会话数据
const activeSessions = new Map();
const connectionStats = {
  total: 0,
  active: 0,
  audioOnly: 0,
  video: 0
};

// 模拟情绪生成器
class EmotionGenerator {
  constructor() {
    this.baseEmotions = {
      happiness: 0.6,
      sadness: 0.2,
      anger: 0.1,
      fear: 0.15,
      surprise: 0.3,
      disgust: 0.05
    };
    this.trend = {};
    this.initTrends();
  }

  initTrends() {
    Object.keys(this.baseEmotions).forEach(emotion => {
      this.trend[emotion] = (Math.random() - 0.5) * 0.1;
    });
  }

  generateEmotions(audioLevel = 0, isAudioOnly = false) {
    const emotions = {};
    
    // 基于音频级别调整情绪
    const audioInfluence = Math.min(audioLevel / 100, 1);
    
    Object.keys(this.baseEmotions).forEach(emotion => {
      let value = this.baseEmotions[emotion];
      
      // 添加趋势
      value += this.trend[emotion];
      
      // 音频影响
      if (isAudioOnly) {
        if (emotion === 'happiness' || emotion === 'surprise') {
          value += audioInfluence * 0.3;
        }
        if (emotion === 'fear' || emotion === 'sadness') {
          value += (1 - audioInfluence) * 0.2;
        }
      }
      
      // 添加随机波动
      value += (Math.random() - 0.5) * 0.2;
      
      // 限制范围
      emotions[emotion] = Math.max(0, Math.min(1, value));
      
      // 更新趋势
      if (Math.random() < 0.1) {
        this.trend[emotion] = (Math.random() - 0.5) * 0.1;
      }
    });
    
    return emotions;
  }

  generateEngagementAndStress(audioLevel = 0, emotions = {}) {
    const avgPositive = (emotions.happiness + emotions.surprise) / 2;
    const avgNegative = (emotions.sadness + emotions.anger + emotions.fear) / 3;
    
    const engagement = Math.min(1, avgPositive + (audioLevel / 200));
    const stress = Math.max(0, avgNegative - (audioLevel / 300));
    
    return { engagement, stress };
  }
}

// 会话管理器
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.emotionGenerator = new EmotionGenerator();
  }

  createSession(sessionId, examId, studentId, audioOnly = false) {
    const session = {
      sessionId,
      examId,
      studentId,
      audioOnly,
      connected: true,
      startTime: Date.now(),
      lastActivity: Date.now(),
      frameCount: 0,
      audioLevel: 0,
      lastEmotionUpdate: 0,
      emotions: this.emotionGenerator.generateEmotions(0, audioOnly),
      engagement: 0.7,
      stress: 0.3,
      history: []
    };

    this.sessions.set(sessionId, session);
    activeSessions.set(sessionId, session);
    
    // 更新统计
    connectionStats.active++;
    if (audioOnly) {
      connectionStats.audioOnly++;
    } else {
      connectionStats.video++;
    }

    console.log(`📱 新会话创建: ${sessionId} (${examId}/${studentId}) [${audioOnly ? '音频' : '视频'}模式]`);
    return session;
  }

  updateSession(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.lastActivity = Date.now();
    session.frameCount++;

    if (data.type === 'audio_data' && data.data) {
      session.audioLevel = data.data.audioLevel || 0;
      
      // 每隔一定时间更新情绪数据
      if (Date.now() - session.lastEmotionUpdate > CONFIG.emotionUpdateInterval) {
        session.emotions = this.emotionGenerator.generateEmotions(session.audioLevel, session.audioOnly);
        const { engagement, stress } = this.emotionGenerator.generateEngagementAndStress(
          session.audioLevel, 
          session.emotions
        );
        session.engagement = engagement;
        session.stress = stress;
        session.lastEmotionUpdate = Date.now();

        // 添加到历史记录
        session.history.push({
          timestamp: Date.now(),
          emotions: { ...session.emotions },
          engagement,
          stress,
          audioLevel: session.audioLevel
        });

        // 限制历史记录长度
        if (session.history.length > 100) {
          session.history = session.history.slice(-50);
        }

        return session;
      }
    } else if (data.type === 'video_frame') {
      // 视频帧处理
      if (Date.now() - session.lastEmotionUpdate > CONFIG.emotionUpdateInterval) {
        session.emotions = this.emotionGenerator.generateEmotions(0, false);
        const { engagement, stress } = this.emotionGenerator.generateEngagementAndStress(
          0, 
          session.emotions
        );
        session.engagement = engagement;
        session.stress = stress;
        session.lastEmotionUpdate = Date.now();

        session.history.push({
          timestamp: Date.now(),
          emotions: { ...session.emotions },
          engagement,
          stress,
          audioLevel: 0
        });

        if (session.history.length > 100) {
          session.history = session.history.slice(-50);
        }

        return session;
      }
    }

    return null;
  }

  removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      activeSessions.delete(sessionId);
      
      // 更新统计
      connectionStats.active--;
      if (session.audioOnly) {
        connectionStats.audioOnly--;
      } else {
        connectionStats.video--;
      }

      console.log(`❌ 会话结束: ${sessionId} (持续${Math.round((Date.now() - session.startTime) / 1000)}秒)`);
    }
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }
}

const sessionManager = new SessionManager();

// WebSocket服务器
const wss = new WebSocket.Server({ 
  server,
  path: '/api/emotion/stream'
});

wss.on('connection', (ws, req) => {
  connectionStats.total++;
  
  const url = new URL(req.url, 'http://localhost');
  const examId = url.searchParams.get('examId');
  const studentId = url.searchParams.get('studentId');
  const audioOnly = url.searchParams.get('audioOnly') === 'true';
  
  const sessionId = `${examId}_${studentId}_${Date.now()}`;
  
  console.log(`🔗 WebSocket连接建立: ${sessionId} [${audioOnly ? '音频' : '视频'}模式]`);

  // 创建会话
  let session = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'init') {
        // 初始化会话
        session = sessionManager.createSession(
          sessionId,
          data.examId,
          data.studentId,
          data.audioOnly
        );
        
        // 发送连接确认
        ws.send(JSON.stringify({
          type: 'connected',
          sessionId: sessionId,
          audioOnly: data.audioOnly,
          timestamp: Date.now()
        }));

      } else if (session && (data.type === 'audio_data' || data.type === 'video_frame')) {
        // 更新会话数据
        const updatedSession = sessionManager.updateSession(sessionId, data);
        
        if (updatedSession) {
          // 发送情绪分析结果
          ws.send(JSON.stringify({
            type: 'emotion_data',
            payload: {
              timestamp: Date.now(),
              emotions: updatedSession.emotions,
              engagement: updatedSession.engagement,
              stress: updatedSession.stress
            }
          }));
        }

      } else if (data.type === 'stop_analysis') {
        // 发送分析完成消息
        ws.send(JSON.stringify({
          type: 'analysis_complete',
          analysisId: `analysis_${sessionId}_${Date.now()}`,
          timestamp: Date.now()
        }));
      }
      
    } catch (error) {
      console.error('处理WebSocket消息失败:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: '数据处理失败'
      }));
    }
  });

  ws.on('close', () => {
    if (session) {
      sessionManager.removeSession(sessionId);
    }
    console.log(`🔌 WebSocket连接关闭: ${sessionId}`);
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket错误 ${sessionId}:`, error);
    if (session) {
      sessionManager.removeSession(sessionId);
    }
  });
});

// 静态文件服务和API
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API端点
app.get('/api/stats', (req, res) => {
  res.json({
    connections: connectionStats,
    activeSessions: sessionManager.getAllSessions().length,
    uptime: process.uptime()
  });
});

app.get('/api/sessions', (req, res) => {
  const sessions = sessionManager.getAllSessions().map(session => ({
    sessionId: session.sessionId,
    examId: session.examId,
    studentId: session.studentId,
    audioOnly: session.audioOnly,
    startTime: session.startTime,
    lastActivity: session.lastActivity,
    frameCount: session.frameCount,
    audioLevel: session.audioLevel,
    emotions: session.emotions,
    engagement: session.engagement,
    stress: session.stress,
    duration: Math.round((Date.now() - session.startTime) / 1000)
  }));
  
  res.json(sessions);
});

app.get('/api/sessions/:sessionId/history', (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: '会话不存在' });
  }
  
  res.json(session.history);
});

// Web控制台HTML
const webConsoleHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mock Emotion AI Service - 情绪分析监控台</title>
    <script src="https://unpkg.com/chart.js@3.9.1/dist/chart.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 {
            margin: 0;
            color: #2c3e50;
            font-size: 24px;
        }
        .stats {
            display: flex;
            gap: 20px;
        }
        .stat-item {
            text-align: center;
            padding: 10px 20px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 2px solid #e9ecef;
        }
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
            margin: 0;
        }
        .stat-label {
            font-size: 12px;
            color: #6c757d;
            margin: 5px 0 0 0;
        }
        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }
        .panel {
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            padding: 20px;
            min-height: 400px;
        }
        .panel h2 {
            margin: 0 0 20px 0;
            color: #2c3e50;
            font-size: 18px;
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 10px;
        }
        .session-list {
            max-height: 350px;
            overflow-y: auto;
        }
        .session-item {
            padding: 12px;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            margin-bottom: 10px;
            background: #f8f9fa;
            position: relative;
        }
        .session-item.audio-only {
            border-left: 4px solid #28a745;
        }
        .session-item.video {
            border-left: 4px solid #007bff;
        }
        .session-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .session-id {
            font-weight: bold;
            color: #495057;
            font-size: 14px;
        }
        .session-mode {
            background: #007bff;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
        }
        .session-mode.audio {
            background: #28a745;
        }
        .session-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            font-size: 12px;
            color: #6c757d;
        }
        .emotion-bars {
            margin-top: 10px;
        }
        .emotion-bar {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            font-size: 11px;
        }
        .emotion-name {
            width: 80px;
            text-align: right;
            margin-right: 8px;
        }
        .emotion-progress {
            flex: 1;
            height: 8px;
            background: #e9ecef;
            border-radius: 4px;
            overflow: hidden;
        }
        .emotion-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
        .emotion-value {
            width: 35px;
            text-align: center;
            font-size: 10px;
            margin-left: 5px;
        }
        .audio-level {
            display: flex;
            align-items: center;
            margin-top: 8px;
            font-size: 12px;
        }
        .audio-meter {
            flex: 1;
            height: 12px;
            background: #e9ecef;
            border-radius: 6px;
            margin: 0 8px;
            overflow: hidden;
        }
        .audio-meter-fill {
            height: 100%;
            background: linear-gradient(90deg, #28a745, #ffc107, #dc3545);
            border-radius: 6px;
            transition: width 0.1s ease;
        }
        .log-panel {
            grid-column: 1 / -1;
        }
        .log-content {
            background: #2c3e50;
            color: #ecf0f1;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            height: 200px;
            overflow-y: auto;
            padding: 15px;
            border-radius: 8px;
            white-space: pre-wrap;
        }
        .log-entry {
            margin-bottom: 2px;
        }
        .log-timestamp {
            color: #95a5a6;
        }
        .log-level-info { color: #3498db; }
        .log-level-warn { color: #f39c12; }
        .log-level-error { color: #e74c3c; }
        .refresh-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
        }
        .refresh-btn:hover {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Mock Emotion AI Service</h1>
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-number" id="totalConnections">0</div>
                    <div class="stat-label">总连接数</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="activeConnections">0</div>
                    <div class="stat-label">活跃连接</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="audioConnections">0</div>
                    <div class="stat-label">音频模式</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number" id="videoConnections">0</div>
                    <div class="stat-label">视频模式</div>
                </div>
            </div>
        </div>

        <div class="grid">
            <div class="panel">
                <h2>🎯 活跃会话监控</h2>
                <button class="refresh-btn" onclick="refreshData()">刷新数据</button>
                <div class="session-list" id="sessionList">
                    <div style="text-align: center; color: #6c757d; margin-top: 50px;">
                        暂无活跃会话
                    </div>
                </div>
            </div>

            <div class="panel">
                <h2>📊 情绪趋势图表</h2>
                <canvas id="emotionChart" width="400" height="300"></canvas>
            </div>
        </div>

        <div class="panel log-panel">
            <h2>📝 系统日志</h2>
            <div class="log-content" id="logContent">
                <div class="log-entry">
                    <span class="log-timestamp">[${new Date().toLocaleTimeString()}]</span>
                    <span class="log-level-info">[INFO]</span> Mock Emotion AI Service 已启动
                </div>
                <div class="log-entry">
                    <span class="log-timestamp">[${new Date().toLocaleTimeString()}]</span>
                    <span class="log-level-info">[INFO]</span> WebSocket服务器监听端口: ${CONFIG.port}
                </div>
            </div>
        </div>
    </div>

    <script>
        let emotionChart;
        let logEntries = [];

        // 初始化图表
        function initChart() {
            const ctx = document.getElementById('emotionChart').getContext('2d');
            emotionChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: '快乐',
                            data: [],
                            borderColor: '#28a745',
                            backgroundColor: 'rgba(40, 167, 69, 0.1)',
                            tension: 0.3
                        },
                        {
                            label: '悲伤',
                            data: [],
                            borderColor: '#007bff',
                            backgroundColor: 'rgba(0, 123, 255, 0.1)',
                            tension: 0.3
                        },
                        {
                            label: '愤怒',
                            data: [],
                            borderColor: '#dc3545',
                            backgroundColor: 'rgba(220, 53, 69, 0.1)',
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 1,
                            ticks: {
                                callback: function(value) {
                                    return Math.round(value * 100) + '%';
                                }
                            }
                        },
                        x: {
                            display: false
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    }
                }
            });
        }

        // 刷新数据
        async function refreshData() {
            try {
                // 获取统计数据
                const statsRes = await fetch('/api/stats');
                const stats = await statsRes.json();
                
                document.getElementById('totalConnections').textContent = stats.connections.total;
                document.getElementById('activeConnections').textContent = stats.connections.active;
                document.getElementById('audioConnections').textContent = stats.connections.audioOnly;
                document.getElementById('videoConnections').textContent = stats.connections.video;

                // 获取会话数据
                const sessionsRes = await fetch('/api/sessions');
                const sessions = await sessionsRes.json();
                
                renderSessions(sessions);
                updateChart(sessions);
                
            } catch (error) {
                addLogEntry('error', '获取数据失败: ' + error.message);
            }
        }

        // 渲染会话列表
        function renderSessions(sessions) {
            const container = document.getElementById('sessionList');
            
            if (sessions.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: #6c757d; margin-top: 50px;">暂无活跃会话</div>';
                return;
            }

            const html = sessions.map(session => {
                const emotionBars = Object.entries(session.emotions).map(([emotion, value]) => {
                    const colors = {
                        happiness: '#28a745',
                        sadness: '#007bff',
                        anger: '#dc3545',
                        fear: '#ffc107',
                        surprise: '#6f42c1',
                        disgust: '#fd7e14'
                    };
                    
                    return `
                        <div class="emotion-bar">
                            <div class="emotion-name">${emotion}</div>
                            <div class="emotion-progress">
                                <div class="emotion-fill" style="width: ${value * 100}%; background: ${colors[emotion]}"></div>
                            </div>
                            <div class="emotion-value">${Math.round(value * 100)}%</div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="session-item ${session.audioOnly ? 'audio-only' : 'video'}">
                        <div class="session-header">
                            <div class="session-id">${session.examId}/${session.studentId}</div>
                            <div class="session-mode ${session.audioOnly ? 'audio' : 'video'}">
                                ${session.audioOnly ? '🎤 音频模式' : '📹 视频模式'}
                            </div>
                        </div>
                        <div class="session-details">
                            <div>持续时间: ${session.duration}秒</div>
                            <div>帧数: ${session.frameCount}</div>
                            <div>专注度: ${Math.round(session.engagement * 100)}%</div>
                            <div>压力值: ${Math.round(session.stress * 100)}%</div>
                        </div>
                        ${session.audioOnly ? `
                            <div class="audio-level">
                                <span>🎤</span>
                                <div class="audio-meter">
                                    <div class="audio-meter-fill" style="width: ${session.audioLevel}%"></div>
                                </div>
                                <span>${session.audioLevel}%</span>
                            </div>
                        ` : ''}
                        <div class="emotion-bars">
                            ${emotionBars}
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
        }

        // 更新图表
        function updateChart(sessions) {
            if (sessions.length === 0) return;

            // 计算平均情绪值
            const avgEmotions = {
                happiness: 0,
                sadness: 0,
                anger: 0
            };

            sessions.forEach(session => {
                avgEmotions.happiness += session.emotions.happiness;
                avgEmotions.sadness += session.emotions.sadness;
                avgEmotions.anger += session.emotions.anger;
            });

            Object.keys(avgEmotions).forEach(key => {
                avgEmotions[key] /= sessions.length;
            });

            // 添加到图表
            const now = new Date().toLocaleTimeString();
            emotionChart.data.labels.push(now);
            emotionChart.data.datasets[0].data.push(avgEmotions.happiness);
            emotionChart.data.datasets[1].data.push(avgEmotions.sadness);
            emotionChart.data.datasets[2].data.push(avgEmotions.anger);

            // 限制数据点数量
            if (emotionChart.data.labels.length > 20) {
                emotionChart.data.labels.shift();
                emotionChart.data.datasets.forEach(dataset => dataset.data.shift());
            }

            emotionChart.update();
        }

        // 添加日志条目
        function addLogEntry(level, message) {
            const timestamp = new Date().toLocaleTimeString();
            const entry = `<div class="log-entry"><span class="log-timestamp">[${timestamp}]</span> <span class="log-level-${level}">[${level.toUpperCase()}]</span> ${message}</div>`;
            
            const logContent = document.getElementById('logContent');
            logContent.innerHTML += entry;
            logContent.scrollTop = logContent.scrollHeight;
        }

        // 初始化
        document.addEventListener('DOMContentLoaded', function() {
            initChart();
            refreshData();
            
            // 定时刷新
            setInterval(refreshData, 2000);
            
            addLogEntry('info', 'Web控制台已加载');
        });
    </script>
</body>
</html>
`;

// 主页路由
app.get('/', (req, res) => {
  res.send(webConsoleHTML);
});

// 启动服务器
server.listen(CONFIG.port, () => {
  console.log(`🚀 Mock Emotion AI Service 已启动`);
  console.log(`📊 Web控制台: http://localhost:${CONFIG.port}`);
  console.log(`🔌 WebSocket端点: ws://localhost:${CONFIG.port}/api/emotion/stream`);
  console.log(`📡 API端点: http://localhost:${CONFIG.port}/api/`);
  console.log(`⚙️  配置:`);
  console.log(`   - 最大连接数: ${CONFIG.maxConnections}`);
  console.log(`   - 情绪更新间隔: ${CONFIG.emotionUpdateInterval}ms`);
  console.log(`   - 音频分析间隔: ${CONFIG.audioAnalysisInterval}ms`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  server.close(() => {
    console.log('Mock Emotion AI Service 已停止');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...');
  server.close(() => {
    console.log('Mock Emotion AI Service 已停止');
    process.exit(0);
  });
});

module.exports = { app, server, sessionManager };