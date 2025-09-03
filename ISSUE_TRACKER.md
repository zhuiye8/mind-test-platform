# ISSUE Tracker（前端/后端，基于 docs 约定）

> 说明：本清单按优先级从高到低排列。仅描述“哪里有问题/风险/不一致”，不含工期与负责人。若条目间存在关联，已在“关联/备注”中标注（修复 A 可部分/全部覆盖 B）。

## P0（必须优先修复）

1) API 契约不一致：公开考试信息字段缺失/不一致
- 问题：`GET /public/exams/:publicUuid` 返回缺少 `id`、`shuffle_questions` 等字段；前端类型与逻辑期望存在。
- 位置：
  - 后端：`backend/src/controllers/public/access.controller.ts::getPublicExam`（sendSuccess 数据体）
  - 前端：`frontend/src/services/api/publicApi.ts`、`enhancedPublicApi.ts`（返回类型使用）
- 影响：前端运行时可能出现 `undefined`，引发 UI/流程异常。
- 关联/备注：与条目 2)（密码验证与题目加载流程）一并梳理更高效。

2) 密码验证后题目加载逻辑不匹配
- 问题：前端在 `verifyPassword` 成功后期望拿到 `questions`，并写入 `exam`；后端 `verify` 接口仅返回 message，不返回题目列表。
- 位置：
  - 前端：`frontend/src/components/ParticipantExam/ExamStateManager.tsx::handlePasswordSubmit`
  - 后端：`backend/src/controllers/public/access.controller.ts::verifyExamPassword`
- 影响：验证通过后前端可能缺题目数据；需要再发一次 `getExam` 才能完成流程。
- 关联/备注：与条目 1) 合并梳理“获取/验证/题目返回”的清晰契约。

3) 安全：GET 携带密码（严重风险）
- 问题：`GET /public/exams/:publicUuid?password=...` 支持通过查询参数携带明文密码。
- 位置：`backend/src/controllers/public/access.controller.ts::getPublicExam`
- 影响：密码出现在 URL/代理/浏览器历史，易泄露。
- 关联/备注：若统一为“POST /verify”校验密码，则可以移除 GET 的密码逻辑；与条目 1)/2) 一致性相关。
注意:如果只是考试的简单密码可以考虑换个方式，不用那么严谨也不能这么草率

4) 提交状态码与语义冲突（提交成功但返回 503 错误）
- 问题：当 AI 服务不可用时，后端仍保存答案，但向前端返回 503（错误）。
- 位置：`backend/src/controllers/public/submission.controller.ts`（catch 分支中“AI服务不可达但考试提交应该成功”却 `sendError(..., 503)`）
- 影响：前端可能提示“提交失败”，而后端已保存，造成二次提交/困惑。
- 关联/备注：前端的降级逻辑（`enhancedPublicApi`）可配合，但建议后端改为 200 + 附加降级信息，避免误判。

5) 日志隐私泄露（生产环境）
- 问题：
  - 前端：提交数据（含 PII/答案）被 `console.log`；音频/语音/WebRTC 模块大量 `console`。
  - 后端：AI 控制器打印内网 WS URL 与诊断细节。
- 位置：
  - 前端：`frontend/src/components/ParticipantExam/ExamSubmissionManager.tsx`、`frontend/src/utils/audioManager.ts`、`frontend/src/utils/speechQueue.ts`、`frontend/src/services/aiSessionWebRTC.ts` 等
  - 后端：`backend/src/controllers/aiController.ts::getAIServiceConfig`
- 影响：生产环境信息泄露与噪声日志；不利审计与合规。
- 关联/备注：引入统一的“按环境日志等级”方案可一次性覆盖多处调用点。

6) 密码存储形态不明（疑似明文对比）
- 问题：验证逻辑为 `password === exam.password`；未见哈希比对。
- 位置：`backend/src/controllers/public/access.controller.ts::verifyExamPassword`
- 影响：若确为明文存储，则存在泄露风险；需确认 `schema.prisma` 与创建流程。
- 关联/备注：与条目 3) 一并梳理“密码处理链路”。
注意:如果只是考试的简单密码可以考虑换个方式，不用那么严谨也不能这么草率

## P1（高优先级）

7) 服务端未强制校验必答/完整性
- 问题：服务端未对“必答题/空答禁用”等进行强制校验，现仅前端拦截。
- 位置：`backend/src/controllers/public/validation.controller.ts`、`backend/src/controllers/public/submission.controller.ts`
- 影响：可绕过前端直接提交不完整答卷。
- 关联/备注：与 P0-4) 一同完善提交路径的健壮性。

