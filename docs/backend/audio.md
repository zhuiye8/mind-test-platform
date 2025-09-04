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

## 主要接口
- `POST /api/audio/questions/:questionId/upload` → 文件上传结果
- `POST /api/audio/questions/:questionId/generate` → TTS生成任务
- `GET /api/audio/questions/:questionId` → 音频文件信息
- `POST /api/audio/papers/:paperId/batch-generate` → 批量生成任务
- `GET /api/audio/papers/:paperId/progress` → 批量生成进度

## 核心功能
- 单个题目音频生成（百度TTS）
- 批量音频生成和任务管理
- 音频文件上传和存储
- 文件下载和流式传输
- 内容哈希检测更新
- 生成进度实时监控

## 注意事项
- 百度TTS API集成（支持多种参数配置）
- 文件存储在uploads/audio目录
- 支持MP3格式验证和错误重试
- 并发控制和任务队列管理