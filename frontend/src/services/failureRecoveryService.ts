/**
 * 失败恢复服务
 * 实现指数退避重试、降级模式、TTL清理等功能
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number; // 基础延迟（毫秒）
  maxDelay: number; // 最大延迟（毫秒）
  backoffFactor: number; // 退避因子
  retryableErrors?: (error: any) => boolean; // 判断错误是否可重试
}

export interface FailureRecoveryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  degraded: boolean; // 是否处于降级模式
}

export class FailureRecoveryService {
  private static instance: FailureRecoveryService;
  
  // 降级模式状态
  private degradedServices = new Set<string>();
  
  // TTL清理间隔（分钟）
  private readonly TTL_CLEANUP_INTERVAL = 15;
  
  // 存储重试状态的Map
  private retryStates = new Map<string, {
    attempts: number;
    lastAttempt: Date;
    nextAttempt: Date;
  }>();
  
  private constructor() {
    // 启动TTL清理定时器
    this.startTTLCleanup();
  }
  
  public static getInstance(): FailureRecoveryService {
    if (!FailureRecoveryService.instance) {
      FailureRecoveryService.instance = new FailureRecoveryService();
    }
    return FailureRecoveryService.instance;
  }
  
  /**
   * 执行带重试的异步操作
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    options: RetryOptions = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      retryableErrors: (error) => true
    }
  ): Promise<FailureRecoveryResult<T>> {
    const state = this.getOrCreateRetryState(operationId);
    let lastError: Error | null = null;
    
    // 检查是否处于降级模式
    if (this.degradedServices.has(operationId)) {
      return {
        success: false,
        error: new Error('Service in degraded mode'),
        attempts: 0,
        degraded: true
      };
    }
    
    for (let attempt = 1; attempt <= options.maxRetries + 1; attempt++) {
      state.attempts++;
      state.lastAttempt = new Date();
      
      try {
        const result = await operation();
        
        // 成功后重置重试状态
        this.retryStates.delete(operationId);
        this.degradedServices.delete(operationId);
        
        return {
          success: true,
          data: result,
          attempts: attempt,
          degraded: false
        };
        
      } catch (error) {
        lastError = error as Error;
        
        console.warn(`Operation ${operationId} failed (attempt ${attempt}/${options.maxRetries + 1}):`, error);
        
        // 检查是否为可重试错误
        if (options.retryableErrors && !options.retryableErrors(error)) {
          // 对于明确不可重试的业务错误（例如409冲突），不要进入降级模式，直接返回失败
          return {
            success: false,
            error: lastError || new Error('Unknown error'),
            attempts: attempt,
            degraded: false
          };
        }
        
        // 如果还有重试机会，计算延迟时间
        if (attempt <= options.maxRetries) {
          const delay = Math.min(
            options.baseDelay * Math.pow(options.backoffFactor, attempt - 1),
            options.maxDelay
          );
          
          state.nextAttempt = new Date(Date.now() + delay);
          
          console.log(`Will retry ${operationId} in ${delay}ms (attempt ${attempt + 1}/${options.maxRetries + 1})`);
          
          // 等待重试延迟
          await this.sleep(delay);
        }
      }
    }
    
    // 所有重试都失败，进入降级模式
    console.error(`Operation ${operationId} failed after ${options.maxRetries + 1} attempts, entering degraded mode`);
    this.degradedServices.add(operationId);
    
    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      attempts: options.maxRetries + 1,
      degraded: true
    };
  }
  
  /**
   * 检查服务是否处于降级模式
   */
  isDegraded(serviceId: string): boolean {
    return this.degradedServices.has(serviceId);
  }
  
  /**
   * 手动恢复服务（从降级模式中移除）
   */
  recoverService(serviceId: string): void {
    this.degradedServices.delete(serviceId);
    this.retryStates.delete(serviceId);
    console.log(`Service ${serviceId} recovered from degraded mode`);
  }
  
  /**
   * 获取所有降级服务列表
   */
  getDegradedServices(): string[] {
    return Array.from(this.degradedServices);
  }
  
  /**
   * 获取重试状态
   */
  getRetryState(operationId: string) {
    return this.retryStates.get(operationId);
  }
  
  /**
   * 获取或创建重试状态
   */
  private getOrCreateRetryState(operationId: string) {
    let state = this.retryStates.get(operationId);
    if (!state) {
      state = {
        attempts: 0,
        lastAttempt: new Date(),
        nextAttempt: new Date()
      };
      this.retryStates.set(operationId, state);
    }
    return state;
  }
  
  /**
   * 启动TTL清理定时器
   */
  private startTTLCleanup() {
    setInterval(() => {
      this.cleanupExpiredStates();
    }, this.TTL_CLEANUP_INTERVAL * 60 * 1000);
    
    console.log(`TTL cleanup started, interval: ${this.TTL_CLEANUP_INTERVAL} minutes`);
  }
  
  /**
   * 清理过期的重试状态
   */
  private cleanupExpiredStates() {
    const now = new Date();
    const expiredKeys: string[] = [];
    
    this.retryStates.forEach((state, key) => {
      // 如果最后一次尝试是30分钟前，则认为已过期
      const expiryTime = new Date(state.lastAttempt.getTime() + 30 * 60 * 1000);
      
      if (now > expiryTime) {
        expiredKeys.push(key);
      }
    });
    
    // 清理过期状态
    expiredKeys.forEach(key => {
      this.retryStates.delete(key);
      // 如果服务处于降级模式超过30分钟，也自动恢复
      if (this.degradedServices.has(key)) {
        this.degradedServices.delete(key);
        console.log(`Auto-recovered degraded service: ${key} (TTL expired)`);
      }
    });
    
    if (expiredKeys.length > 0) {
      console.log(`TTL cleanup completed, removed ${expiredKeys.length} expired states:`, expiredKeys);
    }
  }
  
  /**
   * 睡眠工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 默认的可重试错误判断
   */
  static defaultRetryableErrors(error: any): boolean {
    // 网络错误、超时、5xx服务器错误通常可以重试
    if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
      return true;
    }
    
    // HTTP状态码检查
    if (error.response?.status) {
      const status = error.response.status;
      // 409冲突错误（如重复提交）不应该重试，这是明确的业务逻辑错误
      if (status === 409) {
        return false;
      }
      // 5xx服务器错误和408、429可以重试
      return status >= 500 || status === 408 || status === 429;
    }
    
    // fetch错误检查
    if (error.message?.includes('fetch')) {
      return true;
    }
    
    return false;
  }
}

// 导出单例实例
export const failureRecovery = FailureRecoveryService.getInstance();

// 便捷的重试装饰器函数
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationId: string,
  options?: Partial<RetryOptions>
): Promise<FailureRecoveryResult<T>> {
  const mergedOptions: RetryOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    retryableErrors: FailureRecoveryService.defaultRetryableErrors,
    ...options
  };
  
  return failureRecovery.executeWithRetry(operation, operationId, mergedOptions);
}
