import express from 'express';
import http from 'http';
// 导入 Server from 'socket.io'
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const server = http.createServer(app);

// 初始化 Socket.IO 服务器, 并配置 CORS 允许前端(默认在3000端口)连接
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// 监听 'connection' 事件，当有客户端连接时触发
io.on('connection', (socket) => {
  console.log(`✅ Socket.IO 客户端已连接, ID: ${socket.id}`);

  // 监听前端 emit 的具名事件 'stream_data'
  socket.on('stream_data', (data) => {
    console.log(`📡 收到来自 ${socket.id} 的数据块，大小: ${data.length} 字节`);
  });

  // 监听断开连接事件
  socket.on('disconnect', (reason) => {
    console.log(`❌ 客户端 ${socket.id} 已断开连接: ${reason}`);
  });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '../out')));

// 本地测试服务器的端口，我们将使用 8080
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO 测试服务器正在运行于 http://localhost:${PORT}`);
});