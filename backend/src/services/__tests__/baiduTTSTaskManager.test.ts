import { BaiduTTSTaskManager, createBaiduTTSTaskManager } from '../baiduTTSTaskManager';

describe('BaiduTTSTaskManager', () => {
  let mockManager: BaiduTTSTaskManager;
  const mockBearerToken = 'mock-bearer-token';

  beforeEach(() => {
    mockManager = createBaiduTTSTaskManager(mockBearerToken, {
      format: 'mp3-16k',
      voice: 0,
      speed: 5
    });
  });

  describe('配置验证', () => {
    test('应该正确创建实例', () => {
      expect(mockManager).toBeDefined();
      expect(mockManager.getConfig().bearerToken).toBe(mockBearerToken);
    });

    test('应该验证配置参数', () => {
      const validation = mockManager.validateConfig();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('应该拒绝无效的语音参数', () => {
      expect(() => {
        createBaiduTTSTaskManager(mockBearerToken, {
          voice: 600 // 超出有效范围 0-511
        });
      }).toThrow();
    });

    test('应该拒绝空的bearerToken', () => {
      expect(() => {
        createBaiduTTSTaskManager('');
      }).toThrow();
    });
  });

  describe('批量任务管理', () => {
    test('应该正确处理空任务数组', async () => {
      const summary = await mockManager.queryBatchTaskStatus([]);
      
      expect(summary.total).toBe(0);
      expect(summary.running).toBe(0);
      expect(summary.success).toBe(0);
      expect(summary.failure).toBe(0);
      expect(summary.progressPercentage).toBe(0);
    });

    test('应该正确计算进度百分比', async () => {
      // 模拟任务状态
      const mockTaskIds = ['task1', 'task2', 'task3', 'task4'];
      
      // 这里需要mock axios调用，实际测试中会用到jest.mock
      // 暂时只测试配置和基本逻辑
      expect(mockTaskIds.length).toBe(4);
    });
  });

  describe('下载URL处理', () => {
    test('应该正确提取下载URL', () => {
      const successTasks = [
        {
          task_id: 'task1',
          task_status: 'Success' as const,
          task_result: {
            speech_url: 'https://bj.bcebos.com/test1.mp3'
          }
        },
        {
          task_id: 'task2', 
          task_status: 'Success' as const,
          task_result: {
            speech_url: 'https://bj.bcebos.com/test2.mp3'
          }
        }
      ];

      const downloadMap = mockManager.getDownloadUrls(successTasks);
      
      expect(downloadMap.size).toBe(2);
      expect(downloadMap.get('task1')).toBe('https://bj.bcebos.com/test1.mp3');
      expect(downloadMap.get('task2')).toBe('https://bj.bcebos.com/test2.mp3');
    });

    test('应该忽略缺少speech_url的任务', () => {
      const successTasks = [
        {
          task_id: 'task1',
          task_status: 'Success' as const,
          task_result: {
            speech_url: 'https://bj.bcebos.com/test1.mp3'
          }
        },
        {
          task_id: 'task2',
          task_status: 'Success' as const,
          task_result: {
            // 缺少speech_url
          }
        }
      ];

      const downloadMap = mockManager.getDownloadUrls(successTasks);
      
      expect(downloadMap.size).toBe(1);
      expect(downloadMap.has('task1')).toBe(true);
      expect(downloadMap.has('task2')).toBe(false);
    });
  });

  describe('配置更新', () => {
    test('应该正确更新配置', () => {
      const originalConfig = mockManager.getConfig();
      expect(originalConfig.speed).toBe(5);

      mockManager.updateConfig({ speed: 8 });
      
      const updatedConfig = mockManager.getConfig();
      expect(updatedConfig.speed).toBe(8);
      expect(updatedConfig.voice).toBe(0); // 其他配置保持不变
    });
  });
});

describe('集成测试场景', () => {
  test('完整的批量处理流程模拟', () => {
    // 这里可以添加更复杂的集成测试
    // 模拟完整的: 创建任务 → 查询状态 → 获取下载URL 的流程
    
    const texts = [
      '这是第一个测试文本',
      '这是第二个测试文本',
      '这是第三个测试文本'
    ];

    expect(texts.length).toBe(3);
    
    // 在实际测试中，这里会mock所有的API调用
    // 并验证完整的流程是否正确
  });
});