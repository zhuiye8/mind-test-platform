🔄 处理WebSocket升级请求: /api/audio/progress
prisma:query SELECT "public"."papers"."id", "public"."papers"."teacher_id", "public"."papers"."title", "public"."papers"."description", "public"."papers"."scale_type", "public"."papers"."show_scores", "public"."papers"."scale_config", "public"."papers"."created_at", "public"."papers"."updated_at" FROM "public"."papers" WHERE ("public"."papers"."id" = $1 AND "public"."papers"."teacher_id" = $2) LIMIT $3 OFFSET $4
📋 开始批量生成试卷 测试试卷 的语音文件
prisma:query SELECT "public"."questions"."id", "public"."questions"."paper_id", "public"."questions"."scale_id", "public"."questions"."question_order", "public"."questions"."title", "public"."questions"."options", "public"."questions"."question_type", "public"."questions"."display_condition", "public"."questions"."score_value", "public"."questions"."is_scored", "public"."questions"."created_at", "public"."questions"."updated_at" FROM "public"."questions" WHERE "public"."questions"."paper_id" = $1 ORDER BY "public"."questions"."question_order" ASC OFFSET $2
prisma:query SELECT "public"."question_audio"."id", "public"."question_audio"."question_id", "public"."question_audio"."filename", "public"."question_audio"."file_path", "public"."question_audio"."file_url", "public"."question_audio"."file_size", "public"."question_audio"."duration", "public"."question_audio"."format", "public"."question_audio"."voice_settings", "public"."question_audio"."content_hash", "public"."question_audio"."status", "public"."question_audio"."error", "public"."question_audio"."tts_task_id", "public"."question_audio"."tts_provider", "public"."question_audio"."tts_task_status", "public"."question_audio"."tts_task_created_at", "public"."question_audio"."tts_speech_url", "public"."question_audio"."tts_attempts", "public"."question_audio"."generated_at", "public"."question_audio"."created_at", "public"."question_audio"."updated_at" FROM "public"."question_audio" WHERE "public"."question_audio"."question_id" IN ($1) OFFSET $2
📋 使用新的批量处理器生成试卷 5dfce5c0-671e-48d8-8bb4-cd469801accc 的语音文件
📋 开始批量音频处理: 5dfce5c0-671e-48d8-8bb4-cd469801accc (批次ID: batch_1755225309333_tnv3oyppb)
🎯 开始TTS处理流程: 5dfce5c0-671e-48d8-8bb4-cd469801accc, 总任务数: 1
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=initializing, 总体进度=0%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 0/1 (0%) - 初始化TTS处理流程......
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: initializing - 0% - 初始化TTS处理流程...
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=initializing, 总体进度=0%, 阶段进度=0%
📝 需要处理的题目: 1/1
📋 开始批量创建1个百度TTS任务
🎵 创建百度TTS任务: "测试题目测试题目测试题目。选项有：A、测试选项A。B、测试选项B。..."
✅ 百度TTS任务创建成功: 689e9cdd83b8e3000128bb0b, 状态: Created
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=creating_tasks, 总体进度=10%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 0/1 (0%) - 创建TTS任务中... (1/1)...
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: creating_tasks - 100% - 创建TTS任务中... (1/1)
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=creating_tasks, 总体进度=10%, 阶段进度=100%
✅ 批量任务创建完成: 成功1个，失败0个
✅ 批量任务创建完成: 成功1个任务
⏳ 开始等待1个任务完成，最多轮询120次
📊 批量查询1个百度TTS任务状态
📈 任务状态统计: 总计1, 运行中1, 成功0, 失败0, 进度0%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=waiting_completion, 总体进度=10%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 0/1 (0%) - 等待语音合成完成... 运行中: 1, ...
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: waiting_completion - 0% - 等待语音合成完成... 运行中: 1, 已完成: 0
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=waiting_completion, 总体进度=10%, 阶段进度=0%
⏳ 轮询1/120: 还有1个任务运行中，5秒后重试
📊 批量查询1个百度TTS任务状态
📈 任务状态统计: 总计1, 运行中1, 成功0, 失败0, 进度0%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=waiting_completion, 总体进度=10%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 0/1 (0%) - 等待语音合成完成... 运行中: 1, ...
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: waiting_completion - 0% - 等待语音合成完成... 运行中: 1, 已完成: 0
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=waiting_completion, 总体进度=10%, 阶段进度=0%
⏳ 轮询2/120: 还有1个任务运行中，5秒后重试
📊 批量查询1个百度TTS任务状态
📈 任务状态统计: 总计1, 运行中0, 成功1, 失败0, 进度100%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=waiting_completion, 总体进度=80%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 1/1 (100%) - 等待语音合成完成... 运行中: 0, ...
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: waiting_completion - 100% - 等待语音合成完成... 运行中: 0, 已完成: 1
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=waiting_completion, 总体进度=80%, 阶段进度=100%
🎉 所有任务已完成 (尝试3/120): 成功1个，失败0个
📥 获取到1个下载URL
📦 开始批量下载1个音频文件
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=downloading, 总体进度=80%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 0/1 (0%) - 下载音频文件中... (0/1)...
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: downloading - 0% - 下载音频文件中... (0/1)
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=downloading, 总体进度=80%, 阶段进度=0%
📥 开始下载音频文件: http://aipe-speech.bj.bcebos.com/text_to_speech/2025-08-15/689e9cdd83b8e3000128bb0b/speech/0.mp3?authorization=bce-auth-v1%2FALTAKjI91nE52nvtDNRgFlUCVz%2F2025-08-15T02%3A35%3A19Z%2F259200%2F%2F1062d2aabacffd3b0e5c0ad5cdd0e6705f176e0ce5ef1b2452d4da8a18198e82 → /root/work/心理测试平台/backend/uploads/audio/questions/af88de95-a339-484c-b747-78a941ef8923/question_audio.mp3
🔄 下载尝试 1/3
🔍 URL验证: http://aipe-speech.bj.bcebos.com/text_to_speech/2025-08-15/689e9cdd83b8e3000128bb0b/speech/0.mp3?authorization=bce-auth-v1%2FALTAKjI91nE52nvtDNRgFlUCVz%2F2025-08-15T02%3A35%3A19Z%2F259200%2F%2F1062d2aabacffd3b0e5c0ad5cdd0e6705f176e0ce5ef1b2452d4da8a18198e82 → 域名: aipe-speech.bj.bcebos.com, 协议: http:, 有效: true
✅ 下载完成: 31KB
✅ 音频文件下载成功: /root/work/心理测试平台/backend/uploads/audio/questions/af88de95-a339-484c-b747-78a941ef8923/question_audio.mp3 (31653 bytes)
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=downloading, 总体进度=95%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 1/1 (100%) - 下载音频文件中... (1/1)...
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: downloading - 100% - 下载音频文件中... (1/1)
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=downloading, 总体进度=95%, 阶段进度=100%
📊 批量下载完成: 成功1个，失败0个
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=finalizing, 总体进度=95%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 1/1 (100%) - 更新数据库状态......
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: finalizing - 0% - 更新数据库状态...
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=finalizing, 总体进度=95%, 阶段进度=0%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=finalizing, 总体进度=100%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 1/1 (100%) - 更新数据库状态... (1/1)...
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: finalizing - 100% - 更新数据库状态... (1/1)
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=finalizing, 总体进度=100%, 阶段进度=100%
🎉 TTS处理完成: 5dfce5c0-671e-48d8-8bb4-cd469801accc, 耗时: 15789ms
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎉 批量音频生成完成: 成功1个，失败0个，耗时1755225325171ms
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 批量状态更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=completed, 总体进度=100%
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
📊 音频生成进度: 1/1 (100%) - 处理完成! 成功: 1, 失败: 0, ...
📡 没有活跃的WebSocket连接 (paperId: 5dfce5c0-671e-48d8-8bb4-cd469801accc)
🎯 阶段更新 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: completed - 100% - 处理完成! 成功: 1, 失败: 0, 耗时: 16秒
📊 TTS进度 [5dfce5c0-671e-48d8-8bb4-cd469801accc]: 阶段=completed, 总体进度=100%, 阶段进度=100%
📊 批量音频处理完成: 成功1, 失败0
📊 新批量处理器完成: 成功 1, 失败 0, 批次ID: batch_1755225309333_tnv3oyppb
✅ 试卷 测试试卷 批量语音生成完成: 成功 1, 失败 0
::1 - - [15/Aug/2025:02:35:25 +0000] "POST /api/teacher/papers/5dfce5c0-671e-48d8-8bb4-cd469801accc/audio/batch-generate HTTP/1.1" 200 126 "http://localhost:5173/" "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"
::1 - - [15/Aug/2025:02:35:25 +0000] "GET /api/audio/papers/5dfce5c0-671e-48d8-8bb4-cd469801accc/status HTTP/1.1" 200 469 "http://localhost:5173/" "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"
prisma:query SELECT 1
prisma:query SELECT "public"."papers"."id", "public"."papers"."teacher_id", "public"."papers"."title", "public"."papers"."description", "public"."papers"."scale_type", "public"."papers"."show_scores", "public"."papers"."scale_config", "public"."papers"."created_at", "public"."papers"."updated_at", COALESCE("aggr_selection_0_Exam"."_aggr_count_exams", 0) AS "_aggr_count_exams" FROM "public"."papers" LEFT JOIN (SELECT "public"."exams"."paper_id", COUNT(*) AS "_aggr_count_exams" FROM "public"."exams" WHERE 1=1 GROUP BY "public"."exams"."paper_id") AS "aggr_selection_0_Exam" ON ("public"."papers"."id" = "aggr_selection_0_Exam"."paper_id") WHERE ("public"."papers"."id" = $1 AND "public"."papers"."teacher_id" = $2) LIMIT $3 OFFSET $4
prisma:query SELECT 1
prisma:query SELECT "public"."questions"."id", "public"."questions"."paper_id", "public"."questions"."scale_id", "public"."questions"."question_order", "public"."questions"."title", "public"."questions"."options", "public"."questions"."question_type", "public"."questions"."display_condition", "public"."questions"."score_value", "public"."questions"."is_scored", "public"."questions"."created_at", "public"."questions"."updated_at" FROM "public"."questions" WHERE "public"."questions"."paper_id" IN ($1) ORDER BY "public"."questions"."question_order" ASC OFFSET $2
prisma:query SELECT "public"."papers"."id", "public"."papers"."teacher_id", "public"."papers"."title", "public"."papers"."description", "public"."papers"."scale_type", "public"."papers"."show_scores", "public"."papers"."scale_config", "public"."papers"."created_at", "public"."papers"."updated_at" FROM "public"."papers" WHERE ("public"."papers"."id" = $1 AND "public"."papers"."teacher_id" = $2) LIMIT $3 OFFSET $4
::1 - - [15/Aug/2025:02:35:25 +0000] "GET /api/teacher/papers/5dfce5c0-671e-48d8-8bb4-cd469801accc HTTP/1.1" 200 573 "http://localhost:5173/" "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"
prisma:query SELECT "public"."questions"."id", "public"."questions"."paper_id", "public"."questions"."scale_id", "public"."questions"."question_order", "public"."questions"."title", "public"."questions"."options", "public"."questions"."question_type", "public"."questions"."display_condition", "public"."questions"."score_value", "public"."questions"."is_scored", "public"."questions"."created_at", "public"."questions"."updated_at" FROM "public"."questions" WHERE "public"."questions"."paper_id" = $1 ORDER BY "public"."questions"."question_order" ASC OFFSET $2
prisma:query SELECT "public"."question_audio"."id", "public"."question_audio"."status", "public"."question_audio"."file_url", "public"."question_audio"."duration", "public"."question_audio"."content_hash", "public"."question_audio"."generated_at", "public"."question_audio"."error", "public"."question_audio"."question_id" FROM "public"."question_audio" WHERE "public"."question_audio"."question_id" IN ($1) OFFSET $2
::1 - - [15/Aug/2025:02:35:25 +0000] "GET /api/teacher/papers/5dfce5c0-671e-48d8-8bb4-cd469801accc/questions HTTP/1.1" 200 553 "http://localhost:5173/" "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"
🔄 处理WebSocket升级请求: /api/audio/progress
::1 - - [15/Aug/2025:02:35:25 +0000] "GET /api/audio/papers/5dfce5c0-671e-48d8-8bb4-cd469801accc/status HTTP/1.1" 200 469 "http://localhost:5173/" "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"
🎵 直接提供音频文件: /root/work/心理测试平台/backend/uploads/audio/questions/af88de95-a339-484c-b747-78a941ef8923/question_audio.mp3
::1 - - [15/Aug/2025:02:35:36 +0000] "GET /api/audio/questions/af88de95-a339-484c-b747-78a941ef8923/question_audio.mp3 HTTP/1.1" 206 31653 "http://localhost:5173/" "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"