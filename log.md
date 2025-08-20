(base) root@DESKTOP-F2PJVJI:~/work/心理测试平台/backend# npm run dev

> psychology-test-backend@1.0.0 dev
> nodemon --exec ts-node src/index.ts

[nodemon] 3.1.10
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): *.*
[nodemon] watching extensions: ts,json
[nodemon] starting `ts-node src/index.ts`
🌐 开发环境：已清除HTTP代理设置，确保AI服务连接正常
💡 提示：如需保留代理，请设置 CLEAR_PROXY=false
📁 音频文件目录同步初始化完成
✅ 百度TTS服务初始化成功
✅ 百度TTS任务管理器初始化成功
⚠️ LLM服务未启用 - 缺少OPENROUTER_API_KEY
❌ 配置错误：REPORT_API_URL环境变量必须设置！
/root/work/心理测试平台/backend/src/services/aiReportService.ts:44
      throw new Error('REPORT_API_URL is required');
            ^
Error: REPORT_API_URL is required
    at new AIReportService (/root/work/心理测试平台/backend/src/services/aiReportService.ts:44:13)
    at Object.<anonymous> (/root/work/心理测试平台/backend/src/services/aiReportService.ts:303:32)
    at Module._compile (node:internal/modules/cjs/loader:1529:14)
    at Module.m._compile (/root/work/心理测试平台/backend/node_modules/ts-node/src/index.ts:1618:23)
    at Module._extensions..js (node:internal/modules/cjs/loader:1613:10)
    at Object.require.extensions.<computed> [as .ts] (/root/work/心理测试平台/backend/node_modules/ts-node/src/index.ts:1621:12)
    at Module.load (node:internal/modules/cjs/loader:1275:32)
    at Function.Module._load (node:internal/modules/cjs/loader:1096:12)
    at Module.require (node:internal/modules/cjs/loader:1298:19)
    at require (node:internal/modules/helpers:182:18)
[nodemon] app crashed - waiting for file changes before starting...