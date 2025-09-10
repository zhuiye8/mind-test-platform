# AI会话字段名修复

## 问题描述
前端代码使用camelCase字段名（`aiSessionId`），但后端返回snake_case字段名（`ai_session_id`），导致AI会话创建成功但前端无法识别。

## 修复内容

### 1. 修改 useAIWebRTC.ts
- 字段检查: `aiSessionId` → `ai_session_id`
- 字段使用: `examResultId` → `exam_result_id`

### 2. 更新类型定义
- **enhancedPublicApi.ts**: 返回类型中的字段名
- **publicApi.ts**: createAISession 和 retryAISession 的返回类型

### 3. 修改的字段
- `aiSessionId` → `ai_session_id`
- `examResultId` → `exam_result_id`

## 验证步骤
1. 开始答题，检查控制台是否还有"AI session creation failed"错误
2. 确认AI会话ID能正确传递给WebRTC初始化
3. 验证设备流能正常传输到AI服务

修复后，前端应该能正确识别后端返回的AI会话ID，并成功初始化WebRTC连接。