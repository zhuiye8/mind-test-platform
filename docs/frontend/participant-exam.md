# 学生答题模块

## 涉及文件
- `/frontend/src/pages/ParticipantExam.tsx` - 学生答题主页面
- `/frontend/src/components/ParticipantExam/` - 答题组件模块(9个文件)
- `/frontend/src/components/DeviceCheck/` - 设备检测模块(7个文件)
- `/frontend/src/utils/timelineRecorder.ts` - 时间线记录器

## API数据流（与实现同步）
- `GET /api/public/exams/:uuid`
  - 响应：`{ id, title, description?, duration_minutes, shuffle_questions, password_required, questions? }`
  - 说明：若考试需要密码，`questions` 不返回，仅返回基础信息与 `password_required=true`。
- `POST /api/public/exams/:uuid/verify`
  - 请求：`{ password: string }`
  - 响应：`{ id, title, description?, duration_minutes, shuffle_questions, password_required: false, questions: Question[] }`
- `POST /api/public/exams/:uuid/create-ai-session`
  - 请求：`{ participant_id, participant_name, started_at? }`
  - 响应：`{ examResultId: string|null, aiSessionId: string|null, message, warning? }`
  - 说明：AI服务不可用时仍返回成功，`aiSessionId=null`，考试可继续。
- `POST /api/public/exams/:uuid/check-duplicate`
  - 请求：`{ participant_id }`
  - 响应：`{ canSubmit: boolean }`
- `POST /api/public/exams/:uuid/submit`
  - 请求：`{ participant_id, participant_name, answers, started_at?, timeline_data?, voice_interactions?, device_test_results? }`
  - 响应：`{ result_id: string, score?: number, message?: string, ai_warning?: string }`

## 组件架构
### ParticipantExam核心模块(9个文件)
- `ExamStateManager` - 多步骤状态管理（包含步骤历史追踪）
- `QuestionRenderer` - 题目渲染器(支持音频播放、语音交互)
- `QuestionNavigation` - 题目导航和进度条
- `ExamSubmissionManager` - 提交管理和确认（支持forwardRef暴露方法）
- `AIStatusPanel` - AI连接状态面板
- `useExamFlow/useAIWebRTC` - 业务逻辑Hooks（包含答案隔离机制）
- `ParticipantExam.styles.ts/.animations.css` - 样式动画

### DeviceCheck模块(7个文件)  
- **设备权限检测**: 摄像头/麦克风权限获取和状态验证
- **设备预览确认**: 用户可预览设备效果，手动确认设备正常工作
- **Windows兼容优化**: 针对Windows平台的设备占用和虚拟摄像头处理
- **设备生命周期管理**: 只在用户确认或离开页面时释放设备流
- **多级降级策略**: 设备异常时仍可继续考试（降级模式）
- **智能错误提示**: 根据错误类型提供具体解决方案

## 核心功能
- **4步骤考试流程管理**: password → info → device-test → description → exam → completed
- **步骤历史追踪**: 实现导航历史栈，支持正确的“返回上一步”功能
- **答案缓存隔离**: 使用参与者ID隔离答案存储，防止不同学生答案污染
- **智能提交按钮**: 最后一题完成后自动显示，必填项验证，时间紧急提醒
- **设备检测与确认**: 用户预览后手动确认，支持设备切换和降级模式
- **AI多模态情绪分析**: WebRTC → MediaMTX → RTSP流传输（前端仅提示可用性，不展示具体生理/情绪数据）
- **题目条件逻辑显示**: 支持复杂的AND/OR条件显示规则  
- **时间线事件记录**: 6种类型事件(DISPLAY/SELECT/CHANGE等)精确记录
- **音频功能区分**: 
  - **保留**: TTS语音播报题目内容，通过后端生成音频文件播放
  - **保留**: WebRTC音频流传输给AI服务进行情绪分析  
  - **已移除**: 学生语音答题交互功能（STT语音识别、语音回答）
  - **已移除**: 智能语音答案匹配功能（LLM语音内容分析）
