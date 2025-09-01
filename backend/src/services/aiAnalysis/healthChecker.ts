/**

 * AI服务健康检查器
 * 负责检查AI服务的可用性和连接状态
 */

import axios from 'axios';
import { AI_SERVICE_BASE_URL, DEFAULT_TIMEOUT, buildWebSocketUrl } from './config';
import { ServiceHealthResponse, WebSocketHealthResponse, NetworkDiagnosticsResponse } from './types';

export class HealthChecker {
  /**
   * 检查AI服务可用性（健康检查）
   */
  async checkServiceHealth(): Promise<ServiceHealthResponse> {
    try {
      console.log('[AI分析] 检查服务可用性...');
      const response = await axios.get(`${AI_SERVICE_BASE_URL}/api/health`, {
        timeout: DEFAULT_TIMEOUT.HEALTH_CHECK,
      });
      
      if (response.status === 200) {
        console.log('[AI分析] 服务健康检查通过');
        return { available: true };
      } else {
        return { available: false, error: '服务健康检查失败' };
      }
    } catch (error: any) {
      console.warn('[AI分析] 服务不可用:', error.message);
      return { 
        available: false, 
        error: error.code === 'ECONNREFUSED' ? '服务未启动' : error.message 
      };
    }
  }

  /**
   * 基础健康检查
   */
  async checkHealth(): Promise<boolean> {
    try {
      console.log(`[AI分析] 开始健康检查: ${AI_SERVICE_BASE_URL}/api/health`);
      const response = await axios.get(`${AI_SERVICE_BASE_URL}/api/health`, {
        timeout: DEFAULT_TIMEOUT.HEALTH_CHECK,
      });
      console.log(`[AI分析] 健康检查成功: ${response.status} ${response.statusText}`);
      return response.status === 200;
    } catch (error: any) {
      console.error('[AI分析] 健康检查失败:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout,
          baseURL: AI_SERVICE_BASE_URL,
        },
        isTimeout: error.code === 'ECONNABORTED',
        isNetworkError: error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND',
      });
      return false;
    }
  }

  /**
   * 检查WebSocket连接可用性 - 增强版本 
   * 提供更详细的诊断信息和错误分析
   */
  async checkWebSocketHealth(): Promise<WebSocketHealthResponse> {
    const websocketUrl = buildWebSocketUrl(AI_SERVICE_BASE_URL);
    const startTime = Date.now();
    
    const diagnostics = {
      httpReachable: false,
      configValid: false,
      responseTime: 0,
      serviceInfo: null,
      networkPath: '',
      urlComponents: {
        protocol: '',
        hostname: '',
        port: '',
        path: ''
      },
      troubleshooting: [] as string[]
    };

    try {
      // 1. 验证配置有效性并解析URL组件
      if (!AI_SERVICE_BASE_URL || AI_SERVICE_BASE_URL.trim() === '') {
        return {
          available: false,
          websocketUrl,
          error: 'AI_SERVICE_URL环境变量未配置或为空',
          diagnostics: {
            ...diagnostics,
            troubleshooting: [
              '在 .env 文件中设置 AI_SERVICE_URL=http://localhost:5000',
              '重启后端服务以加载新的环境变量',
              '确认AI服务的实际IP地址和端口'
            ]
          }
        };
      }

      try {
        const parsedUrl = new URL(AI_SERVICE_BASE_URL);
        diagnostics.configValid = true;
        diagnostics.urlComponents = {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
          path: parsedUrl.pathname
        };
        diagnostics.networkPath = `${parsedUrl.protocol}//${parsedUrl.hostname}:${diagnostics.urlComponents.port}`;
      } catch (urlError) {
        return {
          available: false,
          websocketUrl,
          error: `无效的AI服务URL格式: ${AI_SERVICE_BASE_URL}`,
          diagnostics: {
            ...diagnostics,
            troubleshooting: [
              '检查AI_SERVICE_URL格式是否正确 (如: http://192.168.1.100:5000)',
              '确保URL包含协议 (http:// 或 https://)',
              '验证IP地址和端口号是否正确'
            ]
          }
        };
      }

      // 2. 尝试HTTP连接测试
      console.log(`[AI分析] WebSocket健康检查 - 测试HTTP连接: ${AI_SERVICE_BASE_URL}/api/health`);
      
      try {
        const httpResponse = await axios.get(`${AI_SERVICE_BASE_URL}/api/health`, {
          timeout: DEFAULT_TIMEOUT.WEBSOCKET_CHECK,
          headers: {
            'User-Agent': 'Psychology-Test-Backend/WebSocket-Health-Check',
          }
        });

        diagnostics.httpReachable = true;
        diagnostics.responseTime = Date.now() - startTime;
        diagnostics.serviceInfo = httpResponse.data;

        console.log(`[AI分析] HTTP连接成功 - 响应时间: ${diagnostics.responseTime}ms`);
        
        return {
          available: true,
          websocketUrl,
          diagnostics: {
            ...diagnostics,
            troubleshooting: [
              '✅ HTTP服务可达，WebSocket应该可用',
              '如WebSocket仍有问题，检查防火墙设置',
              `连接地址: ${websocketUrl}`
            ]
          }
        };
        
      } catch (httpError: any) {
        const responseTime = Date.now() - startTime;
        
        // 分析具体的HTTP错误
        let troubleshooting: string[] = [];
        let errorMessage = '';

        if (httpError.code === 'ECONNREFUSED') {
          errorMessage = 'AI服务未运行或端口未开放';
          troubleshooting = [
            `确认AI服务是否在 ${diagnostics.networkPath} 上运行`,
            '检查AI服务进程状态: python app_lan.py',
            '验证端口是否被其他程序占用',
            '检查防火墙是否阻塞了端口访问'
          ];
        } else if (httpError.code === 'ENOTFOUND') {
          errorMessage = 'AI服务主机地址无法解析';
          troubleshooting = [
            `验证主机地址 ${diagnostics.urlComponents.hostname} 是否正确`,
            '如使用IP地址，确认设备在同一网络中',
            '如使用域名，检查DNS解析是否正确',
            '尝试使用ping命令测试网络连通性'
          ];
        } else if (httpError.code === 'ECONNABORTED') {
          errorMessage = `连接超时 (${DEFAULT_TIMEOUT.WEBSOCKET_CHECK}ms)`;
          troubleshooting = [
            '网络延迟过高或服务响应缓慢',
            '检查网络连接质量',
            'AI服务可能正在处理大量请求',
            '尝试增加超时时间或稍后重试'
          ];
        } else if (httpError.response?.status === 404) {
          errorMessage = 'AI服务健康检查端点不存在';
          troubleshooting = [
            'AI服务版本可能不兼容',
            '检查AI服务是否完整安装',
            '确认健康检查端点 /api/health 是否存在',
            '查看AI服务日志获取更多信息'
          ];
        } else {
          errorMessage = `HTTP请求失败: ${httpError.message}`;
          troubleshooting = [
            `HTTP状态码: ${httpError.response?.status || '未知'}`,
            `错误代码: ${httpError.code || '未知'}`,
            '查看网络和服务配置',
            '检查AI服务日志获取详细错误信息'
          ];
        }

        return {
          available: false,
          websocketUrl,
          error: errorMessage,
          diagnostics: {
            ...diagnostics,
            responseTime,
            troubleshooting: [
              `🔍 问题类型: ${errorMessage}`,
              `📊 响应时间: ${responseTime}ms`,
              `🌐 目标地址: ${diagnostics.networkPath}`,
              '',
              '💡 解决建议:',
              ...troubleshooting
            ]
          }
        };
      }

    } catch (error: any) {
      console.error('[AI分析] WebSocket健康检查异常:', error);
      return {
        available: false,
        websocketUrl,
        error: `健康检查异常: ${error.message}`,
        diagnostics: {
          ...diagnostics,
          troubleshooting: [
            '系统内部错误',
            '检查服务配置和依赖',
            '查看应用程序日志',
            `错误详情: ${error.message}`
          ]
        }
      };
    }
  }

  /**
   * 综合网络诊断
   * 提供AI服务连接的完整诊断信息
   */
  async networkDiagnostics(): Promise<NetworkDiagnosticsResponse> {
    const httpUrl = `${AI_SERVICE_BASE_URL}/api/health`;
    const websocketUrl = buildWebSocketUrl(AI_SERVICE_BASE_URL);
    const startTime = Date.now();

    const diagnostics: NetworkDiagnosticsResponse['diagnostics'] = {
      networkInfo: {
        configuredUrl: AI_SERVICE_BASE_URL,
        protocol: 'unknown'
      },
      troubleshooting: []
    };

    try {
      // URL解析和配置验证
      const parsedUrl = new URL(AI_SERVICE_BASE_URL);
      diagnostics.networkInfo = {
        configuredUrl: AI_SERVICE_BASE_URL,
        resolvedHost: parsedUrl.hostname,
        actualPort: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
        protocol: parsedUrl.protocol.replace(':', '')
      };

      // HTTP连接测试
      let httpConnectable = false;
      let websocketConnectable = false;
      let pingConnectable = false;

      try {
        const httpResponse = await axios.get(httpUrl, {
          timeout: DEFAULT_TIMEOUT.HEALTH_CHECK,
        });
        
        diagnostics.httpStatus = httpResponse.status;
        diagnostics.httpResponseTime = Date.now() - startTime;
        httpConnectable = httpResponse.status === 200;
        
        console.log(`[AI分析] HTTP诊断成功: ${httpResponse.status} - ${diagnostics.httpResponseTime}ms`);
      } catch (httpError: any) {
        diagnostics.httpResponseTime = Date.now() - startTime;
        diagnostics.httpStatus = httpError.response?.status;
        
        console.warn(`[AI分析] HTTP诊断失败: ${httpError.message}`);
        
        // 记录HTTP错误用于诊断
        if (httpError.code === 'ECONNREFUSED') {
          diagnostics.troubleshooting.push('HTTP: 连接被拒绝，服务可能未运行');
        } else if (httpError.code === 'ENOTFOUND') {
          diagnostics.troubleshooting.push('HTTP: 主机地址无法解析');
        } else if (httpError.code === 'ECONNABORTED') {
          diagnostics.troubleshooting.push('HTTP: 连接超时');
        } else {
          diagnostics.troubleshooting.push(`HTTP: ${httpError.message}`);
        }
      }

      // WebSocket连接模拟测试（基于HTTP结果推断）
      if (httpConnectable) {
        websocketConnectable = true;
        diagnostics.troubleshooting.push('WebSocket: 基于HTTP成功推断可用');
      } else {
        if (!diagnostics.websocketError) {
          diagnostics.websocketError = 'WebSocket不可用，HTTP连接失败';
        }
        diagnostics.troubleshooting.push('WebSocket: HTTP不通，WebSocket也不可用');
      }

      // Ping测试（模拟）
      pingConnectable = httpConnectable; // 简化实现

      // 生成诊断建议
      if (!httpConnectable) {
        diagnostics.troubleshooting.push(
          '',
          '🔧 故障排除建议:',
          `1. 检查AI服务是否在 ${diagnostics.networkInfo.resolvedHost}:${diagnostics.networkInfo.actualPort} 运行`,
          '2. 验证网络连接和防火墙设置',
          '3. 确认AI服务配置是否正确',
          '4. 查看AI服务日志获取详细信息'
        );
      } else {
        diagnostics.troubleshooting.push(
          '',
          '✅ 连接状态良好:',
          `HTTP响应时间: ${diagnostics.httpResponseTime}ms`,
          'WebSocket连接预期可用'
        );
      }

      return {
        available: httpConnectable && websocketConnectable,
        httpUrl,
        websocketUrl,
        configurationValid: true,
        connectivity: {
          http: httpConnectable,
          websocket: websocketConnectable,
          ping: pingConnectable
        },
        diagnostics
      };

    } catch (error: any) {
      return {
        available: false,
        httpUrl,
        websocketUrl,
        configurationValid: false,
        connectivity: {
          http: false,
          websocket: false,
          ping: false
        },
        error: `诊断失败: ${error.message}`,
        diagnostics: {
          ...diagnostics,
          troubleshooting: [
            '配置错误或系统异常',
            `错误: ${error.message}`,
            '检查AI_SERVICE_URL环境变量',
            '验证URL格式是否正确'
          ]
        }
      };
    }
  }
}