8) 响应封装不统一
- 问题：`sendSuccess/sendError` 与直接 `res.json` 混用，导致响应结构不一致。
- 位置：`backend/src/routes/aiProxyRoutes.ts`（多处 `res.json`），其余控制器多用 `sendSuccess/sendError`。
- 影响：前端容错成本增加。
- 关联/备注：统一封装后，也便于审计与监控。

9) 字段命名混用（snake/camel）与影子类型
- 问题：对外契约是 snake_case，但后端/前端内部时常混用驼峰；前端类型里保留大量兼容影子字段，易误用。
- 位置：
  - 后端：`backend/src/controllers/public/types.ts`（如 `shuffleQuestions`、`requiresPassword`）
  - 前端：`frontend/src/types/index.ts`（同字段 snake/camel 并存）
- 影响：长期维护易错、难排查。
- 关联/备注：若引入“统一映射层”（传输→内部），可降低 P0-1/2 类问题发生概率。

10) XSS 潜在风险（取决于内容来源）
- 问题：前端直接渲染教师侧可编辑的 `question.title/description/hint` 与 `exam.description`，无过滤。
- 位置：`frontend/src/components/ParticipantExam/QuestionRenderer.tsx`、`frontend/src/components/ParticipantExam/ExamStateManager.tsx`
- 影响：若未来支持富文本/外部导入且未清洗，存在注入风险。
- 关联/备注：与“题目导入/编辑”策略相关；如约束仅纯文本可降低风险。

11) AI 配置端点与降级体验不一致
- 问题：
  - 存在 `/api/ai-service/config` 与 `/api/ai-proxy/config` 两个配置端点（功能重叠）。
  - 学生端对 AI 不可用的 UI 提示不明显（多在 console）。
- 位置：
  - 后端：`backend/src/routes/aiRoutes.ts`、`backend/src/routes/aiProxyRoutes.ts`
  - 前端：`frontend/src/pages/ParticipantExam.tsx`（连接失败主要日志提示）
- 影响：运维/联调易混淆；学生不易理解当前是否启用 AI。
- 关联/备注：若统一配置端点 + UI 显性提示，可提升体验与可维护性。

## P2（中优先级）

12) 旧版大文件与未用代码残留
- 问题：
  - 根目录 `StudentExam.tsx` 为旧实现且极大，不参与构建，易混淆。
  - `frontend/src/hooks/useLocalStream.ts` 当前未使用，与新设备检测能力重叠。
- 影响：团队误用/阅读成本高。
- 关联/备注：清理后可降低理解与维护成本。

13) 回答格式约定未显式对外文档化
- 问题：前端多选为数组，后端保存为逗号字符串（标准化时 join）；对接方需了解该隐式转换。
- 位置：前端 `QuestionRenderer.tsx`、后端 `public/submission.controller.ts`
- 影响：他端对接或分析工具易误解字段语义。
- 关联/备注：若在 docs/API 说明中明确，减少歧义。

14) 设备检测极端场景补充（非缺陷，体验建议）
- 问题：移动端/低性能设备偶发黑屏/卡顿；可加“安全模式”（更低分辨率/帧率）与更清晰的权限状态可视化。
- 位置：`frontend/src/components/DeviceCheck/*`
- 影响：少量设备兼容性体验。
- 关联/备注：与核心功能独立，不阻塞主要流程。

---

## 互相影响/合并修复建议（仅标注关系，不给方案）
- [1]+[2]+[3]+[6] 同一主题（公开考试访问/密码/题目返回/密码处理链路）
  - 若统一“验证→再取题目”的契约，并移除 GET 密码分支，同时明确密码存储与比较方式，可一次性解决多处不一致与风险。
- [4] 与前端降级逻辑相关
  - 若后端改为成功响应 + 降级标记，前端已有的 `enhancedPublicApi` 降级可更自然衔接。
- [8]+[9] 基础设施层面统一
  - 若统一响应封装与字段映射层，可降低后续类似不一致/影子字段问题出现概率。
- [11] 端点统一与 UI 明示
  - 若统一 AI 配置端点并在 UI 明示状态，可降低运维混淆与学生端误解。
- [12] 清理遗留
  - 清理旧大文件与未使用 hook 能减少误用，帮助新同学对齐 V2.0 的正确入口。

> 注：以上清单基于当前代码与 docs 约定梳理，若数据来源（如题目内容/说明）始终受信且仅纯文本，XSS 风险可视为低；若将来支持富文本或外部导入，应上提为 P1 并加入过滤/白名单策略。