- **设备故障诊断**: Windows平台优化，占用检测，权限引导

## 注意事项
- **答案缓存隔离**: localStorage键使用`exam_answers_${examUuid}_${participantId}`格式，确保各参与者答案独立存储
- **步骤导航历史**: 实现步骤历史栈，返回按钮按实际导航路径返回（如 description → device-test）
- **自动清理污染缓存**: 启动时检测并清理旧格式的localStorage键（仅基于examUuid）
- **Ref转发机制**: ExamSubmissionManager使用forwardRef+useImperativeHandle暴露showSubmissionConfirm方法
- **设备流管理**: 设备预览期间流保持活跃，只在用户确认或离开页面时释放
- **AI服务配置**: 支持环境变量VITE_AI_SERVICE_URL配置，通过MediaMTX服务器进行流媒体传输
- **Windows兼容性**: 优先使用真实摄像头，虚拟摄像头(OBS等)作为备选
- **提交按钮显示**: 最后一题回答完成后显示，必填项未完成则禁用提交
- **localStorage一致性**: 提交成功后清理缓存使用与存储相同的键名格式
- **时间线数据精确到毫秒级记录**: 包含设备检测、答题、AI分析等事件
- **键盘快捷键支持**: 方向键导航、Ctrl+Enter提交
- **响应式设计**: 支持移动端和桌面端适配

## UI/UX 优化（V1）
- **AI状态仅提示可用性**: 侧栏 AI 状态面板仅显示“检测中/正常/未启用”，不展示心率或情绪等细节，避免对作答造成心理暗示；AI 不可用不影响考试。
- **最后一题提交**: 当进入最后一题时，右侧“快速导航”中的“下一题”替换为“提交试卷”（仍保留必答题校验与提交确认弹窗，支持 Ctrl+Enter）。
- **浮动菜单精简**: 去除“提交考试”浮动按钮，仅保留“题目导航”“考试说明”两项。
- **提示可收起**: 题目 `hint` 默认展开，支持收起/展开，不影响答题。
- **PC 布局优化**: 题目区与侧栏的两栏布局在 PC 常见分辨率下更稳健，主体内容宽度上限提升（~1120px），避免过窄导致滚动频繁。

### 交互细节（补充）
- **整行可点击选项**: 单选/多选的每个选项整行均可点击选择，仍保留原有 Radio/Checkbox 交互；避免点文字不生效的情况。
- **缺失题直达**: 提交卡片中“未完成必答题”列表项（Tag）可点击，点击后直达对应题目。
- **离开页面提醒**: 正在考试时关闭/刷新页面会提示确认，避免误操作导致丢失进度。
- **离线提示**: 掉线时在状态栏下方显示提示横幅，说明答案已本地保存并将自动重试提交，网络恢复后自动消失。
- **切题滚动定位**: 切换题目时自动滚动至题目卡片顶部，配合固定头部进行了偏移处理，减少迷失感。
- **自动保存提示**: 答案变更后在侧栏短暂显示“已自动保存”轻提示（约1.5s），无打扰地增强安心感。
- **题号栅格自适**: 题目数量较多（>30）时导航面板改为5列栅格，减少滚动与拥挤。

## 注意事项（补充）
- 提交入口统一：在最后一题的侧栏“快速导航”处进行提交；题目导航面板内的提交仍作为次要入口。
- 公平性与隐私：AI 状态只提示可用性，不显示具体生理/情绪数据；所有改动不影响时间线记录与提交流程。
- **WebRTC流媒体架构**: 前端通过WHIP协议推流到MediaMTX服务器，AI服务从MediaMTX消费RTSP流进行分析
  - **媒体流管理**: MediaStreamContext维护全局流状态，从设备检测阶段持续到考试结束
  - **流传输优化**: 1920x1080@30fps分辨率，最高8Mbps码率，maintain-resolution降级策略
  - **AI会话管理**: 调用 `/api/public/exams/:uuid/create-ai-session` 创建AI会话，无需直接WebRTC连接
