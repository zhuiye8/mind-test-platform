import { createClient, RedisClientType } from 'redis';

class CacheManager {
  private client: RedisClientType | null = null;
  private isConnected = false;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient() {
    try {
      // Redis配置
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = createClient({
        url: redisUrl,
      });

      // 错误处理
      this.client.on('error', (err) => {
        console.error('❌ Redis连接错误:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🔗 Redis正在连接...');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis连接成功');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('📴 Redis连接已断开');
        this.isConnected = false;
      });

      // 连接Redis
      await this.client.connect();
    } catch (error) {
      console.error('❌ Redis初始化失败:', error);
      this.client = null;
      this.isConnected = false;
    }
  }

  // 检查连接状态
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  // 获取缓存
  async get<T>(key: string): Promise<T | null> {
    if (!this.isReady()) return null;

    try {
      const value = await this.client!.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`❌ 获取缓存失败 [${key}]:`, error);
      return null;
    }
  }

  // 设置缓存
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.isReady()) return false;

    try {
      const serializedValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.client!.setEx(key, ttlSeconds, serializedValue);
      } else {
        await this.client!.set(key, serializedValue);
      }

      return true;
    } catch (error) {
      console.error(`❌ 设置缓存失败 [${key}]:`, error);
      return false;
    }
  }

  // 删除缓存
  async del(key: string): Promise<boolean> {
    if (!this.isReady()) return false;

    try {
      await this.client!.del(key);
      return true;
    } catch (error) {
      console.error(`❌ 删除缓存失败 [${key}]:`, error);
      return false;
    }
  }

  // 删除匹配模式的缓存
  async delPattern(pattern: string): Promise<number> {
    if (!this.isReady()) return 0;

    try {
      const keys = await this.client!.keys(pattern);
      if (keys.length === 0) return 0;

      await this.client!.del(keys);
      return keys.length;
    } catch (error) {
      console.error(`❌ 批量删除缓存失败 [${pattern}]:`, error);
      return 0;
    }
  }

  // 检查缓存是否存在
  async exists(key: string): Promise<boolean> {
    if (!this.isReady()) return false;

    try {
      const result = await this.client!.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`❌ 检查缓存存在性失败 [${key}]:`, error);
      return false;
    }
  }

  // 获取缓存TTL
  async ttl(key: string): Promise<number> {
    if (!this.isReady()) return -1;

    try {
      return await this.client!.ttl(key);
    } catch (error) {
      console.error(`❌ 获取缓存TTL失败 [${key}]:`, error);
      return -1;
    }
  }

  // 关闭连接
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
        console.log('📴 Redis连接已关闭');
      } catch (error) {
        console.error('❌ 关闭Redis连接失败:', error);
      }
    }
  }

  // 缓存键生成器
  generateKey(namespace: string, identifier: string): string {
    return `psychology_test:${namespace}:${identifier}`;
  }

  // 热点数据缓存键
  static readonly KEYS = {
    // 教师相关
    TEACHER_PROFILE: (teacherId: string) => `psychology_test:teacher:profile:${teacherId}`,
    TEACHER_PAPERS: (teacherId: string) => `psychology_test:teacher:papers:${teacherId}`,
    TEACHER_EXAMS: (teacherId: string) => `psychology_test:teacher:exams:${teacherId}`,
    
    // 试卷相关
    PAPER_DETAIL: (paperId: string) => `psychology_test:paper:detail:${paperId}`,
    PAPER_QUESTIONS: (paperId: string) => `psychology_test:paper:questions:${paperId}`,
    
    // 考试相关
    EXAM_DETAIL: (examId: string) => `psychology_test:exam:detail:${examId}`,
    EXAM_PUBLIC: (uuid: string) => `psychology_test:exam:public:${uuid}`,
    EXAM_RESULTS: (examId: string) => `psychology_test:exam:results:${examId}`,
    
    // 统计数据
    STATS_EXAM: (examId: string) => `psychology_test:stats:exam:${examId}`,
    STATS_TEACHER: (teacherId: string) => `psychology_test:stats:teacher:${teacherId}`,
  };

  // 默认TTL设置（秒）
  static readonly TTL = {
    SHORT: 5 * 60,      // 5分钟 - 频繁更新的数据
    MEDIUM: 30 * 60,    // 30分钟 - 一般数据
    LONG: 2 * 60 * 60,  // 2小时 - 较稳定的数据
    VERY_LONG: 24 * 60 * 60, // 24小时 - 很少变化的数据
  };
}

// 创建全局缓存实例
const cache = new CacheManager();

export default cache;
export { CacheManager };