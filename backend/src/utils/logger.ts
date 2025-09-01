/**
 * 统一日志服务
 * 替换所有console.log/warn/error调用，提供更好的日志管理
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LoggerOptions {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  prefix?: string;
}

export class Logger {
  private static instance: Logger;
  private options: LoggerOptions;

  private constructor(options?: Partial<LoggerOptions>) {
    this.options = {
      level: process.env.NODE_ENV === 'production' ? LogLevel.ERROR : LogLevel.DEBUG,
      enableConsole: process.env.NODE_ENV !== 'production',
      enableFile: false, // 可以后续扩展文件日志
      ...options
    };
  }

  static getInstance(options?: Partial<LoggerOptions>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(options);
    }
    return Logger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.options.level;
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = this.options.prefix ? `[${this.options.prefix}]` : '';
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${prefix} ${message}${metaStr}`;
  }

  error(message: string, error?: Error | any, meta?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    if (this.options.enableConsole) {
      if (error) {
        console.error(this.formatMessage('ERROR', message), error, meta);
      } else {
        console.error(this.formatMessage('ERROR', message, meta));
      }
    }
  }

  warn(message: string, meta?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    if (this.options.enableConsole) {
      console.warn(this.formatMessage('WARN', message, meta));
    }
  }

  info(message: string, meta?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    if (this.options.enableConsole) {
      console.info(this.formatMessage('INFO', message, meta));
    }
  }

  debug(message: string, meta?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    if (this.options.enableConsole) {
      console.debug(this.formatMessage('DEBUG', message, meta));
    }
  }

  // 兼容性方法，用于快速替换现有的console调用
  log = this.info;
}

// 创建默认实例并导出便捷方法
const logger = Logger.getInstance();

export const log = {
  error: (message: string, error?: any, meta?: any) => logger.error(message, error, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  info: (message: string, meta?: any) => logger.info(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  // 兼容性方法
  log: (message: string, meta?: any) => logger.info(message, meta),
};

export default logger;

// 为了兼容部分模块按 "{ createLogger }" 的方式导入，这里提供一个轻量工厂：
// 注意：不修改全局 Logger 实例的 prefix，避免并发污染；仅在消息前加前缀。
export function createLogger(prefix?: string) {
  const pfx = prefix ? `[${prefix}] ` : '';
  return {
    error: (message: string, error?: any, meta?: any) => log.error(pfx + message, error, meta),
    warn: (message: string, meta?: any) => log.warn(pfx + message, meta),
    info: (message: string, meta?: any) => log.info(pfx + message, meta),
    debug: (message: string, meta?: any) => log.debug(pfx + message, meta),
    log: (message: string, meta?: any) => log.info(pfx + message, meta),
  };
}
