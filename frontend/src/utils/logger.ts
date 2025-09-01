/**
 * 前端统一日志封装
 * - 开发环境：输出 debug/info/warn/error
 * - 生产环境：默认仅输出 warn/error
 * 可通过 VITE_LOG_LEVEL 调整（debug|info|warn|error）
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function getEnvLevel(): Level {
  const fromEnv = (import.meta as any).env?.VITE_LOG_LEVEL as string | undefined;
  if (fromEnv && ['debug','info','warn','error'].includes(fromEnv)) return fromEnv as Level;
  const mode = (import.meta as any).env?.MODE || process.env.NODE_ENV;
  return mode === 'development' ? 'debug' : 'warn';
}

const CURRENT_LEVEL = getEnvLevel();

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] <= LEVEL_ORDER[CURRENT_LEVEL];
}

export const logger = {
  debug: (msg: string, meta?: any) => { if (shouldLog('debug')) console.debug(`[DEBUG] ${msg}`, meta ?? ''); },
  info:  (msg: string, meta?: any) => { if (shouldLog('info'))  console.info(`[INFO] ${msg}`, meta ?? ''); },
  warn:  (msg: string, meta?: any) => { if (shouldLog('warn'))  console.warn(`[WARN] ${msg}`, meta ?? ''); },
  error: (msg: string, err?: any)  => { if (shouldLog('error')) console.error(`[ERROR] ${msg}`, err ?? ''); },
};

export default logger;

