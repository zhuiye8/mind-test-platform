# 音频服务模块

## 涉及文件
- `/backend/src/controllers/audioController.ts` - 音频管理控制器
- `/backend/src/services/audio/` - 音频服务模块(6个文件)
- `/backend/src/services/baiduTTSService.ts` - 百度TTS服务
- `/backend/src/services/audioBatchProcessor.ts` - 批量处理器
- `/backend/src/services/audioFileDownloader.ts` - 文件下载器
- `/backend/src/services/audioProgressService.ts` - 进度服务
- `/backend/src/services/baiduTTSTaskManager.ts` - TTS任务管理

## 数据库
- **question_audio表**: questionId, audioFile, speechUrl, duration, contentHash, generatedAt, isValid
- **audio_generation_tasks表**: 批量生成任务记录

## 主要接口（与路由实现同步）
- 公开访问（免认证）
  - `HEAD /api/audio/questions/:question_id/:filename` → 探测文件可用性
  - `GET /api/audio/questions/:question_id/:filename` → 获取音频文件（支持 Range/CORS/缓存）
- 教师端（需认证）
  - `POST /api/audio/questions/:question_id/generate` → 生成语音（旧管道）
  - `POST /api/audio/questions/:question_id/generate-single` → 生成语音（新管道，TTS任务管理）
  - `DELETE /api/audio/questions/:question_id` → 删除题目音频
  - `GET /api/audio/questions/:question_id/info` → 获取题目音频信息
  - `GET /api/audio/questions/:question_id/check-update` → 检查是否需要更新
  - `POST /api/audio/papers/:paper_id/batch-generate` → 批量生成音频
  - `GET /api/audio/papers/:paper_id/status` → 获取试卷音频状态聚合
  - `POST /api/audio/cleanup` → 清理孤立音频文件

## 核心功能
- 单个题目音频生成（百度TTS）
- 批量音频生成和任务管理
- 音频文件上传和存储
- 文件下载和流式传输
- 内容哈希检测更新
- 生成进度实时监控

## 注意事项
- 百度TTS API集成（支持多种参数配置）
- 文件存储在 `uploads/audio` 目录
- GET/HEAD 端点已处理 CORS/Range/缓存；适合前端 `<audio>` 直接访问
- 并发控制和任务队列管理（批量任务）
