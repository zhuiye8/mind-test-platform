# 学生答题模块

## 涉及文件
- `/frontend/src/pages/ParticipantExam.tsx` - 学生答题主页面
- `/frontend/src/components/ParticipantExam/` - 答题组件模块(9个文件)
- `/frontend/src/components/DeviceCheck/` - 设备检测模块(7个文件)
- `/frontend/src/utils/timelineRecorder.ts` - 时间线记录器

## API数据流
- `GET /api/public/exam/:uuid` → 考试信息和题目列表
- `POST /api/public/exam/:uuid/verify` → 密码验证
- `POST /api/public/exam/:uuid/session` → AI会话创建
- `POST /api/public/exam/:uuid/submit` → 提交答题和时间线数据

## 组件架构
### ParticipantExam核心模块(9个文件)
- `ExamStateManager` - 多步骤状态管理(password→deviceCheck→exam→completed)
- `QuestionRenderer` - 题目渲染器(支持音频播放、语音交互)
- `QuestionNavigation` - 题目导航和进度条
- `ExamSubmissionManager` - 提交管理和确认
- `AIStatusPanel` - AI连接状态面板
- `useExamFlow/useAIWebRTC` - 业务逻辑Hooks
- `ParticipantExam.styles.ts/.animations.css` - 样式动画

### DeviceCheck模块(7个文件)  
- 摄像头/麦克风权限检测
- 网络连接测试
- 浏览器兼容性验证

## 核心功能
- 4步骤考试流程管理
- 题目条件逻辑显示
- AI多模态情绪分析(心率、情绪)
- WebRTC音视频数据传输
- 时间线事件记录(6种类型: DISPLAY/SELECT/CHANGE等)
- 语音交互和智能匹配
- 设备检测和故障诊断

## 注意事项
- 时间线数据精确到毫秒级记录
- AI会话与考试结果关联
- 键盘快捷键支持(方向键导航、Ctrl+Enter提交)
- 响应式设计和现代动画效果